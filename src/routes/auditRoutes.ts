import { Router, Request, Response, NextFunction } from 'express';
import { auditController } from '../controllers/auditController';
import { authenticate, authorize } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { query, param, body } from 'express-validator';

const router = Router();

// All audit routes require authentication
router.use(authenticate);

// Validation schemas
const auditFiltersValidation = [
  query('userId').optional().isString(),
  query('applicationId').optional().isString(),
  query('action').optional().isString(),
  query('resource').optional().isString(),
  query('success').optional().isIn(['true', 'false']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('ipAddress').optional().isIP(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  query('orderBy').optional().isIn(['createdAt', 'action', 'resource', 'userId']),
  query('order').optional().isIn(['asc', 'desc']),
];

const paginationValidation = [
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
];

/**
 * @swagger
 * /api/v1/audit/logs:
 *   get:
 *     summary: Get audit logs
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: applicationId
 *         schema:
 *           type: string
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *       - in: query
 *         name: success
 *         schema:
 *           type: string
 *           enum: [true, false]
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
 *       - in: query
 *         name: ipAddress
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 */
router.get('/logs', 
  authorize(['admin', 'super_admin', 'auditor']), 
  auditFiltersValidation, 
  validateRequest, 
  auditController.getLogs
);

/**
 * @swagger
 * /api/v1/audit/logs/{id}:
 *   get:
 *     summary: Get audit log by ID
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Audit log retrieved successfully
 *       404:
 *         description: Audit log not found
 */
router.get('/logs/:id',
  authorize(['admin', 'super_admin', 'auditor']),
  param('id').isString(),
  validateRequest,
  auditController.getLogById
);

/**
 * @swagger
 * /api/v1/audit/users/{userId}:
 *   get:
 *     summary: Get user activity logs
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: User activity retrieved successfully
 */
router.get('/users/:userId',
  authorize(['admin', 'super_admin', 'auditor']),
  param('userId').isString(),
  paginationValidation,
  validateRequest,
  auditController.getUserActivity
);

/**
 * @swagger
 * /api/v1/audit/applications/{applicationId}:
 *   get:
 *     summary: Get application activity logs
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Application activity retrieved successfully
 */
router.get('/applications/:applicationId',
  authorize(['admin', 'super_admin', 'auditor']),
  param('applicationId').isString(),
  paginationValidation,
  validateRequest,
  auditController.getApplicationActivity
);

/**
 * @swagger
 * /api/v1/audit/stats/actions:
 *   get:
 *     summary: Get action statistics
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: applicationId
 *         schema:
 *           type: string
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *       - in: query
 *         name: success
 *         schema:
 *           type: string
 *           enum: [true, false]
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
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Action statistics retrieved successfully
 */
router.get('/stats/actions',
  authorize(['admin', 'super_admin', 'auditor']),
  [
    query('userId').optional().isString(),
    query('applicationId').optional().isString(),
    query('resource').optional().isString(),
    query('success').optional().isIn(['true', 'false']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  validateRequest,
  auditController.getActionStats
);

/**
 * @swagger
 * /api/v1/audit/security-events:
 *   get:
 *     summary: Get security events
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Security events retrieved successfully
 */
router.get('/security-events',
  authorize(['admin', 'super_admin', 'auditor']),
  paginationValidation,
  validateRequest,
  auditController.getSecurityEvents
);

/**
 * @swagger
 * /api/v1/audit/failed-actions:
 *   get:
 *     summary: Get failed actions
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: applicationId
 *         schema:
 *           type: string
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
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
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Failed actions retrieved successfully
 */
router.get('/failed-actions',
  authorize(['admin', 'super_admin', 'auditor']),
  [
    query('userId').optional().isString(),
    query('applicationId').optional().isString(),
    query('action').optional().isString(),
    query('resource').optional().isString(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    ...paginationValidation,
  ],
  validateRequest,
  auditController.getFailedActions
);

/**
 * @swagger
 * /api/v1/audit/export:
 *   get:
 *     summary: Export audit logs
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: applicationId
 *         schema:
 *           type: string
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *       - in: query
 *         name: success
 *         schema:
 *           type: string
 *           enum: [true, false]
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
 *         description: Audit logs exported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get('/export',
  authorize(['admin', 'super_admin']),
  [
    query('format').optional().isIn(['json', 'csv']),
    ...auditFiltersValidation,
  ],
  validateRequest,
  auditController.exportLogs
);

/**
 * @swagger
 * /api/v1/audit/cleanup:
 *   post:
 *     summary: Clean up old audit logs
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               retentionDays:
 *                 type: integer
 *                 minimum: 30
 *                 default: 90
 *     responses:
 *       200:
 *         description: Audit logs cleaned up successfully
 */
router.post('/cleanup',
  authorize(['super_admin']),
  body('retentionDays').optional().isInt({ min: 30 }),
  validateRequest,
  auditController.cleanup
);

// User's own audit logs (no admin role required)
/**
 * @swagger
 * /api/v1/audit/my-activity:
 *   get:
 *     summary: Get current user's activity logs
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: User activity retrieved successfully
 */
router.get('/my-activity',
  paginationValidation,
  validateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    req.params.userId = req.user!.id;
    return auditController.getUserActivity(req, res, next);
  }
);

export default router;