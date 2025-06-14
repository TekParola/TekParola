import { Router } from 'express';
import { healthController } from '../controllers/healthController';
import { generalLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Basic health check
 *     description: Simple health check endpoint for load balancers
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                   description: Process uptime in seconds
 *                 version:
 *                   type: string
 *                   description: Application version
 *                 environment:
 *                   type: string
 *                   description: Environment name
 *       503:
 *         description: Service is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: unhealthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 error:
 *                   type: string
 */
router.get('/', generalLimiter, healthController.getBasicHealth);

/**
 * @openapi
 * /health/detailed:
 *   get:
 *     tags: [System]
 *     summary: Detailed health check
 *     description: Comprehensive health check including all services and dependencies
 *     responses:
 *       200:
 *         description: Service health information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, degraded, unhealthy]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 version:
 *                   type: string
 *                 environment:
 *                   type: string
 *                 services:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [healthy, degraded, unhealthy]
 *                         responseTime:
 *                           type: number
 *                         error:
 *                           type: string
 *                     redis:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [healthy, degraded, unhealthy]
 *                         responseTime:
 *                           type: number
 *                         error:
 *                           type: string
 *                     email:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [healthy, degraded, unhealthy]
 *                         responseTime:
 *                           type: number
 *                         error:
 *                           type: string
 *                     circuitBreakers:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           state:
 *                             type: string
 *                           healthy:
 *                             type: boolean
 *                           failureCount:
 *                             type: number
 *                           successCount:
 *                             type: number
 *                     externalServices:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           healthy:
 *                             type: boolean
 *                           failureRate:
 *                             type: number
 *                           successRate:
 *                             type: number
 *                 performance:
 *                   type: object
 *                   properties:
 *                     memoryUsage:
 *                       type: object
 *                       properties:
 *                         rss:
 *                           type: number
 *                         heapTotal:
 *                           type: number
 *                         heapUsed:
 *                           type: number
 *                         external:
 *                           type: number
 *                         arrayBuffers:
 *                           type: number
 *                     cpuUsage:
 *                       type: object
 *                       properties:
 *                         user:
 *                           type: number
 *                         system:
 *                           type: number
 *                     eventLoopDelay:
 *                       type: number
 *       503:
 *         description: Service is unhealthy
 */
router.get('/detailed', generalLimiter, healthController.getDetailedHealth);

/**
 * @openapi
 * /health/ready:
 *   get:
 *     tags: [System]
 *     summary: Readiness probe
 *     description: Kubernetes readiness probe - checks if service is ready to accept traffic
 *     responses:
 *       200:
 *         description: Service is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ready
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 services:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         responseTime:
 *                           type: number
 *                     redis:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         responseTime:
 *                           type: number
 *       503:
 *         description: Service is not ready
 */
router.get('/ready', healthController.getReadiness);

/**
 * @openapi
 * /health/live:
 *   get:
 *     tags: [System]
 *     summary: Liveness probe
 *     description: Kubernetes liveness probe - checks if service process is alive
 *     responses:
 *       200:
 *         description: Service is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: alive
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 memoryUsage:
 *                   type: string
 *       503:
 *         description: Service is not alive or unhealthy
 */
router.get('/live', healthController.getLiveness);

export default router;