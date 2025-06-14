import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/env';
import { swaggerSpec } from './config/swagger';
import { connectRedis } from './config/redis';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimiter';
import { createRequestLogger } from './utils/logger';
import { csrfProtection, csrfTokenGenerator } from './middleware/csrf';
import { sanitizeInput } from './middleware/sanitizer';
import { enforceHTTPS, securityHeaders, blockMaliciousRequests, requestSizeLimit } from './middleware/security';
import cookieParser from 'cookie-parser';

// Import routes
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import userBulkRoutes from './routes/userBulkRoutes';
import adminRoutes from './routes/adminRoutes';
import applicationRoutes from './routes/applicationRoutes';
import sessionRoutes from './routes/sessionRoutes';
import settingsRoutes from './routes/settingsRoutes';
import emailTemplateRoutes from './routes/emailTemplateRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import auditRoutes from './routes/auditRoutes';
import roleRoutes from './routes/roleRoutes';
import securityRoutes from './routes/securityRoutes';
import ssoRoutes from './routes/ssoRoutes';
import apiRoutes from './routes/apiRoutes';
import healthRoutes from './routes/healthRoutes';
import metricsRoutes from './routes/metricsRoutes';

export const createApp = (): express.Application => {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: true,
    frameguard: { action: 'deny' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true,
  }));

  // Additional security middleware
  app.use(enforceHTTPS);
  app.use(securityHeaders);
  app.use(blockMaliciousRequests);
  app.use(requestSizeLimit);

  // CORS configuration
  app.use(cors({
    origin: (origin, callback) => {
      // In production, always validate origins
      if (config.node_env === 'production') {
        if (!origin) {
          return callback(new Error('Origin header required in production'));
        }
        
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
        
        if (allowedOrigins.length === 0) {
          return callback(new Error('No allowed origins configured'));
        }
        
        if (!allowedOrigins.includes(origin)) {
          return callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
        
        return callback(null, true);
      }
      
      // In development, allow common localhost origins
      if (!origin) return callback(null, true);
      
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
      ];
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
    exposedHeaders: ['X-CSRF-Token'],
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 200,
  }));

  // Compression middleware
  app.use(compression());

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Cookie parser (required for CSRF)
  app.use(cookieParser());
  
  // Input sanitization (before other middleware)
  app.use(sanitizeInput());

  // CSRF protection
  app.use(csrfTokenGenerator());
  app.use(csrfProtection());

  // Rate limiting
  app.use(generalLimiter);

  // Request logging middleware
  app.use(createRequestLogger());

  // Health check endpoints
  app.use('/health', healthRoutes);

  // Metrics endpoints  
  app.use('/metrics', metricsRoutes);

  // Swagger documentation
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'TekParola SSO API Documentation',
  }));

  // API routes
  app.use(`/api/${config.api_version}/auth`, authRoutes);
  app.use(`/api/${config.api_version}/users`, userRoutes);
  app.use(`/api/${config.api_version}/users/bulk`, userBulkRoutes);
  app.use(`/api/${config.api_version}/admin`, adminRoutes);
  app.use(`/api/${config.api_version}/applications`, applicationRoutes);
  app.use(`/api/${config.api_version}/sessions`, sessionRoutes);
  app.use(`/api/${config.api_version}/settings`, settingsRoutes);
  app.use(`/api/${config.api_version}/email-templates`, emailTemplateRoutes);
  app.use(`/api/${config.api_version}/dashboard`, dashboardRoutes);
  app.use(`/api/${config.api_version}/audit`, auditRoutes);
  app.use(`/api/${config.api_version}/roles`, roleRoutes);
  app.use(`/api/${config.api_version}/security`, securityRoutes);
  app.use('/sso', ssoRoutes);
  app.use('/api/external', apiRoutes);

  // API documentation endpoint
  app.get('/api', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'TekParola SSO API',
      version: config.api_version,
      documentation: '/api/docs',
      health: '/health',
      endpoints: {
        auth: `/api/${config.api_version}/auth`,
        users: `/api/${config.api_version}/users`,
        usersBulk: `/api/${config.api_version}/users/bulk`,
        admin: `/api/${config.api_version}/admin`,
        applications: `/api/${config.api_version}/applications`,
        sessions: `/api/${config.api_version}/sessions`,
        settings: `/api/${config.api_version}/settings`,
        emailTemplates: `/api/${config.api_version}/email-templates`,
        dashboard: `/api/${config.api_version}/dashboard`,
        audit: `/api/${config.api_version}/audit`,
        roles: `/api/${config.api_version}/roles`,
        security: `/api/${config.api_version}/security`,
        sso: '/sso',
        external: '/api/external',
      },
    });
  });

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
};

export const startServer = async (): Promise<void> => {
  try {
    // Connect to Redis
    await connectRedis();
    logger.info('Connected to Redis');

    // Start key rotation scheduler
    const { keyRotationService } = await import('./services/keyRotationService');
    keyRotationService.start();
    logger.info('Key rotation scheduler started');

    // Start database maintenance scheduler
    const { databaseMaintenanceService } = await import('./services/databaseMaintenanceService');
    databaseMaintenanceService.start();
    logger.info('Database maintenance scheduler started');

    // Start monitoring service
    const { monitoringService } = await import('./services/monitoringService');
    monitoringService.start();
    logger.info('Monitoring service started');

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.node_env} mode`);
      logger.info(`API documentation available at http://localhost:${config.port}/api`);
      logger.info(`Health check available at http://localhost:${config.port}/health`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        // Close database connections and other cleanup
        try {
          // Stop key rotation scheduler
          const { keyRotationService } = await import('./services/keyRotationService');
          keyRotationService.stop();
          logger.info('Key rotation scheduler stopped');

          // Stop database maintenance scheduler
          const { databaseMaintenanceService } = await import('./services/databaseMaintenanceService');
          databaseMaintenanceService.stop();
          logger.info('Database maintenance scheduler stopped');

          // Stop monitoring service
          const { monitoringService } = await import('./services/monitoringService');
          monitoringService.stop();
          logger.info('Monitoring service stopped');
          
          const { disconnectRedis } = await import('./config/redis');
          await disconnectRedis();
          logger.info('Redis connection closed');
          
          const { prisma } = await import('./config/database');
          await prisma.$disconnect();
          logger.info('Database connection closed');
          
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
    };

    // Handle process signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};