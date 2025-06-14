import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { UnauthorizedError } from '../utils/errors';

// Remove the express-session augmentation as we're using stateless CSRF protection

const CSRF_TOKEN_LENGTH = 32;
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const CSRF_COOKIE_NAME = 'csrf-token';

/**
 * Generate a cryptographically secure CSRF token
 */
function generateToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Middleware to generate and validate CSRF tokens
 * Uses the double-submit cookie pattern for stateless CSRF protection
 */
export function csrfProtection() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    // Skip CSRF for API key authenticated requests
    if (req.headers['x-api-key']) {
      return next();
    }

    // Skip CSRF for whitelisted paths (e.g., login, registration)
    const whitelistedPaths = [
      '/api/v1/auth/login',
      '/api/v1/auth/register',
      '/api/v1/auth/refresh-token',
      '/api/v1/auth/magic-link/request',
      '/api/v1/auth/password-reset/request',
      '/api/external',
      '/sso/token',
      '/health',
      '/metrics'
    ];

    if (whitelistedPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Get CSRF token from header or body
    const token = req.headers[CSRF_HEADER_NAME.toLowerCase()] as string || 
                  req.body?._csrf || 
                  req.query?._csrf as string;

    // Get CSRF token from cookie
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];

    if (!token || !cookieToken) {
      logger.warn('CSRF token missing', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        hasHeaderToken: !!token,
        hasCookieToken: !!cookieToken
      });
      throw new UnauthorizedError('CSRF token missing');
    }

    // Validate tokens match (double-submit cookie pattern)
    if (token !== cookieToken) {
      logger.warn('CSRF token mismatch', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      throw new UnauthorizedError('Invalid CSRF token');
    }

    next();
  };
}

/**
 * Middleware to generate CSRF token for responses
 */
export function csrfTokenGenerator() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Generate new token if it doesn't exist
    if (!req.cookies?.[CSRF_COOKIE_NAME]) {
      const token = generateToken();
      
      // Set secure cookie with token
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // Must be accessible by JavaScript
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      // Also expose token in response for initial requests
      res.locals.csrfToken = token;
    } else {
      // Use existing token
      res.locals.csrfToken = req.cookies[CSRF_COOKIE_NAME];
    }

    // Add helper method to response
    res.locals.getCSRFToken = () => res.locals.csrfToken;

    next();
  };
}

/**
 * Endpoint to get CSRF token
 */
export function csrfTokenEndpoint(req: Request, res: Response) {
  const token = res.locals.csrfToken || req.cookies?.[CSRF_COOKIE_NAME] || generateToken();
  
  // Ensure cookie is set
  if (!req.cookies?.[CSRF_COOKIE_NAME]) {
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });
  }

  res.json({ csrfToken: token });
}