import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../utils/jwt';
import { userService } from '../services/userService';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AuthenticationError, AuthorizationError } from '../utils/errors';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        isActive: boolean;
        isEmailVerified: boolean;
        roles: string[];
        permissions: string[];
      };
      sessionId?: string;
    }
  }
}

export const optionalAuthenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = jwtService.extractTokenFromHeader(authHeader);

    if (!token) {
      // No token provided - continue without authentication
      return next();
    }

    // Verify token
    const payload = jwtService.verifyAccessToken(token);

    // Check if token is blacklisted
    const isBlacklisted = await jwtService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      // Token is blacklisted - continue without authentication
      return next();
    }

    // Check if user tokens are revoked
    const areTokensRevoked = await jwtService.areUserTokensRevoked(payload.userId);
    if (areTokensRevoked) {
      // Tokens revoked - continue without authentication
      return next();
    }

    // Find user with roles and permissions
    const user = await userService.findWithRoles(payload.userId);
    if (!user || !user.isActive) {
      // User not found or inactive - continue without authentication
      return next();
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      roles: (user as any).roles || [],
      permissions: [],
    };

    req.sessionId = payload.sessionId;

    // Update session last activity
    try {
      await prisma.userSession.update({
        where: { sessionToken: payload.sessionId },
        data: { lastActivityAt: new Date() },
      });
    } catch (error) {
      logger.debug('Failed to update session activity:', error);
    }

    next();
  } catch (error) {
    // Authentication failed - continue without authentication
    logger.debug('Optional authentication failed:', error);
    next();
  }
};

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = jwtService.extractTokenFromHeader(authHeader);

    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    // Verify token
    const payload = jwtService.verifyAccessToken(token);

    // Check if token is blacklisted
    const isBlacklisted = await jwtService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      throw new AuthenticationError('Token has been revoked');
    }

    // Check if user tokens are revoked
    const areTokensRevoked = await jwtService.areUserTokensRevoked(payload.userId);
    if (areTokensRevoked) {
      throw new AuthenticationError('User tokens have been revoked');
    }

    // Find user with roles and permissions
    const userWithRoles = await userService.findWithRoles(payload.userId);
    if (!userWithRoles) {
      throw new AuthenticationError('User not found');
    }

    // Check if user is active
    if (!userWithRoles.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    // Verify session is still active
    const session = await prisma.userSession.findUnique({
      where: { 
        sessionToken: payload.sessionId,
        isActive: true,
      },
    });

    if (!session || session.userId !== payload.userId) {
      throw new AuthenticationError('Invalid session');
    }

    // Check if session has expired
    if (session.expiresAt < new Date()) {
      await prisma.userSession.update({
        where: { id: session.id },
        data: { isActive: false },
      });
      throw new AuthenticationError('Session has expired');
    }

    // Update session activity
    await prisma.userSession.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    });

    // Extract roles and permissions
    const roles = userWithRoles.roles.map(ur => ur.role.name);
    const permissions = new Set<string>();

    for (const userRole of userWithRoles.roles) {
      for (const rolePermission of userRole.role.permissions) {
        permissions.add(rolePermission.permission.name);
      }
    }

    // Attach user info to request
    req.user = {
      id: userWithRoles.id,
      email: userWithRoles.email,
      firstName: userWithRoles.firstName,
      lastName: userWithRoles.lastName,
      isActive: userWithRoles.isActive,
      isEmailVerified: userWithRoles.isEmailVerified,
      roles,
      permissions: Array.from(permissions),
    };

    req.sessionId = payload.sessionId;

    next();
  } catch (error) {
    logger.debug('Authentication failed:', error);
    
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        message: error.message,
        code: error.code,
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Authentication failed',
        code: 'AUTHENTICATION_ERROR',
      });
    }
  }
};

export const authorize = (requiredPermissions: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('User not authenticated');
      }

      const permissions = Array.isArray(requiredPermissions) 
        ? requiredPermissions 
        : [requiredPermissions];

      const hasPermission = permissions.every(permission => 
        req.user!.permissions.includes(permission)
      );

      if (!hasPermission) {
        logger.warn(`Authorization failed for user ${req.user.email}: required ${permissions.join(', ')}, has ${req.user.permissions.join(', ')}`);
        throw new AuthorizationError(`Insufficient permissions. Required: ${permissions.join(', ')}`);
      }

      next();
    } catch (error) {
      logger.debug('Authorization failed:', error);
      
      if (error instanceof AuthenticationError) {
        res.status(401).json({
          success: false,
          message: error.message,
          code: error.code,
        });
      } else if (error instanceof AuthorizationError) {
        res.status(403).json({
          success: false,
          message: error.message,
          code: error.code,
        });
      } else {
        res.status(403).json({
          success: false,
          message: 'Authorization failed',
          code: 'AUTHORIZATION_ERROR',
        });
      }
    }
  };
};

