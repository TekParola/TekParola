import { Router, Request, Response } from 'express';
import { monitoringService } from '../services/monitoringService';
import { circuitBreakerRegistry } from '../utils/circuitBreaker';
import { ExternalApiFactory } from '../services/externalApiService';
import { generalLimiter } from '../middleware/rateLimiter';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /metrics:
 *   get:
 *     tags: [System]
 *     summary: Prometheus metrics endpoint
 *     description: Export metrics in Prometheus format for monitoring systems
 *     responses:
 *       200:
 *         description: Metrics in Prometheus format
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: |
 *                 # HELP system_memory_heap_used Heap memory used in bytes
 *                 # TYPE system_memory_heap_used gauge
 *                 system_memory_heap_used 52428800
 */
router.get('/', generalLimiter, (req: Request, res: Response) => {
  try {
    const metrics = monitoringService.exportPrometheusMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  } catch (error) {
    res.status(500).send('# Error generating metrics\n');
  }
});

/**
 * @openapi
 * /metrics/summary:
 *   get:
 *     tags: [System]
 *     summary: Monitoring summary
 *     description: Get a summary of monitoring status and alerts
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Monitoring summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalMetrics:
 *                   type: number
 *                 activeAlerts:
 *                   type: number
 *                 alertRules:
 *                   type: number
 *                 systemHealth:
 *                   type: string
 *                   enum: [healthy, warning, critical]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/summary', authenticate, authorize('system.read'), (req: Request, res: Response) => {
  try {
    const summary = monitoringService.getSummary();
    res.json({
      ...summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get monitoring summary',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @openapi
 * /metrics/alerts:
 *   get:
 *     tags: [System]
 *     summary: Get active alerts
 *     description: Retrieve all active monitoring alerts
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: active_only
 *         in: query
 *         description: Show only active alerts
 *         schema:
 *           type: boolean
 *           default: true
 *     responses:
 *       200:
 *         description: List of alerts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 alerts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       ruleId:
 *                         type: string
 *                       metric:
 *                         type: string
 *                       value:
 *                         type: number
 *                       threshold:
 *                         type: number
 *                       severity:
 *                         type: string
 *                         enum: [low, medium, high, critical]
 *                       message:
 *                         type: string
 *                       timestamp:
 *                         type: number
 *                       resolved:
 *                         type: boolean
 *                 count:
 *                   type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/alerts', authenticate, authorize('system.read'), (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.active_only !== 'false';
    const alerts = activeOnly ? monitoringService.getActiveAlerts() : monitoringService.getAllAlerts();
    
    res.json({
      alerts,
      count: alerts.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get alerts',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @openapi
 * /metrics/circuit-breakers:
 *   get:
 *     tags: [System]
 *     summary: Get circuit breaker status
 *     description: Retrieve status of all circuit breakers
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Circuit breaker status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 properties:
 *                   state:
 *                     type: string
 *                     enum: [CLOSED, OPEN, HALF_OPEN]
 *                   healthy:
 *                     type: boolean
 *                   failureCount:
 *                     type: number
 *                   successCount:
 *                     type: number
 *                   totalRequests:
 *                     type: number
 *                   failureRate:
 *                     type: number
 *                   successRate:
 *                     type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/circuit-breakers', authenticate, authorize('system.read'), (req: Request, res: Response) => {
  try {
    const status = circuitBreakerRegistry.getHealthStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get circuit breaker status',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @openapi
 * /metrics/external-services:
 *   get:
 *     tags: [System]
 *     summary: Get external service status
 *     description: Retrieve status of all external service integrations
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: External service status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 properties:
 *                   serviceName:
 *                     type: string
 *                   healthy:
 *                     type: boolean
 *                   failureRate:
 *                     type: number
 *                   successRate:
 *                     type: number
 *                   totalRequests:
 *                     type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/external-services', authenticate, authorize('system.read'), (req: Request, res: Response) => {
  try {
    const status = ExternalApiFactory.getHealthStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get external service status',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @openapi
 * /metrics/{metricName}:
 *   get:
 *     tags: [System]
 *     summary: Get specific metric data
 *     description: Retrieve data for a specific metric with optional time range
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: metricName
 *         in: path
 *         required: true
 *         description: Name of the metric to retrieve
 *         schema:
 *           type: string
 *       - name: since
 *         in: query
 *         description: Unix timestamp to retrieve metrics since
 *         schema:
 *           type: number
 *       - name: stats
 *         in: query
 *         description: Include statistical analysis
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: Metric data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 metricName:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       value:
 *                         type: number
 *                       timestamp:
 *                         type: number
 *                       tags:
 *                         type: object
 *                       unit:
 *                         type: string
 *                 stats:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: number
 *                     min:
 *                       type: number
 *                     max:
 *                       type: number
 *                     avg:
 *                       type: number
 *                     latest:
 *                       type: number
 *                     trend:
 *                       type: string
 *                       enum: [up, down, stable]
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/:metricName', authenticate, authorize('system.read'), (req: Request, res: Response) => {
  try {
    const { metricName } = req.params;
    const since = req.query.since ? parseInt(req.query.since as string) : undefined;
    const includeStats = req.query.stats === 'true';
    
    const data = monitoringService.getMetrics(metricName as string, since);
    
    if (data.length === 0) {
      return res.status(404).json({
        error: `Metric '${metricName}' not found`,
        availableMetrics: monitoringService.getMetricNames(),
      });
    }
    
    const response: any = {
      metricName,
      data,
      count: data.length,
    };
    
    if (includeStats) {
      response.stats = monitoringService.getMetricStats(metricName as string, since);
    }
    
    return res.json(response);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to get metric data',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @openapi
 * /metrics/alerts/{alertId}/resolve:
 *   post:
 *     tags: [System]
 *     summary: Resolve an alert
 *     description: Mark an alert as resolved
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: alertId
 *         in: path
 *         required: true
 *         description: ID of the alert to resolve
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Alert resolved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 alertId:
 *                   type: string
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/alerts/:alertId/resolve', authenticate, authorize('system.write'), (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const resolved = monitoringService.resolveAlert(alertId as string);
    
    if (!resolved) {
      return res.status(404).json({
        error: `Alert '${alertId}' not found or already resolved`,
      });
    }
    
    return res.json({
      success: true,
      message: 'Alert resolved successfully',
      alertId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to resolve alert',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;