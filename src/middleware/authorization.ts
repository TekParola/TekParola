import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';

export const authorize = (roles: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      // If no specific roles required, just check if user is authenticated
      if (roles.length === 0) {
        return next();
      }

      // Check if user has any of the required roles
      const userRoles = req.user.roles || [];
      const hasRequiredRole = userRoles.some((userRole: any) => 
        roles.includes(userRole.name) || 
        roles.includes(userRole.role?.name)
      );

      if (!hasRequiredRole) {
        logger.warn(`Access denied for user ${req.user.id}. Required roles: ${roles.join(', ')}, User roles: ${userRoles.map((r: any) => r.name || r.role?.name).join(', ')}`);
        throw new ForbiddenError('Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const requirePermission = (permission: string, resource?: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      // Extract all permissions from user roles
      const userPermissions: Array<{name: string, resource?: string}> = [];
      
      if (req.user.roles) {
        for (const userRole of req.user.roles as any[]) {
          const rolePermissions = userRole.role?.permissions || userRole.permissions || [];
          for (const rolePermission of rolePermissions) {
            const perm = rolePermission.permission || rolePermission;
            userPermissions.push({
              name: perm.name,
              resource: perm.resource,
            });
          }
        }
      }

      // Check if user has the required permission
      const hasPermission = userPermissions.some(userPerm => {
        const permissionMatch = userPerm.name === permission;
        const resourceMatch = !resource || userPerm.resource === resource || userPerm.resource === '*';
        return permissionMatch && resourceMatch;
      });

      if (!hasPermission) {
        logger.warn(`Permission denied for user ${req.user.id}. Required permission: ${permission}${resource ? ` on resource: ${resource}` : ''}`);
        throw new ForbiddenError('Permission denied');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const requireSuperAdmin = () => {
  return authorize(['super_admin']);
};

export const requireAdmin = () => {
  return authorize(['admin', 'super_admin']);
};

export const requireOwnershipOrAdmin = (userIdParam: string = 'id') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const targetUserId = req.params[userIdParam];
      const currentUserId = req.user.id;

      // Check if user is accessing their own resource
      if (targetUserId === currentUserId) {
        return next();
      }

      // Check if user has admin privileges
      const userRoles = req.user.roles || [];
      const isAdmin = userRoles.some((userRole: any) => 
        ['admin', 'super_admin'].includes(userRole.name) || 
        ['admin', 'super_admin'].includes(userRole.role?.name)
      );

      if (!isAdmin) {
        throw new ForbiddenError('You can only access your own resources or need admin privileges');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};