export const requireRole = (requiredRoles: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('User not authenticated');
      }

      const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
      const hasRole = roles.some(role => req.user!.roles.includes(role));

      if (!hasRole) {
        logger.warn(`Role authorization failed for user ${req.user.email}: required ${roles.join(', ')}, has ${req.user.roles.join(', ')}`);
        throw new AuthorizationError(`Insufficient role. Required: ${roles.join(', ')}`);
      }

      next();
    } catch (error) {
      logger.debug('Role authorization failed:', error);
      
      if (error instanceof AuthenticationError) {
        res.status(401).json({
          success: false,
          message: error.message,
          code: error.code,
        });
      } else if (error instanceof AuthorizationError) {
        res.status(403).json({
          success: false,
          message: error.message,
          code: error.code,
        });
      } else {
        res.status(403).json({
          success: false,
          message: 'Role authorization failed',
          code: 'AUTHORIZATION_ERROR',
        });
      }
    }
  };
};

export const requireEmailVerified = (req: Request, res: Response, next: NextFunction): void => {
  try {
    if (!req.user) {
      throw new AuthenticationError('User not authenticated');
    }

    if (!req.user.isEmailVerified) {
      throw new AuthorizationError('Email verification required');
    }

    next();
  } catch (error) {
    logger.debug('Email verification check failed:', error);
    
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        message: error.message,
        code: error.code,
      });
    } else if (error instanceof AuthorizationError) {
      res.status(403).json({
        success: false,
        message: error.message,
        code: error.code,
      });
    } else {
      res.status(403).json({
        success: false,
        message: 'Email verification required',
        code: 'EMAIL_VERIFICATION_REQUIRED',
      });
    }
  }
};

export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = jwtService.extractTokenFromHeader(authHeader);

    if (!token) {
      // No token provided, continue without authentication
      return next();
    }

    // Try to authenticate, but don't fail if it doesn't work
    try {
      const payload = jwtService.verifyAccessToken(token);

      // Check if token is blacklisted
      const isBlacklisted = await jwtService.isTokenBlacklisted(token);
      if (!isBlacklisted) {
        const userWithRoles = await userService.findWithRoles(payload.userId);
        
        if (userWithRoles && userWithRoles.isActive) {
          const roles = userWithRoles.roles.map(ur => ur.role.name);
          const permissions = new Set<string>();

          for (const userRole of userWithRoles.roles) {
            for (const rolePermission of userRole.role.permissions) {
              permissions.add(rolePermission.permission.name);
            }
          }

          req.user = {
            id: userWithRoles.id,
            email: userWithRoles.email,
            firstName: userWithRoles.firstName,
            lastName: userWithRoles.lastName,
            isActive: userWithRoles.isActive,
            isEmailVerified: userWithRoles.isEmailVerified,
            roles,
            permissions: Array.from(permissions),
          };

          req.sessionId = payload.sessionId;
        }
      }
    } catch (error) {
      // Authentication failed, but we continue anyway for optional auth
      logger.debug('Optional authentication failed:', error);
    }

    next();
  } catch (error) {
    logger.error('Optional authentication middleware error:', error);
    next(); // Continue even if there's an error
  }
};

export const requireSelf = (userIdParam = 'id') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('User not authenticated');
      }

      const targetUserId = req.params[userIdParam];
      const isSelf = req.user.id === targetUserId;
      const hasAdminPermission = req.user.permissions.includes('users.read') || 
                                req.user.permissions.includes('users.update');

      if (!isSelf && !hasAdminPermission) {
        throw new AuthorizationError('Can only access your own resources');
      }

      next();
    } catch (error) {
      logger.debug('Self authorization failed:', error);
      
      if (error instanceof AuthenticationError) {
        res.status(401).json({
          success: false,
          message: error.message,
          code: error.code,
        });
      } else if (error instanceof AuthorizationError) {
        res.status(403).json({
          success: false,
          message: error.message,
          code: error.code,
        });
      } else {
        res.status(403).json({
          success: false,
          message: 'Authorization failed',
          code: 'AUTHORIZATION_ERROR',
        });
      }
    }
  };
};