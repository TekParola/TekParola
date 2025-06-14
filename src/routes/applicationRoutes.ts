import { Router } from 'express';
import { applicationController } from '../controllers/applicationController';
import { authenticate, authorize } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import {
  validateApplicationId,
  validateCreateApplication,
  validateUpdateApplication,
  validateApplicationSearch,
  validateCreateApiKey,
  validateUpdateApiKey,
  validateApiKeyId,
  validateVerifyApiKey,
  validateScheduleRotation,
  validateAutoRotation,
  validateRotationHistory,
} from '../validators/applicationValidators';

const router = Router();

// All application routes require authentication
router.use(authenticate);

// Get all applications (admin only)
router.get(
  '/',
  authorize('applications.read'),
  applicationController.getAllApplications
);

// Get application statistics (admin only)
router.get(
  '/stats',
  authorize('applications.read'),
  applicationController.getApplicationStats
);

// Search applications (admin only)
router.get(
  '/search',
  authorize('applications.read'),
  validateApplicationSearch,
  validateRequest,
  applicationController.searchApplications
);

// Create new application (admin only)
router.post(
  '/',
  authorize('applications.create'),
  validateCreateApplication,
  validateRequest,
  applicationController.createApplication
);

// Verify API key (for testing)
router.post(
  '/verify-key',
  authorize('applications.read'),
  validateVerifyApiKey,
  validateRequest,
  applicationController.verifyApiKey
);

// Get application by ID (admin only)
router.get(
  '/:id',
  authorize('applications.read'),
  validateApplicationId,
  validateRequest,
  applicationController.getApplicationById
);

// Update application (admin only)
router.put(
  '/:id',
  authorize('applications.update'),
  validateApplicationId,
  validateUpdateApplication,
  validateRequest,
  applicationController.updateApplication
);

// Delete application (admin only)
router.delete(
  '/:id',
  authorize('applications.delete'),
  validateApplicationId,
  validateRequest,
  applicationController.deleteApplication
);

// Regenerate client secret (admin only)
router.post(
  '/:id/regenerate-secret',
  authorize('applications.update'),
  validateApplicationId,
  validateRequest,
  applicationController.regenerateClientSecret
);

// API Key Management

// Get application API keys (admin only)
router.get(
  '/:id/api-keys',
  authorize('applications.read'),
  validateApplicationId,
  validateRequest,
  applicationController.getApplicationApiKeys
);

// Create API key (admin only)
router.post(
  '/:id/api-keys',
  authorize('applications.create'),
  validateApplicationId,
  validateCreateApiKey,
  validateRequest,
  applicationController.createApiKey
);

// Update API key (admin only)
router.put(
  '/:id/api-keys/:keyId',
  authorize('applications.update'),
  validateApplicationId,
  validateApiKeyId,
  validateUpdateApiKey,
  validateRequest,
  applicationController.updateApiKey
);

// Delete API key (admin only)
router.delete(
  '/:id/api-keys/:keyId',
  authorize('applications.delete'),
  validateApplicationId,
  validateApiKeyId,
  validateRequest,
  applicationController.deleteApiKey
);

// API Key Rotation Management

/**
 * @swagger
 * /api/v1/applications/api-keys/rotation-queue:
 *   get:
 *     summary: Get API keys scheduled for rotation
 *     tags: [Applications - API Key Rotation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API keys scheduled for rotation retrieved successfully
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
 *                     apiKeys:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           keyId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           applicationName:
 *                             type: string
 *                           scheduledRotationAt:
 *                             type: string
 *                             format: date-time
 *                           autoRotateAfterDays:
 *                             type: integer
 */
router.get(
  '/api-keys/rotation-queue',
  authorize('applications.read'),
  applicationController.getApiKeysForRotation
);

/**
 * @swagger
 * /api/v1/applications/api-keys/stats:
 *   get:
 *     summary: Get API key statistics
 *     tags: [Applications - API Key Rotation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API key statistics retrieved successfully
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
 *                     total:
 *                       type: integer
 *                     active:
 *                       type: integer
 *                     expired:
 *                       type: integer
 *                     scheduledForRotation:
 *                       type: integer
 *                     autoRotationEnabled:
 *                       type: integer
 */
