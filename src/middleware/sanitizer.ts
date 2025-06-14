import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * HTML entities that need to be escaped
 */
const htmlEntities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * Escape HTML entities in a string
 */
function escapeHtml(str: string): string {
  return str.replace(/[&<>"'/]/g, (char) => htmlEntities[char] || char);
}

/**
 * Sanitize a value recursively
 */
function sanitizeValue(value: any): any {
  if (typeof value === 'string') {
    // Remove any script tags and their content
    value = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove any event handlers
    value = value.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    
    // Remove javascript: protocol
    value = value.replace(/javascript:/gi, '');
    
    // Escape HTML entities
    return escapeHtml(value.trim());
  }
  
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  
  if (value && typeof value === 'object') {
    const sanitized: Record<string, any> = {};
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        sanitized[key] = sanitizeValue(value[key]);
      }
    }
    return sanitized;
  }
  
  return value;
}

/**
 * Middleware to sanitize request data to prevent XSS attacks
 */
export function sanitizeInput() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip sanitization for file uploads
    if (req.is('multipart/form-data')) {
      return next();
    }
    
    // Sanitize body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeValue(req.body);
    }
    
    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeValue(req.query) as any;
    }
    
    // Sanitize URL parameters
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeValue(req.params) as any;
    }
    
    // Log if any sanitization was performed (for security monitoring)
    const originalBody = JSON.stringify(req.body);
    const sanitizedBody = JSON.stringify(sanitizeValue(req.body));
    
    if (originalBody !== sanitizedBody) {
      logger.warn('Input sanitization performed', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('user-agent'),
      });
    }
    
    next();
  };
}

/**
 * Sanitize output data before sending response
 */
export function sanitizeOutput(data: any): any {
  if (typeof data === 'string') {
    return escapeHtml(data);
  }
  
  if (Array.isArray(data)) {
    return data.map(sanitizeOutput);
  }
  
  if (data && typeof data === 'object') {
    const sanitized: Record<string, any> = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        // Don't sanitize certain fields that may contain HTML
        if (['htmlContent', 'template', 'content'].includes(key)) {
          sanitized[key] = data[key];
        } else {
          sanitized[key] = sanitizeOutput(data[key]);
        }
      }
    }
    return sanitized;
  }
  
  return data;
}

/**
 * Validate and sanitize email addresses
 */
export function sanitizeEmail(email: string): string {
  // Remove any HTML tags
  email = email.replace(/<[^>]*>/g, '');
  
  // Trim whitespace
  email = email.trim().toLowerCase();
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }
  
  return email;
}

/**
 * Sanitize file names to prevent directory traversal
 */
export function sanitizeFileName(fileName: string): string {
  // Remove any path separators
  fileName = fileName.replace(/[/\\]/g, '');
  
  // Remove any special characters that could be problematic
  fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
  
  // Ensure it doesn't start with a dot (hidden files)
  if (fileName.startsWith('.')) {
    fileName = fileName.substring(1);
  }
  
  // Limit length
  if (fileName.length > 255) {
    fileName = fileName.substring(0, 255);
  }
  
  return fileName || 'unnamed';
}