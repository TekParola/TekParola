import { monitoringService } from '../../src/services/monitoringService';
import { MetricData, AlertRule } from '../../src/services/monitoringService';

describe('MonitoringService', () => {
  beforeEach(() => {
    // Clear metrics and alerts before each test
    const summary = monitoringService.getSummary();
    const alertNames = monitoringService.getMetricNames();
    
    // Remove any test metrics
    alertNames.forEach(name => {
      if (name.startsWith('test.')) {
        // Can't easily clear individual metrics, so we'll work around this
      }
    });
  });

  describe('Metric Recording', () => {
    it('should record metrics correctly', () => {
      const metric: MetricData = {
        name: 'test.cpu.usage',
        value: 75.5,
        timestamp: Date.now(),
        tags: { server: 'web-01' },
        unit: 'percentage',
      };

      monitoringService.recordMetric(metric);

      const metrics = monitoringService.getMetrics('test.cpu.usage');
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toEqual(metric);
    });

    it('should store multiple metrics for same name', () => {
      const baseMetric = {
        name: 'test.memory.usage',
        unit: 'bytes',
      };

      const metric1: MetricData = {
        ...baseMetric,
        value: 1000,
        timestamp: Date.now() - 1000,
      };

      const metric2: MetricData = {
        ...baseMetric,
        value: 1500,
        timestamp: Date.now(),
      };

      monitoringService.recordMetric(metric1);
      monitoringService.recordMetric(metric2);

      const metrics = monitoringService.getMetrics('test.memory.usage');
      expect(metrics).toHaveLength(2);
      expect(metrics[0]).toEqual(metric1);
      expect(metrics[1]).toEqual(metric2);
    });

    it('should filter metrics by time range', () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      const twoHoursAgo = now - 7200000;

      const oldMetric: MetricData = {
        name: 'test.requests',
        value: 100,
        timestamp: twoHoursAgo,
      };

      const recentMetric: MetricData = {
        name: 'test.requests',
        value: 200,
        timestamp: oneHourAgo,
      };

      const currentMetric: MetricData = {
        name: 'test.requests',
        value: 300,
        timestamp: now,
      };

      monitoringService.recordMetric(oldMetric);
      monitoringService.recordMetric(recentMetric);
      monitoringService.recordMetric(currentMetric);

      // Get metrics since one hour ago
      const filteredMetrics = monitoringService.getMetrics('test.requests', oneHourAgo);
      expect(filteredMetrics).toHaveLength(2);
      expect(filteredMetrics[0].value).toBe(200);
      expect(filteredMetrics[1].value).toBe(300);
    });
  });

  describe('Metric Statistics', () => {
    beforeEach(() => {
      // Setup test metrics
      const metrics = [
        { name: 'test.stats', value: 10, timestamp: Date.now() - 4000 },
        { name: 'test.stats', value: 20, timestamp: Date.now() - 3000 },
        { name: 'test.stats', value: 15, timestamp: Date.now() - 2000 },
        { name: 'test.stats', value: 25, timestamp: Date.now() - 1000 },
        { name: 'test.stats', value: 30, timestamp: Date.now() },
      ];

      metrics.forEach(metric => monitoringService.recordMetric(metric));
    });

    it('should calculate statistics correctly', () => {
      const stats = monitoringService.getMetricStats('test.stats');

      expect(stats).toEqual({
        count: 5,
        min: 10,
        max: 30,
        avg: 20, // (10 + 20 + 15 + 25 + 30) / 5
        latest: 30,
        trend: 'up', // 30 > 25 * 1.05
      });
    });

    it('should return null for non-existent metric', () => {
      const stats = monitoringService.getMetricStats('nonexistent.metric');
      expect(stats).toBeNull();
    });

    it('should detect trend correctly', () => {
      // Test stable trend
      const stableMetrics = [
        { name: 'test.stable', value: 100, timestamp: Date.now() - 1000 },
        { name: 'test.stable', value: 102, timestamp: Date.now() },
      ];
      
      stableMetrics.forEach(metric => monitoringService.recordMetric(metric));
      const stableStats = monitoringService.getMetricStats('test.stable');
      expect(stableStats?.trend).toBe('stable');

      // Test down trend
      const downMetrics = [
        { name: 'test.down', value: 100, timestamp: Date.now() - 1000 },
        { name: 'test.down', value: 80, timestamp: Date.now() },
      ];
      
      downMetrics.forEach(metric => monitoringService.recordMetric(metric));
      const downStats = monitoringService.getMetricStats('test.down');
      expect(downStats?.trend).toBe('down');
    });
  });

  describe('Alert Rules', () => {
    const testRule: AlertRule = {
      id: 'test-rule-1',
      name: 'High CPU Usage',
      metric: 'test.cpu.usage',
      condition: 'gt',
      threshold: 80,
      duration: 300,
      severity: 'high',
      enabled: true,
      cooldown: 600,
    };

    it('should add alert rule', () => {
      monitoringService.addAlertRule(testRule);

      // Can't directly access rules, but we can test by triggering an alert
      const metric: MetricData = {
        name: 'test.cpu.usage',
        value: 85, // Above threshold
        timestamp: Date.now(),
      };

      monitoringService.recordMetric(metric);

      const activeAlerts = monitoringService.getActiveAlerts();
      expect(activeAlerts.length).toBeGreaterThan(0);
      expect(activeAlerts[0].ruleId).toBe(testRule.id);
      expect(activeAlerts[0].value).toBe(85);
      expect(activeAlerts[0].threshold).toBe(80);
    });

    it('should not trigger alert when condition is not met', () => {
      monitoringService.addAlertRule(testRule);

      const metric: MetricData = {
        name: 'test.cpu.usage',
        value: 75, // Below threshold
        timestamp: Date.now(),
      };

      monitoringService.recordMetric(metric);

      const activeAlerts = monitoringService.getActiveAlerts();
      const testAlerts = activeAlerts.filter(alert => alert.ruleId === testRule.id);
      expect(testAlerts).toHaveLength(0);
    });

    it('should not trigger alert when rule is disabled', () => {
      const disabledRule = { ...testRule, enabled: false };
      monitoringService.addAlertRule(disabledRule);

      const metric: MetricData = {
        name: 'test.cpu.usage',
        value: 85, // Above threshold
        timestamp: Date.now(),
      };

      monitoringService.recordMetric(metric);

      const activeAlerts = monitoringService.getActiveAlerts();
      const testAlerts = activeAlerts.filter(alert => alert.ruleId === testRule.id);
      expect(testAlerts).toHaveLength(0);
    });

    it('should test different conditions', () => {
      const rules: AlertRule[] = [
        { ...testRule, id: 'lt-rule', condition: 'lt', threshold: 50 },
        { ...testRule, id: 'gte-rule', condition: 'gte', threshold: 80 },
        { ...testRule, id: 'lte-rule', condition: 'lte', threshold: 20 },
        { ...testRule, id: 'eq-rule', condition: 'eq', threshold: 100 },
      ];

      rules.forEach(rule => monitoringService.addAlertRule(rule));

      // Test lt condition (value 45 < threshold 50)
      monitoringService.recordMetric({
        name: 'test.cpu.usage',
        value: 45,
        timestamp: Date.now(),
      });

      // Test gte condition (value 80 >= threshold 80)
      monitoringService.recordMetric({
        name: 'test.cpu.usage',
        value: 80,
        timestamp: Date.now(),
      });

      // Test lte condition (value 20 <= threshold 20)
      monitoringService.recordMetric({
        name: 'test.cpu.usage',
        value: 20,
        timestamp: Date.now(),
      });

      // Test eq condition (value 100 == threshold 100)
      monitoringService.recordMetric({
        name: 'test.cpu.usage',
        value: 100,
        timestamp: Date.now(),
      });

      const activeAlerts = monitoringService.getActiveAlerts();
      const triggeringRules = ['lt-rule', 'gte-rule', 'lte-rule', 'eq-rule'];
      
      triggeringRules.forEach(ruleId => {
        const alert = activeAlerts.find(a => a.ruleId === ruleId);
        expect(alert).toBeDefined();
      });
    });

    it('should remove alert rule', () => {
      monitoringService.addAlertRule(testRule);
      const removed = monitoringService.removeAlertRule(testRule.id);
      expect(removed).toBe(true);

      // Rule should no longer trigger alerts
      const metric: MetricData = {
        name: 'test.cpu.usage',
        value: 85,
        timestamp: Date.now(),
      };

      monitoringService.recordMetric(metric);

      const activeAlerts = monitoringService.getActiveAlerts();
      const testAlerts = activeAlerts.filter(alert => alert.ruleId === testRule.id);
      expect(testAlerts).toHaveLength(0);
    });
  });

  describe('Alert Management', () => {
    const testRule: AlertRule = {
      id: 'test-rule-2',
      name: 'Memory Usage Alert',
      metric: 'test.memory.usage',
      condition: 'gt',
      threshold: 1000,
      duration: 300,
      severity: 'medium',
      enabled: true,
    };

    beforeEach(() => {
      monitoringService.addAlertRule(testRule);
    });

    it('should resolve alerts', () => {
      // Trigger an alert
      const metric: MetricData = {
        name: 'test.memory.usage',
        value: 1500,
        timestamp: Date.now(),
      };

      monitoringService.recordMetric(metric);

      let activeAlerts = monitoringService.getActiveAlerts();
      expect(activeAlerts.length).toBeGreaterThan(0);

      const alertId = activeAlerts[0].id;
      const resolved = monitoringService.resolveAlert(alertId);
      expect(resolved).toBe(true);

      activeAlerts = monitoringService.getActiveAlerts();
      const unresolvedAlert = activeAlerts.find(alert => alert.id === alertId);
      expect(unresolvedAlert).toBeUndefined();

      // All alerts should include resolved ones
      const allAlerts = monitoringService.getAllAlerts();
      const resolvedAlert = allAlerts.find(alert => alert.id === alertId);
      expect(resolvedAlert).toBeDefined();
      expect(resolvedAlert?.resolved).toBe(true);
      expect(resolvedAlert?.resolvedAt).toBeDefined();
    });

    it('should not resolve non-existent alert', () => {
      const resolved = monitoringService.resolveAlert('non-existent-alert-id');
      expect(resolved).toBe(false);
    });

    it('should not resolve already resolved alert', () => {
      // Trigger an alert
      const metric: MetricData = {
        name: 'test.memory.usage',
        value: 1500,
        timestamp: Date.now(),
      };

      monitoringService.recordMetric(metric);

      const activeAlerts = monitoringService.getActiveAlerts();
      const alertId = activeAlerts[0].id;

      // Resolve once
      const firstResolve = monitoringService.resolveAlert(alertId);
      expect(firstResolve).toBe(true);

      // Try to resolve again
      const secondResolve = monitoringService.resolveAlert(alertId);
      expect(secondResolve).toBe(false);
    });
  });

  describe('Prometheus Export', () => {
    beforeEach(() => {
      // Add some test metrics
      const metrics = [
        {
          name: 'test.http.requests.total',
          value: 1000,
          timestamp: Date.now(),
          tags: { method: 'GET', status: '200' },
        },
        {
          name: 'test.memory.usage.bytes',
          value: 1024000,
          timestamp: Date.now(),
        },
      ];

      metrics.forEach(metric => monitoringService.recordMetric(metric));
    });

    it('should export metrics in Prometheus format', () => {
      const prometheusMetrics = monitoringService.exportPrometheusMetrics();

      expect(prometheusMetrics).toContain('# HELP test_http_requests_total test.http.requests.total');
      expect(prometheusMetrics).toContain('# TYPE test_http_requests_total gauge');
      expect(prometheusMetrics).toContain('test_http_requests_total{method="GET",status="200"} 1000');

      expect(prometheusMetrics).toContain('# HELP test_memory_usage_bytes test.memory.usage.bytes');
      expect(prometheusMetrics).toContain('# TYPE test_memory_usage_bytes gauge');
      expect(prometheusMetrics).toContain('test_memory_usage_bytes 1024000');
    });

    it('should handle metrics without tags', () => {
      const prometheusMetrics = monitoringService.exportPrometheusMetrics();
      expect(prometheusMetrics).toContain('test_memory_usage_bytes 1024000');
    });

    it('should sanitize metric names for Prometheus', () => {
      const metric: MetricData = {
        name: 'test.some-metric.with-dashes',
        value: 42,
        timestamp: Date.now(),
      };

      monitoringService.recordMetric(metric);
      const prometheusMetrics = monitoringService.exportPrometheusMetrics();
      
      expect(prometheusMetrics).toContain('test_some_metric_with_dashes 42');
    });
  });

  describe('Summary', () => {
    it('should provide monitoring summary', () => {
      // Add some metrics and alerts
      monitoringService.recordMetric({
        name: 'test.metric.1',
        value: 100,
        timestamp: Date.now(),
      });

      monitoringService.recordMetric({
        name: 'test.metric.2',
        value: 200,
        timestamp: Date.now(),
      });

      const highAlert: AlertRule = {
        id: 'high-alert',
        name: 'High Alert',
        metric: 'test.metric.1',
        condition: 'gt',
        threshold: 50,
        duration: 300,
        severity: 'high',
        enabled: true,
      };

      monitoringService.addAlertRule(highAlert);

      // This should trigger the alert
      monitoringService.recordMetric({
        name: 'test.metric.1',
        value: 100,
        timestamp: Date.now(),
      });

      const summary = monitoringService.getSummary();

      expect(summary.totalMetrics).toBeGreaterThanOrEqual(2);
      expect(summary.activeAlerts).toBeGreaterThanOrEqual(1);
      expect(summary.alertRules).toBeGreaterThanOrEqual(1);
      expect(['healthy', 'warning', 'critical']).toContain(summary.systemHealth);
    });
  });
});