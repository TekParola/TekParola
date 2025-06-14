import winston from 'winston';
import { config } from '../config/env';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const logObject = {
      timestamp,
      level,
      service: service || 'tekparola-sso',
      message,
      ...meta
    };
    
    // Remove empty fields
    Object.keys(logObject).forEach(key => {
      if ((logObject as any)[key] === undefined || (logObject as any)[key] === null) {
        delete (logObject as any)[key];
      }
    });
    
    return JSON.stringify(logObject);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${service || 'sso'}] ${level}: ${message} ${metaStr}`;
  })
);

// File transport configuration
const fileTransportConfig = {
  maxsize: 50 * 1024 * 1024, // 50MB
  maxFiles: 10,
  tailable: true,
  format: structuredFormat,
};

// Base transports
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: config.node_env === 'production' ? structuredFormat : consoleFormat,
    level: config.node_env === 'development' ? 'debug' : 'info',
  }),
];

// Add file transports in production
if (config.node_env === 'production') {
  transports.push(
    // Error logs
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      ...fileTransportConfig,
    }),
    // Warning logs
    new winston.transports.File({
      filename: path.join(logsDir, 'warn.log'),
      level: 'warn',
      ...fileTransportConfig,
    }),
    // All logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      ...fileTransportConfig,
    }),
    // Debug logs (separate file)
    new winston.transports.File({
      filename: path.join(logsDir, 'debug.log'),
      level: 'debug',
      ...fileTransportConfig,
    })
  );
}

// Main application logger
export const logger = winston.createLogger({
  level: config.node_env === 'development' ? 'debug' : 'info',
  format: structuredFormat,
  defaultMeta: { 
    service: 'tekparola-sso',
    environment: config.node_env,
    version: process.env.npm_package_version || '1.0.0',
  },
  transports,
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'exceptions.log'),
      ...fileTransportConfig,
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'rejections.log'),
      ...fileTransportConfig,
    })
  ],
});

// Audit logger for security events
export const auditLogger = winston.createLogger({
  level: 'info',
  format: structuredFormat,
  defaultMeta: { 
    service: 'tekparola-audit',
    environment: config.node_env,
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      ...fileTransportConfig,
    }),
    // Also log to console in development
    ...(config.node_env === 'development' ? [
      new winston.transports.Console({
        format: consoleFormat,
      })
    ] : [])
  ],
});

// Security logger for security-related events
export const securityLogger = winston.createLogger({
  level: 'info',
  format: structuredFormat,
  defaultMeta: { 
    service: 'tekparola-security',
    environment: config.node_env,
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      ...fileTransportConfig,
    }),
    // Security events should also go to main log
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      ...fileTransportConfig,
    }),
    ...(config.node_env === 'development' ? [
      new winston.transports.Console({
        format: consoleFormat,
      })
    ] : [])
  ],
});

// Performance logger for performance metrics
export const performanceLogger = winston.createLogger({
  level: 'info',
  format: structuredFormat,
  defaultMeta: { 
    service: 'tekparola-performance',
    environment: config.node_env,
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'performance.log'),
      ...fileTransportConfig,
    }),
  ],
});

// Access logger for HTTP requests
export const accessLogger = winston.createLogger({
  level: 'info',
  format: structuredFormat,
  defaultMeta: { 
    service: 'tekparola-access',
    environment: config.node_env,
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'access.log'),
      ...fileTransportConfig,
    }),
  ],
});

// Business logic logger for important business events
export const businessLogger = winston.createLogger({
  level: 'info',
  format: structuredFormat,
  defaultMeta: { 
    service: 'tekparola-business',
    environment: config.node_env,
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'business.log'),
      ...fileTransportConfig,
    }),
    ...(config.node_env === 'development' ? [
      new winston.transports.Console({
        format: consoleFormat,
      })
    ] : [])
  ],
});

// Helper functions for structured logging
export const loggers = {
  // Standard application logging
  info: (message: string, meta?: any) => logger.info(message, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  error: (message: string, meta?: any) => logger.error(message, meta),
  debug: (message: string, meta?: any) => logger.debug(message, meta),
  
  // Audit logging
  audit: (action: string, meta?: any) => auditLogger.info(action, { type: 'audit', ...meta }),
  
  // Security logging
  security: (event: string, meta?: any) => securityLogger.warn(event, { type: 'security', ...meta }),
  
  // Performance logging
  performance: (metric: string, value: number, meta?: any) => 
    performanceLogger.info(metric, { type: 'performance', value, ...meta }),
  
  // Access logging
  access: (method: string, url: string, meta?: any) => 
    accessLogger.info(`${method} ${url}`, { type: 'access', method, url, ...meta }),
  
  // Business event logging
  business: (event: string, meta?: any) => 
    businessLogger.info(event, { type: 'business', ...meta }),
};

// Request logging middleware helper
export const createRequestLogger = () => {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add request ID to request object
    req.requestId = requestId;
    
    // Log request start
    loggers.access(req.method, req.originalUrl, {
      requestId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      sessionId: req.sessionId,
    });
    
    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(chunk: any, encoding: any) {
      const duration = Date.now() - startTime;
      
      loggers.access(req.method, req.originalUrl, {
        requestId,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userId: req.user?.id,
        responseSize: res.get('Content-Length'),
      });
      
      // Log performance metrics
      if (duration > 1000) { // Log slow requests
        loggers.performance('slow_request', duration, {
          requestId,
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
        });
      }
      
      originalEnd.call(this, chunk, encoding);
    };
    
    next();
  };
};

// Error logging helper
export const logError = (error: Error, context?: any) => {
  logger.error(error.message, {
    stack: error.stack,
    name: error.name,
    ...context,
  });
};

// Log rotation configuration
if (config.node_env === 'production') {
  // Configure log rotation (this would typically be done by external tools like logrotate)
  logger.info('Logger initialized with file rotation in production mode');
}