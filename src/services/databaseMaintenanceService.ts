import * as cron from 'node-cron';
import { databaseOptimizationService } from './databaseOptimizationService';
import { logger } from '../utils/logger';
import { config } from '../config/env';

export class DatabaseMaintenanceService {
  private dailyMaintenanceJob: cron.ScheduledTask | null = null;
  private weeklyOptimizationJob: cron.ScheduledTask | null = null;
  private performanceMonitoringJob: cron.ScheduledTask | null = null;

  /**
   * Start the database maintenance scheduler
   */
  start(): void {
    try {
      // Daily maintenance at 2 AM UTC
      this.dailyMaintenanceJob = cron.schedule('0 2 * * *', async () => {
        await this.runDailyMaintenance();
      }, {
        timezone: 'UTC',
      });

      // Weekly optimization on Sundays at 3 AM UTC
      this.weeklyOptimizationJob = cron.schedule('0 3 * * 0', async () => {
        await this.runWeeklyOptimization();
      }, {
        timezone: 'UTC',
      });

      // Performance monitoring every hour
      this.performanceMonitoringJob = cron.schedule('0 * * * *', async () => {
        await this.monitorPerformance();
      });

      logger.info('Database maintenance scheduler started');
    } catch (error) {
      logger.error('Failed to start database maintenance scheduler:', error);
    }
  }

  /**
   * Stop the database maintenance scheduler
   */
  stop(): void {
    try {
      if (this.dailyMaintenanceJob) {
        this.dailyMaintenanceJob.stop();
        this.dailyMaintenanceJob = null;
      }

      if (this.weeklyOptimizationJob) {
        this.weeklyOptimizationJob.stop();
        this.weeklyOptimizationJob = null;
      }

      if (this.performanceMonitoringJob) {
        this.performanceMonitoringJob.stop();
        this.performanceMonitoringJob = null;
      }

      logger.info('Database maintenance scheduler stopped');
    } catch (error) {
      logger.error('Failed to stop database maintenance scheduler:', error);
    }
  }

  /**
   * Run daily maintenance tasks
   */
  async runDailyMaintenance(): Promise<void> {
    try {
      logger.info('Starting daily database maintenance...');

      // Check if optimization is needed
      const optimizationCheck = await databaseOptimizationService.needsOptimization();
      
      if (optimizationCheck.needed && optimizationCheck.severity !== 'low') {
        logger.info('Database optimization needed:', optimizationCheck.reasons);
        
        // Run optimization
        const result = await databaseOptimizationService.optimizeDatabase();
        logger.info('Daily optimization completed:', result);
      } else {
        logger.info('No optimization needed during daily maintenance');
      }

      // Get basic performance metrics for monitoring
      const metrics = await databaseOptimizationService.getPerformanceMetrics();
      
      // Log performance summary
      logger.info('Daily performance summary:', {
        tableCount: metrics.tableStats.length,
        slowQueryCount: metrics.slowQueries.length,
        activeConnections: metrics.connectionStats.active,
        totalConnections: metrics.connectionStats.total,
      });

      // Check for concerning metrics
      await this.checkAndAlertPerformanceIssues(metrics);

    } catch (error) {
      logger.error('Daily database maintenance failed:', error);
    }
  }

  /**
   * Run weekly optimization tasks
   */
  async runWeeklyOptimization(): Promise<void> {
    try {
      logger.info('Starting weekly database optimization...');

      // Always run full optimization weekly
      const result = await databaseOptimizationService.optimizeDatabase();
      
      // Get comprehensive metrics
      const [performanceMetrics, healthMetrics] = await Promise.all([
        databaseOptimizationService.getPerformanceMetrics(),
        databaseOptimizationService.getHealthMetrics(),
      ]);

      logger.info('Weekly optimization completed:', {
        maintenance: result,
        performance: {
          slowQueries: performanceMetrics.slowQueries.length,
          tableCount: performanceMetrics.tableStats.length,
          cacheHitRatio: healthMetrics.cacheHitRatio,
          deadlocks: healthMetrics.deadlocks,
        },
      });

      // Generate weekly report
      await this.generateWeeklyReport(performanceMetrics, healthMetrics, result);

    } catch (error) {
      logger.error('Weekly database optimization failed:', error);
    }
  }

  /**
   * Monitor database performance
   */
  async monitorPerformance(): Promise<void> {
    try {
      const healthMetrics = await databaseOptimizationService.getHealthMetrics();

      // Check for critical issues
      const criticalIssues: string[] = [];

      if (healthMetrics.cacheHitRatio < 85) {
        criticalIssues.push(`Low cache hit ratio: ${healthMetrics.cacheHitRatio}%`);
      }

      if (healthMetrics.longRunningQueries > 10) {
        criticalIssues.push(`Too many long-running queries: ${healthMetrics.longRunningQueries}`);
      }

      if (healthMetrics.blockedQueries > 5) {
        criticalIssues.push(`Too many blocked queries: ${healthMetrics.blockedQueries}`);
      }

      if (healthMetrics.deadlocks > 0) {
        criticalIssues.push(`Deadlocks detected: ${healthMetrics.deadlocks}`);
      }

      if (criticalIssues.length > 0) {
        logger.warn('Critical database performance issues detected:', criticalIssues);
        
        // In production, you might want to send alerts here
        if (config.node_env === 'production') {
          await this.sendPerformanceAlert(criticalIssues, healthMetrics);
        }
      }

    } catch (error) {
      logger.error('Performance monitoring failed:', error);
    }
  }

