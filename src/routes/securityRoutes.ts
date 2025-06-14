import { Router } from 'express';
import { securityController } from '../controllers/securityController';
import { authenticate, authorize } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { body, param, query } from 'express-validator';

const router = Router();

// All security routes require authentication
router.use(authenticate);

// Validation schemas
const userIdValidation = [
  param('userId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('User ID is required'),
];

const securityCheckValidation = [
  body('ipAddress')
    .optional()
    .isIP()
    .withMessage('Invalid IP address format'),
  body('userAgent')
    .optional()
    .isString()
    .withMessage('User agent must be a string'),
];

const invalidateSessionsValidation = [
  body('reason')
    .optional()
    .isString()
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason must be between 1 and 500 characters'),
];

const lockAccountValidation = [
  body('reason')
    .isString()
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason is required and must be between 1 and 500 characters'),
  body('duration')
    .optional()
    .isInt({ min: 300, max: 86400 }) // 5 minutes to 24 hours
    .withMessage('Duration must be between 300 and 86400 seconds'),
];

const unlockAccountValidation = [
  body('reason')
    .isString()
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason is required and must be between 1 and 500 characters'),
];

const statsDateValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
];

/**
 * @swagger
 * components:
 *   schemas:
 *     SecurityEvent:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         userId:
 *           type: string
 *         action:
 *           type: string
 *         resource:
 *           type: string
 *         details:
 *           type: object
 *         ipAddress:
 *           type: string
 *         userAgent:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *     
 *     SecurityOverview:
 *       type: object
 *       properties:
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             email:
 *               type: string
 *             isActive:
 *               type: boolean
 *             twoFactorEnabled:
 *               type: boolean
 *             lastLoginAt:
 *               type: string
 *               format: date-time
 *         statistics:
 *           type: object
 *           properties:
 *             totalSecurityEvents:
 *               type: integer
 *             failedLoginAttempts:
 *               type: integer
 *             successfulLogins:
 *               type: integer
 *             activeSessions:
 *               type: integer
 */

/**
 * @swagger
 * /api/v1/security/users/{userId}/events:
 *   get:
 *     summary: Get security events for a specific user
 *     tags: [Security]
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
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
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
 *         name: action
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Security events retrieved successfully
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
 *                     events:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SecurityEvent'
 *                     pagination:
 *                       type: object
 */
router.get('/users/:userId/events',
  authorize(['admin', 'super_admin', 'security_manager']),
  userIdValidation,
  validateRequest,
  securityController.getSecurityEvents
);

/**
 * @swagger
 * /api/v1/security/users/{userId}/overview:
 *   get:
 *     summary: Get security overview for a specific user
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Security overview retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/SecurityOverview'
 */
router.get('/users/:userId/overview',
  authorize(['admin', 'super_admin', 'security_manager']),
  userIdValidation,
  validateRequest,
  securityController.getSecurityOverview
);

/**
 * @swagger
 * /api/v1/security/users/{userId}/check:
 *   post:
 *     summary: Manually trigger security check for a user
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ipAddress:
 *                 type: string
 *               userAgent:
 *                 type: string
 *     responses:
 *       200:
 *         description: Security check triggered successfully
 */
router.post('/users/:userId/check',
  authorize(['admin', 'super_admin', 'security_manager']),
  userIdValidation,
  securityCheckValidation,
  validateRequest,
  securityController.triggerSecurityCheck
);

/**
 * @swagger
 * /api/v1/security/users/{userId}/sessions/invalidate:
 *   post:
 *     summary: Invalidate all sessions for a user
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for invalidating sessions
 *     responses:
 *       200:
 *         description: All sessions invalidated successfully
 */
router.post('/users/:userId/sessions/invalidate',
  authorize(['admin', 'super_admin', 'security_manager']),
  userIdValidation,
  invalidateSessionsValidation,
  validateRequest,
  securityController.invalidateAllSessions
);

/**
 * @swagger
 * /api/v1/security/users/{userId}/lock:
 *   post:
 *     summary: Lock user account for security reasons
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for locking the account
 *               duration:
 *                 type: integer
 *                 description: Lock duration in seconds (default 3600)
 *                 minimum: 300
 *                 maximum: 86400
 *     responses:
 *       200:
 *         description: Account locked successfully
 */
router.post('/users/:userId/lock',
  authorize(['admin', 'super_admin', 'security_manager']),
  userIdValidation,
  lockAccountValidation,
  validateRequest,
  securityController.lockAccount
);

/**
 * @swagger
 * /api/v1/security/users/{userId}/unlock:
 *   post:
 *     summary: Unlock user account
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for unlocking the account
 *     responses:
 *       200:
 *         description: Account unlocked successfully
 */
router.post('/users/:userId/unlock',
  authorize(['admin', 'super_admin', 'security_manager']),
  userIdValidation,
  unlockAccountValidation,
  validateRequest,
  securityController.unlockAccount
);

/**
 * @swagger
 * /api/v1/security/stats:
 *   get:
 *     summary: Get system-wide security statistics
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for statistics (default 7 days ago)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for statistics (default now)
 *     responses:
 *       200:
 *         description: Security statistics retrieved successfully
 */
router.get('/stats',
  authorize(['admin', 'super_admin', 'security_manager']),
  statsDateValidation,
  validateRequest,
  securityController.getSystemSecurityStats
);

export default router;