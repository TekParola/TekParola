import { Request, Response, NextFunction } from 'express';
import { applicationService } from '../services/applicationService';
import { auditService } from '../services/auditService';
import { logger } from '../utils/logger';
import { AuthenticationError, ValidationError, RateLimitError } from '../utils/errors';
import { redisClient } from '../config/redis';

declare global {
  namespace Express {
    interface Request {
      application?: {
        id: string;
        name: string;
        displayName: string;
        clientId: string;
        isActive: boolean;
        scopes: string[];
        allowedOrigins: string[];
        tokenLifetime: number;
        refreshTokenLifetime: number;
      };
      apiKey?: {
        id: string;
        keyId: string;
        name: string;
        permissions: string[];
        isActive: boolean;
        expiresAt?: Date;
        rateLimit?: number;
        rateLimitWindow?: number;
      };
    }
  }
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export class ApiAuthMiddleware {
  /**
   * Middleware to authenticate API requests using API keys
   */
  static authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const apiKey = ApiAuthMiddleware.extractApiKey(req);
      
      if (!apiKey) {
        throw new AuthenticationError('API key is required');
      }

      // Validate API key and get application
      const application = await applicationService.validateApiKey(apiKey);
      
      // Get API key details
      const apiKeyDetails = application.apiKeys.find(key => key.keyId === apiKey);
      if (!apiKeyDetails) {
        throw new AuthenticationError('Invalid API key');
      }

      // Check CORS if Origin header is present
      const origin = req.get('Origin');
      if (origin && application.allowedOrigins.length > 0) {
        if (!application.allowedOrigins.includes(origin) && !application.allowedOrigins.includes('*')) {
          throw new ValidationError('Origin not allowed');
        }
      }

      // Attach application and API key info to request
      req.application = {
        id: application.id,
        name: application.name,
        displayName: application.displayName,
        clientId: application.clientId,
        isActive: application.isActive,
        scopes: application.scopes,
        allowedOrigins: application.allowedOrigins,
        tokenLifetime: application.tokenLifetime,
        refreshTokenLifetime: application.refreshTokenLifetime,
      };

      req.apiKey = {
        id: apiKeyDetails.id,
        keyId: apiKeyDetails.keyId,
        name: apiKeyDetails.name,
        permissions: apiKeyDetails.permissions,
        isActive: apiKeyDetails.isActive,
        expiresAt: apiKeyDetails.expiresAt ?? undefined,
        rateLimit: apiKeyDetails.rateLimit,
        rateLimitWindow: apiKeyDetails.rateLimitWindow,
      };

      // Log API access
      await auditService.log({
        applicationId: application.id,
        action: 'api_access',
        resource: 'api',
        resourceId: apiKeyDetails.id,
        details: {
          endpoint: `${req.method} ${req.path}`,
          userAgent: req.get('User-Agent'),
          origin: origin,
        },
        ipAddress: req.ip || '0.0.0.0',
        userAgent: req.get('User-Agent') || 'Unknown',
        success: true,
      });

      next();
    } catch (error) {
      // Log failed API access attempt
      try {
        await auditService.log({
          action: 'api_access_failed',
          resource: 'api',
          details: {
            endpoint: `${req.method} ${req.path}`,
            error: error instanceof Error ? error.message : 'Unknown error',
            userAgent: req.get('User-Agent'),
            origin: req.get('Origin'),
          },
          ipAddress: req.ip || '0.0.0.0',
          userAgent: req.get('User-Agent') || 'Unknown',
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      } catch (auditError) {
        logger.error('Failed to log API access attempt:', auditError);
      }

      next(error);
    }
  };

  /**
   * Middleware for API key rate limiting
   */
  static rateLimit = (defaultConfig?: RateLimitConfig) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.apiKey) {
          // If no API key is present, skip rate limiting
          return next();
        }

        // Use API key specific rate limits or default config
        const windowMs = req.apiKey.rateLimitWindow ? req.apiKey.rateLimitWindow * 1000 : 
                        defaultConfig?.windowMs || 60000; // 1 minute default
        const maxRequests = req.apiKey.rateLimit || defaultConfig?.maxRequests || 1000;

        const key = `rate_limit:${req.apiKey.keyId}`;
        const window = Math.floor(Date.now() / windowMs);
        const windowKey = `${key}:${window}`;

        // Get current request count for this window
        const current = await redisClient.incr(windowKey);
        
        if (current === 1) {
          // Set expiration for the first request in this window
          await redisClient.expire(windowKey, Math.ceil(windowMs / 1000));
        }

        // Check if rate limit exceeded
        if (current > maxRequests) {
          // Get time until window resets
          const ttl = await redisClient.ttl(windowKey);
          const resetTime = new Date(Date.now() + ttl * 1000);

          // Log rate limit exceeded
          await auditService.log({
            applicationId: req.application?.id,
            action: 'rate_limit_exceeded',
            resource: 'api',
            resourceId: req.apiKey.id,
            details: {
              endpoint: `${req.method} ${req.path}`,
              currentRequests: current,
              maxRequests,
              windowMs,
              resetTime: resetTime.toISOString(),
            },
            ipAddress: req.ip || '0.0.0.0',
            userAgent: req.get('User-Agent') || 'Unknown',
            success: false,
          });

          // Set rate limit headers
          res.set({
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetTime.toISOString(),
            'Retry-After': ttl.toString(),
          });

          throw new RateLimitError(`Rate limit exceeded. Try again in ${ttl} seconds.`);
        }

        // Set rate limit headers
        const remaining = Math.max(0, maxRequests - current);
        res.set({
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': new Date(Date.now() + windowMs).toISOString(),
        });

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * Middleware to check API key permissions
   */
  static requirePermission = (permission: string, resource?: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.apiKey) {
          throw new AuthenticationError('API key authentication required');
        }

        // Check if API key has the required permission
        const hasPermission = req.apiKey.permissions.some(perm => {
          if (resource) {
            return perm === `${permission}:${resource}` || perm === `${permission}:*` || perm === '*';
          }
          return perm === permission || perm === '*';
        });

        if (!hasPermission) {
          logger.warn(`API key ${req.apiKey.keyId} denied access to ${permission}${resource ? `:${resource}` : ''}`);
          throw new ValidationError(`Insufficient permissions. Required: ${permission}${resource ? `:${resource}` : ''}`);
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * Middleware to check API key scopes
   */
  static requireScope = (scope: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.application) {
          throw new AuthenticationError('Application authentication required');
        }

        if (!req.application.scopes.includes(scope) && !req.application.scopes.includes('*')) {
          logger.warn(`Application ${req.application.clientId} denied access to scope ${scope}`);
          throw new ValidationError(`Insufficient scope. Required: ${scope}`);
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * Middleware to validate CORS for API requests
   */
  static cors = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const origin = req.get('Origin');
      
      if (req.application && origin) {
        const allowedOrigins = req.application.allowedOrigins;
        
        if (allowedOrigins.length > 0) {
          if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
            res.set('Access-Control-Allow-Origin', origin);
          } else {
            throw new ValidationError('CORS: Origin not allowed');
          }
        } else {
          // If no origins specified, allow all
          res.set('Access-Control-Allow-Origin', '*');
        }

        res.set({
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400', // 24 hours
        });
      }

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Extract API key from request headers or query parameters
   */
  private static extractApiKey(req: Request): string | null {
    // Try X-API-Key header first
    let apiKey = req.get('X-API-Key');
    
    if (!apiKey) {
      // Try Authorization header with "Bearer" or "ApiKey" scheme
      const authHeader = req.get('Authorization');
      if (authHeader) {
        if (authHeader.startsWith('Bearer ')) {
          apiKey = authHeader.substring(7);
        } else if (authHeader.startsWith('ApiKey ')) {
          apiKey = authHeader.substring(7);
        }
      }
    }

    // Removed query parameter support for security reasons
    // API keys should only be sent via headers

    return apiKey || null;
  }
}

// Convenience exports
export const authenticateApiKey = ApiAuthMiddleware.authenticate;
export const apiRateLimit = ApiAuthMiddleware.rateLimit;
export const requireApiPermission = ApiAuthMiddleware.requirePermission;
export const requireApiScope = ApiAuthMiddleware.requireScope;
export const apiCors = ApiAuthMiddleware.cors;