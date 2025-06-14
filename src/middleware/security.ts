import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Middleware to enforce HTTPS in production
 */
export const enforceHTTPS = (req: Request, res: Response, next: NextFunction): void => {
  // Only enforce in production
  if (config.node_env !== 'production') {
    return next();
  }

  // Check if request is already secure
  const isSecure = req.secure || 
                   req.get('X-Forwarded-Proto') === 'https' || 
                   req.get('X-Forwarded-SSL') === 'on';

  if (!isSecure) {
    logger.warn('Non-HTTPS request in production', {
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Redirect to HTTPS
    const httpsUrl = `https://${req.get('Host')}${req.url}`;
    return res.redirect(301, httpsUrl);
  }

  next();
};

/**
 * Middleware to set additional security headers
 */
export const additionalSecurityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS filtering
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Feature policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Expect-CT header for certificate transparency
  if (config.node_env === 'production') {
    res.setHeader('Expect-CT', 'max-age=86400, enforce');
  }

  next();
};

/**
 * Middleware to block requests from known bad user agents
 */
export const blockMaliciousRequests = (req: Request, res: Response, next: NextFunction): void => {
  const userAgent = req.get('User-Agent') || '';
  
  // List of known bad user agent patterns
  const blockedPatterns = [
    /sqlmap/i,
    /nmap/i,
    /nikto/i,
    /acunetix/i,
    /masscan/i,
    /zgrab/i,
    /gobuster/i,
    /dirb/i
  ];

  // Check if user agent matches any blocked pattern
  const isBlocked = blockedPatterns.some(pattern => pattern.test(userAgent));
  
  if (isBlocked) {
    logger.warn('Blocked malicious request', {
      userAgent,
      ip: req.ip,
      url: req.url,
      method: req.method
    });
    
    res.status(403).json({
      error: 'Forbidden',
      message: 'Request blocked'
    });
    return;
  }

  next();
};

/**
 * Middleware to validate request size
 */
export const requestSizeLimit = (req: Request, res: Response, next: NextFunction): void => {
  const contentLength = parseInt(req.get('Content-Length') || '0', 10);
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (contentLength > maxSize) {
    logger.warn('Request size too large', {
      contentLength,
      maxSize,
      ip: req.ip,
      url: req.url
    });
    
    res.status(413).json({
      error: 'Payload Too Large',
      message: 'Request size exceeds limit'
    });
    return;
  }

  next();
};

/**
 * Middleware to add security-related response headers
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Remove server header
  res.removeHeader('X-Powered-By');
  
  // Add security headers
  additionalSecurityHeaders(req, res, next);
};