  /**
   * Check and alert on performance issues
   */
  private async checkAndAlertPerformanceIssues(metrics: any): Promise<void> {
    const issues: string[] = [];

    // Check for tables with high row counts but no recent maintenance
    const largeTables = metrics.tableStats.filter((table: any) => 
      table.rowCount > 100000 && 
      (!table.lastVacuum || new Date().getTime() - new Date(table.lastVacuum).getTime() > 7 * 24 * 60 * 60 * 1000)
    );

    if (largeTables.length > 0) {
      issues.push(`${largeTables.length} large tables need maintenance`);
    }

    // Check for unused indexes
    const unusedIndexes = metrics.indexUsage.filter((index: any) => 
      index.scans === 0 && !index.indexName.includes('pkey')
    );

    if (unusedIndexes.length > 10) {
      issues.push(`${unusedIndexes.length} potentially unused indexes detected`);
    }

    // Check connection usage
    const connectionUsage = (metrics.connectionStats.total / metrics.connectionStats.maxConnections) * 100;
    if (connectionUsage > 80) {
      issues.push(`High connection usage: ${connectionUsage.toFixed(1)}%`);
    }

    if (issues.length > 0) {
      logger.warn('Performance issues detected:', issues);
    }
  }

  /**
   * Send performance alert (placeholder for actual alerting system)
   */
  private async sendPerformanceAlert(issues: string[], metrics: any): Promise<void> {
    // In a real system, this would integrate with your alerting system
    // (e.g., Slack, PagerDuty, email, etc.)
    logger.error('CRITICAL DATABASE ALERT:', {
      issues,
      metrics: {
        cacheHitRatio: metrics.cacheHitRatio,
        longRunningQueries: metrics.longRunningQueries,
        blockedQueries: metrics.blockedQueries,
        deadlocks: metrics.deadlocks,
      },
      timestamp: new Date().toISOString(),
    });

    // Example: Send to monitoring service
    // await monitoringService.sendAlert({
    //   severity: 'critical',
    //   service: 'database',
    //   message: `Database performance issues: ${issues.join(', ')}`,
    //   metadata: metrics,
    // });
  }

  /**
   * Generate weekly performance report
   */
  private async generateWeeklyReport(
    performanceMetrics: any,
    healthMetrics: any,
    maintenanceResult: any
  ): Promise<void> {
    const report = {
      timestamp: new Date().toISOString(),
      week: this.getWeekNumber(new Date()),
      performance: {
        slowQueryCount: performanceMetrics.slowQueries.length,
        cacheHitRatio: healthMetrics.cacheHitRatio,
        averageConnections: performanceMetrics.connectionStats.total,
        deadlockCount: healthMetrics.deadlocks,
      },
      maintenance: {
        tablesVacuumed: maintenanceResult.vaccumedTables.length,
        tablesAnalyzed: maintenanceResult.analyzedTables.length,
        tablesReindexed: maintenanceResult.reindexedTables.length,
      },
      recommendations: this.generateRecommendations(performanceMetrics, healthMetrics),
    };

    logger.info('Weekly database performance report:', report);

    // In production, you might want to store this report or send it to stakeholders
    // await reportingService.saveWeeklyReport('database_performance', report);
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(performanceMetrics: any, healthMetrics: any): string[] {
    const recommendations: string[] = [];

    if (healthMetrics.cacheHitRatio < 95) {
      recommendations.push('Consider increasing shared_buffers to improve cache hit ratio');
    }

    if (performanceMetrics.slowQueries.length > 10) {
      recommendations.push('Review and optimize slow queries, consider adding indexes');
    }

    if (healthMetrics.longRunningQueries > 5) {
      recommendations.push('Investigate long-running queries and consider query optimization');
    }

    const largeTablesWithoutIndexes = performanceMetrics.tableStats
      .filter((table: any) => table.rowCount > 50000)
      .filter((table: any) => {
        const tableIndexes = performanceMetrics.indexUsage.filter(
          (index: any) => index.tableName === table.tableName
        );
        return tableIndexes.length < 3; // Tables with very few indexes
      });

    if (largeTablesWithoutIndexes.length > 0) {
      recommendations.push(`Consider adding indexes to large tables: ${largeTablesWithoutIndexes.map((t: any) => t.tableName).join(', ')}`);
    }

    // Check for tables that might benefit from partitioning
    const veryLargeTables = performanceMetrics.tableStats.filter((table: any) => table.rowCount > 1000000);
    if (veryLargeTables.length > 0) {
      recommendations.push(`Consider table partitioning for very large tables: ${veryLargeTables.map((t: any) => t.tableName).join(', ')}`);
    }

    return recommendations;
  }

  /**
   * Get ISO week number
   */
  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Run maintenance manually (for testing or emergency situations)
   */
  async runManualMaintenance(): Promise<{
    optimization: any;
    performanceMetrics: any;
    healthMetrics: any;
  }> {
    logger.info('Running manual database maintenance...');

    const [optimization, performanceMetrics, healthMetrics] = await Promise.all([
      databaseOptimizationService.optimizeDatabase(),
      databaseOptimizationService.getPerformanceMetrics(),
      databaseOptimizationService.getHealthMetrics(),
    ]);

    logger.info('Manual maintenance completed');

    return { optimization, performanceMetrics, healthMetrics };
  }
}

export const databaseMaintenanceService = new DatabaseMaintenanceService();