import { Request, Response } from 'express';
import { circuitBreakerRegistry } from '../utils/circuitBreaker';
import { ExternalApiFactory } from '../services/externalApiService';
import { logger } from '../utils/logger';
import { config } from '../config/env';
import { redisClient } from '../config/redis';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    email: ServiceStatus;
    circuitBreakers: Record<string, any>;
    externalServices: Record<string, any>;
  };
  performance: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    eventLoopDelay?: number;
  };
}

export interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  error?: string;
  details?: any;
}

export class HealthController {
  /**
   * Basic health check endpoint
   */
  async getBasicHealth(req: Request, res: Response): Promise<void> {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.node_env,
      };

      res.status(200).json(health);
    } catch (error) {
      logger.error('Basic health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Comprehensive health check with detailed service status
   */
  async getDetailedHealth(req: Request, res: Response): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Check all services in parallel
      const [
        databaseStatus,
        redisStatus,
        emailStatus,
        circuitBreakerStatus,
        externalServiceStatus,
        performanceMetrics,
      ] = await Promise.allSettled([
        this.checkDatabaseHealth(),
        this.checkRedisHealth(),
        this.checkEmailHealth(),
        this.getCircuitBreakerStatus(),
        this.getExternalServiceStatus(),
        this.getPerformanceMetrics(),
      ]);

      const health: HealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.node_env,
        services: {
          database: this.getResultValue(databaseStatus, { status: 'unhealthy', error: 'Check failed' }),
          redis: this.getResultValue(redisStatus, { status: 'unhealthy', error: 'Check failed' }),
          email: this.getResultValue(emailStatus, { status: 'unhealthy', error: 'Check failed' }),
          circuitBreakers: this.getResultValue(circuitBreakerStatus, {}),
          externalServices: this.getResultValue(externalServiceStatus, {}),
        },
        performance: this.getResultValue(performanceMetrics, {
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
        }),
      };

      // Determine overall health status
      health.status = this.determineOverallHealth(health);

      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;

      logger.info('Detailed health check completed', {
        status: health.status,
        duration: Date.now() - startTime,
      });

      res.status(statusCode).json(health);
    } catch (error) {
      logger.error('Detailed health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get readiness probe for Kubernetes
   */
  async getReadiness(req: Request, res: Response): Promise<void> {
    try {
      // Check critical services that are required for the app to function
      const [databaseStatus, redisStatus] = await Promise.allSettled([
        this.checkDatabaseHealth(),
        this.checkRedisHealth(),
      ]);

      const database = this.getResultValue(databaseStatus, { status: 'unhealthy' });
      const redis = this.getResultValue(redisStatus, { status: 'unhealthy' });

      const isReady = database.status === 'healthy' && redis.status === 'healthy';

      if (isReady) {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString(),
          services: { database, redis },
        });
      } else {
        res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString(),
          services: { database, redis },
        });
      }
    } catch (error) {
      logger.error('Readiness check failed:', error);
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get liveness probe for Kubernetes
   */
  async getLiveness(req: Request, res: Response): Promise<void> {
    try {
      // Simple check to ensure the process is alive and responsive
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();

      // Check if memory usage is reasonable (less than 1GB)
      const memoryOk = memoryUsage.heapUsed < 1024 * 1024 * 1024;
      
      // Check if uptime is reasonable (process hasn't been running too long without restart)
      const uptimeOk = uptime < 7 * 24 * 60 * 60; // Less than 7 days

      if (memoryOk && uptimeOk) {
        res.status(200).json({
          status: 'alive',
          timestamp: new Date().toISOString(),
          uptime,
          memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        });
      } else {
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime,
          memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          issues: {
            memoryHigh: !memoryOk,
            uptimeLong: !uptimeOk,
          },
        });
      }
    } catch (error) {
      logger.error('Liveness check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<ServiceStatus> {
    const startTime = Date.now();
    
    try {
      const { prisma } = await import('../config/database');
      await prisma.$queryRaw`SELECT 1`;
      
      return {
        status: 'healthy',
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<ServiceStatus> {
    const startTime = Date.now();
    
    try {
      await redisClient.ping();
      
      return {
        status: 'healthy',
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check email service health
   */
  private async checkEmailHealth(): Promise<ServiceStatus> {
    const startTime = Date.now();
    
    try {
      const { emailService } = await import('../services/emailService');
      const isConnected = await emailService.testConnection();
      
      return {
        status: isConnected ? 'healthy' : 'unhealthy',
        responseTime: Date.now() - startTime,
        error: isConnected ? undefined : 'SMTP connection failed',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get circuit breaker status
   */
  private async getCircuitBreakerStatus(): Promise<Record<string, any>> {
    try {
      return circuitBreakerRegistry.getHealthStatus();
    } catch (error) {
      logger.error('Failed to get circuit breaker status:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get external service status
   */
  private async getExternalServiceStatus(): Promise<Record<string, any>> {
    try {
      return ExternalApiFactory.getHealthStatus();
    } catch (error) {
      logger.error('Failed to get external service status:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get performance metrics
   */
  private async getPerformanceMetrics(): Promise<any> {
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Get event loop delay if available
      let eventLoopDelay;
      try {
        const { performance } = await import('perf_hooks');
        const start = performance.now();
        setImmediate(() => {
          eventLoopDelay = performance.now() - start;
        });
      } catch {
        // Event loop delay measurement not available
      }

      return {
        memoryUsage,
        cpuUsage,
        eventLoopDelay,
      };
    } catch (error) {
      logger.error('Failed to get performance metrics:', error);
      throw error;
    }
  }

  /**
   * Determine overall health status based on service statuses
   */
  private determineOverallHealth(health: HealthStatus): 'healthy' | 'degraded' | 'unhealthy' {
    const { database, redis, email } = health.services;
    
    // Critical services: database and redis
    if (database.status === 'unhealthy' || redis.status === 'unhealthy') {
      return 'unhealthy';
    }

    // Non-critical services can cause degraded status
    if (email.status === 'unhealthy') {
      return 'degraded';
    }

    // Check circuit breakers
    const circuitBreakers = Object.values(health.services.circuitBreakers);
    const unhealthyCircuitBreakers = circuitBreakers.filter((cb: any) => !cb.healthy);
    
    if (unhealthyCircuitBreakers.length > 0) {
      return 'degraded';
    }

    // Check external services
    const externalServices = Object.values(health.services.externalServices);
    const unhealthyExternalServices = externalServices.filter((service: any) => !service.healthy);
    
    if (unhealthyExternalServices.length > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Helper to safely get result value from Promise.allSettled
   */
  private getResultValue<T>(result: PromiseSettledResult<T>, defaultValue: T): T {
    return result.status === 'fulfilled' ? result.value : defaultValue;
  }
}

export const healthController = new HealthController();