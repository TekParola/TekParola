import { Router } from 'express';
import { dashboardController } from '../controllers/dashboardController';
import { authenticate, authorize } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { query } from 'express-validator';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

// All dashboard routes require admin role
router.use(authorize(['admin', 'super_admin']));

// Validation schemas
const dateRangeValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      if (req.query?.startDate && value) {
        return new Date(value) >= new Date(req.query.startDate as string);
      }
      return true;
    })
    .withMessage('End date must be after start date'),
];

const periodValidation = [
  query('period')
    .optional()
    .isIn(['1h', '6h', '12h', '24h', '7d', '30d', '90d'])
    .withMessage('Invalid period format'),
];

const paginationValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];

/**
 * @swagger
 * /api/v1/dashboard/overview:
 *   get:
 *     summary: Get dashboard overview
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for the overview period
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for the overview period
 *     responses:
 *       200:
 *         description: Dashboard overview data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalUsers:
 *                       type: integer
 *                     activeUsers:
 *                       type: integer
 *                     newUsersToday:
 *                       type: integer
 *                     totalApplications:
 *                       type: integer
 *                     totalLogins:
 *                       type: integer
 *                     failedLogins:
 *                       type: integer
 */
router.get('/overview', dateRangeValidation, validateRequest, dashboardController.getOverview);

/**
 * @swagger
 * /api/v1/dashboard/user-growth:
 *   get:
 *     summary: Get user growth statistics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d]
 *         description: Time period for growth data
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *         description: Grouping for the data
 *     responses:
 *       200:
 *         description: User growth data
 */
router.get('/user-growth', 
  [
    query('period').optional().isIn(['7d', '30d', '90d']),
    query('groupBy').optional().isIn(['day', 'week', 'month']),
  ], 
  validateRequest, 
  dashboardController.getUserGrowth
);

/**
 * @swagger
 * /api/v1/dashboard/login-activity:
 *   get:
 *     summary: Get login activity statistics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [1h, 6h, 12h, 24h, 7d]
 *         description: Time period for activity data
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [hour, day, week]
 *         description: Grouping for the data
 *     responses:
 *       200:
 *         description: Login activity data
 */
router.get('/login-activity', 
  [
    query('period').optional().isIn(['1h', '6h', '12h', '24h', '7d']),
    query('groupBy').optional().isIn(['hour', 'day', 'week']),
  ], 
  validateRequest, 
  dashboardController.getLoginActivity
);

/**
 * @swagger
 * /api/v1/dashboard/application-usage:
 *   get:
 *     summary: Get application usage statistics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of applications to return
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Application usage data
 */
router.get('/application-usage', 
  [...dateRangeValidation, ...paginationValidation], 
  validateRequest, 
  dashboardController.getApplicationUsage
);

/**
 * @swagger
 * /api/v1/dashboard/system-health:
 *   get:
 *     summary: Get system health metrics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System health data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
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
 *                         memoryUsage:
 *                           type: number
 *                     api:
 *                       type: object
 *                       properties:
 *                         uptime:
 *                           type: number
 *                         memoryUsage:
 *                           type: object
 */
router.get('/system-health', dashboardController.getSystemHealth);

/**
 * @swagger
 * /api/v1/dashboard/security-overview:
 *   get:
 *     summary: Get security overview
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [1h, 6h, 12h, 24h, 7d]
 *     responses:
 *       200:
 *         description: Security overview data
 */
router.get('/security-overview', periodValidation, validateRequest, dashboardController.getSecurityOverview);

/**
 * @swagger
 * /api/v1/dashboard/role-distribution:
 *   get:
 *     summary: Get role distribution statistics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Role distribution data
 */
router.get('/role-distribution', dashboardController.getRoleDistribution);

/**
 * @swagger
 * /api/v1/dashboard/recent-activities:
 *   get:
 *     summary: Get recent system activities
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: applicationId
 *         schema:
 *           type: string
 *         description: Filter by application ID
 *     responses:
 *       200:
 *         description: Recent activities
 */
router.get('/recent-activities', 
  [
    ...paginationValidation,
    query('userId').optional().isString(),
    query('applicationId').optional().isString(),
  ], 
  validateRequest, 
  dashboardController.getRecentActivities
);

/**
 * @swagger
 * /api/v1/dashboard/performance-metrics:
 *   get:
 *     summary: Get API performance metrics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [1h, 6h, 12h, 24h]
 *     responses:
 *       200:
 *         description: Performance metrics data
 */
router.get('/performance-metrics', periodValidation, validateRequest, dashboardController.getPerformanceMetrics);

export default router;