router.get(
  '/api-keys/stats',
  authorize('applications.read'),
  applicationController.getApiKeyStats
);

/**
 * @swagger
 * /api/v1/applications/api-keys/trigger-rotation-check:
 *   post:
 *     summary: Manually trigger rotation check for all API keys
 *     tags: [Applications - API Key Rotation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Rotation check triggered successfully
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
 *                     processedKeys:
 *                       type: integer
 *                     successful:
 *                       type: integer
 *                     failed:
 *                       type: integer
 */
router.post(
  '/api-keys/trigger-rotation-check',
  authorize('applications.update'),
  applicationController.triggerRotationCheck
);

/**
 * @swagger
 * /api/v1/applications/{id}/api-keys/{keyId}/rotate:
 *   post:
 *     summary: Rotate API key immediately
 *     tags: [Applications - API Key Rotation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *         description: API Key ID
 *     responses:
 *       200:
 *         description: API key rotated successfully
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
 *                     apiKey:
 *                       type: object
 *                     keySecret:
 *                       type: string
 *                     oldKeyId:
 *                       type: string
 *                     warning:
 *                       type: string
 */
router.post(
  '/:id/api-keys/:keyId/rotate',
  authorize('applications.update'),
  validateApplicationId,
  validateApiKeyId,
  validateRequest,
  applicationController.rotateApiKey
);

/**
 * @swagger
 * /api/v1/applications/{id}/api-keys/{keyId}/schedule-rotation:
 *   post:
 *     summary: Schedule API key rotation for a specific date
 *     tags: [Applications - API Key Rotation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *         description: API Key ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rotationDate
 *             properties:
 *               rotationDate:
 *                 type: string
 *                 format: date-time
 *                 description: When to rotate the API key (ISO 8601 format)
 *     responses:
 *       200:
 *         description: API key rotation scheduled successfully
 */
router.post(
  '/:id/api-keys/:keyId/schedule-rotation',
  authorize('applications.update'),
  validateApplicationId,
  validateApiKeyId,
  validateScheduleRotation,
  validateRequest,
  applicationController.scheduleApiKeyRotation
);

/**
 * @swagger
 * /api/v1/applications/{id}/api-keys/{keyId}/enable-auto-rotation:
 *   post:
 *     summary: Enable automatic rotation for API key
 *     tags: [Applications - API Key Rotation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *         description: API Key ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rotateAfterDays
 *             properties:
 *               rotateAfterDays:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 365
 *                 description: Rotate API key every X days
 *     responses:
 *       200:
 *         description: Auto rotation enabled successfully
 */
router.post(
  '/:id/api-keys/:keyId/enable-auto-rotation',
  authorize('applications.update'),
  validateApplicationId,
  validateApiKeyId,
  validateAutoRotation,
  validateRequest,
  applicationController.enableAutoRotation
);

/**
 * @swagger
 * /api/v1/applications/{id}/api-keys/{keyId}/disable-auto-rotation:
 *   post:
 *     summary: Disable automatic rotation for API key
 *     tags: [Applications - API Key Rotation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *         description: API Key ID
 *     responses:
 *       200:
 *         description: Auto rotation disabled successfully
 */
router.post(
  '/:id/api-keys/:keyId/disable-auto-rotation',
  authorize('applications.update'),
  validateApplicationId,
  validateApiKeyId,
  validateRequest,
  applicationController.disableAutoRotation
);

/**
 * @swagger
 * /api/v1/applications/{id}/api-keys/{keyId}/rotation-history:
 *   get:
 *     summary: Get API key rotation history
 *     tags: [Applications - API Key Rotation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *         description: API Key ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of history entries to return
 *     responses:
 *       200:
 *         description: API key rotation history retrieved successfully
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
 *                     history:
 *                       type: array
 *                       items:
 *                         type: object
 */
router.get(
  '/:id/api-keys/:keyId/rotation-history',
  authorize('applications.read'),
  validateApplicationId,
  validateApiKeyId,
  validateRotationHistory,
  validateRequest,
  applicationController.getApiKeyRotationHistory
);

export default router;