import { logger } from '../utils/logger';
import { config } from '../config/env';
import { circuitBreakerRegistry } from '../utils/circuitBreaker';
import { databaseOptimizationService } from './databaseOptimizationService';
import { cacheService } from './cacheService';

export interface MetricData {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  unit?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  duration: number; // Time in seconds the condition must be true
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  lastTriggered?: number;
  cooldown?: number; // Minimum time between alerts in seconds
}

export interface Alert {
  id: string;
  ruleId: string;
  metric: string;
  value: number;
  threshold: number;
  condition: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  resolved?: boolean;
  resolvedAt?: number;
}

export class MonitoringService {
  private metrics: Map<string, MetricData[]> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private metricsRetentionPeriod = 24 * 60 * 60 * 1000; // 24 hours
  private collectionInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * Start the monitoring service
   */
  start(): void {
    logger.info('Starting monitoring service...');
    
    // Collect metrics every 30 seconds
    this.collectionInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Initial collection
    this.collectSystemMetrics();

    logger.info('Monitoring service started');
  }

  /**
   * Stop the monitoring service
   */
  stop(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
    logger.info('Monitoring service stopped');
  }

  /**
   * Record a custom metric
   */
  recordMetric(metric: MetricData): void {
    if (!this.metrics.has(metric.name)) {
      this.metrics.set(metric.name, []);
    }

    const metricArray = this.metrics.get(metric.name)!;
    metricArray.push(metric);

    // Keep only recent metrics
    const cutoff = Date.now() - this.metricsRetentionPeriod;
    this.metrics.set(
      metric.name,
      metricArray.filter(m => m.timestamp > cutoff)
    );

    // Check alert rules
    this.checkAlertRules(metric);

    logger.debug(`Recorded metric: ${metric.name} = ${metric.value}`, {
      tags: metric.tags,
      unit: metric.unit,
    });
  }

  /**
   * Get metrics by name
   */
  getMetrics(name: string, since?: number): MetricData[] {
    const metrics = this.metrics.get(name) || [];
    
    if (since) {
      return metrics.filter(m => m.timestamp >= since);
    }
    
    return [...metrics];
  }

  /**
   * Get all metric names
   */
  getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Get metric statistics
   */
  getMetricStats(name: string, since?: number): {
    count: number;
    min: number;
    max: number;
    avg: number;
    latest: number;
    trend: 'up' | 'down' | 'stable';
  } | null {
    const metrics = this.getMetrics(name, since);
    
    if (metrics.length === 0) {
      return null;
    }

    const values = metrics.map(m => m.value);
    const latest = values[values.length - 1];
    const previous = values.length > 1 ? values[values.length - 2] : latest;
    
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (latest !== undefined && previous !== undefined) {
      if (latest > previous * 1.05) {
        trend = 'up';
      } else if (latest < previous * 0.95) {
        trend = 'down';
      }
    }

    return {
      count: metrics.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, val) => sum + val, 0) / values.length,
      latest: latest ?? 0,
      trend,
    };
  }

  /**
   * Add alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    logger.info(`Added alert rule: ${rule.name}`, { ruleId: rule.id });
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(ruleId: string): boolean {
    const removed = this.alertRules.delete(ruleId);
    if (removed) {
      logger.info(`Removed alert rule: ${ruleId}`);
    }
    return removed;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      logger.info(`Alert resolved: ${alert.message}`, { alertId });
      return true;
    }
    return false;
  }

  /**
   * Collect system metrics
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      const timestamp = Date.now();

      // Memory metrics
      const memoryUsage = process.memoryUsage();
      this.recordMetric({
        name: 'system.memory.heap_used',
        value: memoryUsage.heapUsed,
        timestamp,
        unit: 'bytes',
      });
      this.recordMetric({
        name: 'system.memory.heap_total',
        value: memoryUsage.heapTotal,
        timestamp,
        unit: 'bytes',
      });
      this.recordMetric({
        name: 'system.memory.rss',
        value: memoryUsage.rss,
        timestamp,
        unit: 'bytes',
      });

      // CPU metrics
      const cpuUsage = process.cpuUsage();
      this.recordMetric({
        name: 'system.cpu.user',
        value: cpuUsage.user,
        timestamp,
        unit: 'microseconds',
      });
      this.recordMetric({
        name: 'system.cpu.system',
        value: cpuUsage.system,
        timestamp,
        unit: 'microseconds',
      });

      // Uptime
      this.recordMetric({
        name: 'system.uptime',
        value: process.uptime(),
        timestamp,
        unit: 'seconds',
      });

      // Event loop lag
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
        this.recordMetric({
          name: 'system.event_loop_lag',
          value: lag,
          timestamp: Date.now(),
          unit: 'milliseconds',
        });
      });

      // Circuit breaker metrics
      await this.collectCircuitBreakerMetrics(timestamp);

      // Database metrics
      await this.collectDatabaseMetrics(timestamp);

      // Cache metrics
      await this.collectCacheMetrics(timestamp);

    } catch (error) {
      logger.error('Failed to collect system metrics:', error);
    }
  }

  /**
   * Collect circuit breaker metrics
   */
  private async collectCircuitBreakerMetrics(timestamp: number): Promise<void> {
    try {
      const circuitBreakers = circuitBreakerRegistry.getAllCircuitBreakers();
      
      for (const [serviceName, circuitBreaker] of circuitBreakers) {
        const stats = circuitBreaker.getStats();
        
        this.recordMetric({
          name: 'circuit_breaker.total_requests',
          value: stats.totalRequests,
          timestamp,
          tags: { service: serviceName },
        });
        
        this.recordMetric({
          name: 'circuit_breaker.failure_count',
          value: stats.failureCount,
          timestamp,
          tags: { service: serviceName },
        });
        
        this.recordMetric({
          name: 'circuit_breaker.success_rate',
          value: circuitBreaker.getSuccessRate(),
          timestamp,
          tags: { service: serviceName },
          unit: 'percentage',
        });
        
        this.recordMetric({
          name: 'circuit_breaker.failure_rate',
          value: circuitBreaker.getFailureRate(),
          timestamp,
          tags: { service: serviceName },
          unit: 'percentage',
        });
      }
    } catch (error) {
      logger.error('Failed to collect circuit breaker metrics:', error);
    }
  }

  /**
   * Collect database metrics
   */
  private async collectDatabaseMetrics(timestamp: number): Promise<void> {
    try {
      const healthMetrics = await databaseOptimizationService.getHealthMetrics();
      
      this.recordMetric({
        name: 'database.cache_hit_ratio',
        value: healthMetrics.cacheHitRatio,
        timestamp,
        unit: 'percentage',
      });
      
      this.recordMetric({
        name: 'database.deadlocks',
        value: healthMetrics.deadlocks,
        timestamp,
      });
      
      this.recordMetric({
        name: 'database.long_running_queries',
        value: healthMetrics.longRunningQueries,
        timestamp,
      });
      
      this.recordMetric({
        name: 'database.blocked_queries',
        value: healthMetrics.blockedQueries,
        timestamp,
      });
      
    } catch (error) {
      logger.error('Failed to collect database metrics:', error);
    }
  }

  /**
   * Collect cache metrics
   */
  private async collectCacheMetrics(timestamp: number): Promise<void> {
    try {
      const cacheStats = await cacheService.getStats();
      
      this.recordMetric({
        name: 'cache.hit_rate',
        value: cacheStats.hitRate,
        timestamp,
        unit: 'percentage',
      });
      
      this.recordMetric({
        name: 'cache.hits',
        value: cacheStats.hits,
        timestamp,
      });
      
      this.recordMetric({
        name: 'cache.misses',
        value: cacheStats.misses,
        timestamp,
      });
      
    } catch (error) {
      logger.error('Failed to collect cache metrics:', error);
    }
  }

  /**
   * Check alert rules against metric
   */
  private checkAlertRules(metric: MetricData): void {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled || rule.metric !== metric.name) {
        continue;
      }

      // Check cooldown period
      if (rule.lastTriggered && rule.cooldown) {
        const timeSinceLastAlert = Date.now() - rule.lastTriggered;
        if (timeSinceLastAlert < rule.cooldown * 1000) {
          continue;
        }
      }

      // Check condition
      let conditionMet = false;
      switch (rule.condition) {
        case 'gt':
          conditionMet = metric.value > rule.threshold;
          break;
        case 'gte':
          conditionMet = metric.value >= rule.threshold;
          break;
        case 'lt':
          conditionMet = metric.value < rule.threshold;
          break;
        case 'lte':
          conditionMet = metric.value <= rule.threshold;
          break;
        case 'eq':
          conditionMet = metric.value === rule.threshold;
          break;
      }

      if (conditionMet) {
        this.triggerAlert(rule, metric);
      }
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(rule: AlertRule, metric: MetricData): void {
    const alertId = `${rule.id}_${Date.now()}`;
    const alert: Alert = {
      id: alertId,
      ruleId: rule.id,
      metric: metric.name,
      value: metric.value,
      threshold: rule.threshold,
      condition: rule.condition,
      severity: rule.severity,
      message: `Alert: ${rule.name} - ${metric.name} is ${metric.value} (threshold: ${rule.threshold})`,
      timestamp: Date.now(),
    };

    this.activeAlerts.set(alertId, alert);
    rule.lastTriggered = Date.now();

    logger.warn(`Alert triggered: ${alert.message}`, {
      alertId,
      ruleId: rule.id,
      severity: rule.severity,
      metric: metric.name,
      value: metric.value,
      threshold: rule.threshold,
    });

    // In production, send alerts to external systems here
    this.sendAlertNotification(alert);
  }

  /**
   * Send alert notification (placeholder for external integrations)
   */
  private async sendAlertNotification(alert: Alert): Promise<void> {
    try {
      // Example integrations:
      // - Send to Slack
      // - Send to PagerDuty
      // - Send email
      // - Send to monitoring system (DataDog, New Relic, etc.)
      
      if (config.node_env === 'production') {
        // Implement actual alerting logic here
        logger.info('Alert notification sent', { alertId: alert.id });
      }
    } catch (error) {
      logger.error('Failed to send alert notification:', error);
    }
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high_memory_usage',
        name: 'High Memory Usage',
        metric: 'system.memory.heap_used',
        condition: 'gt',
        threshold: 1024 * 1024 * 1024, // 1GB
        duration: 300, // 5 minutes
        severity: 'high',
        enabled: true,
        cooldown: 600, // 10 minutes
      },
      {
        id: 'low_cache_hit_ratio',
        name: 'Low Cache Hit Ratio',
        metric: 'database.cache_hit_ratio',
        condition: 'lt',
        threshold: 90,
        duration: 300,
        severity: 'medium',
        enabled: true,
        cooldown: 900, // 15 minutes
      },
      {
        id: 'high_event_loop_lag',
        name: 'High Event Loop Lag',
        metric: 'system.event_loop_lag',
        condition: 'gt',
        threshold: 100, // 100ms
        duration: 180,
        severity: 'high',
        enabled: true,
        cooldown: 300, // 5 minutes
      },
      {
        id: 'circuit_breaker_failures',
        name: 'Circuit Breaker High Failure Rate',
        metric: 'circuit_breaker.failure_rate',
        condition: 'gt',
        threshold: 50, // 50%
        duration: 120,
        severity: 'critical',
        enabled: true,
        cooldown: 300,
      },
      {
        id: 'database_blocked_queries',
        name: 'Database Blocked Queries',
        metric: 'database.blocked_queries',
        condition: 'gt',
        threshold: 5,
        duration: 60,
        severity: 'high',
        enabled: true,
        cooldown: 600,
      },
    ];

    for (const rule of defaultRules) {
      this.addAlertRule(rule);
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    const lines: string[] = [];
    
    for (const [metricName, metricArray] of this.metrics) {
      if (metricArray.length === 0) {
        continue;
      }
      
      const latest = metricArray[metricArray.length - 1];
      const sanitizedName = metricName.replace(/[^a-zA-Z0-9_]/g, '_');
      
      // Add help and type comments
      lines.push(`# HELP ${sanitizedName} ${metricName}`);
      lines.push(`# TYPE ${sanitizedName} gauge`);
      
      // Add metric value with labels
      if (latest && latest.tags) {
        const labels = Object.entries(latest.tags)
          .map(([key, value]) => `${key}="${value}"`)
          .join(',');
        lines.push(`${sanitizedName}{${labels}} ${latest.value}`);
      } else if (latest) {
        lines.push(`${sanitizedName} ${latest.value}`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Get monitoring summary
   */
  getSummary(): {
    totalMetrics: number;
    activeAlerts: number;
    alertRules: number;
    systemHealth: 'healthy' | 'warning' | 'critical';
  } {
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
    const highAlerts = activeAlerts.filter(a => a.severity === 'high');
    
    let systemHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalAlerts.length > 0) {
      systemHealth = 'critical';
    } else if (highAlerts.length > 0 || activeAlerts.length > 5) {
      systemHealth = 'warning';
    }
    
    return {
      totalMetrics: this.metrics.size,
      activeAlerts: activeAlerts.length,
      alertRules: this.alertRules.size,
      systemHealth,
    };
  }
}

export const monitoringService = new MonitoringService();