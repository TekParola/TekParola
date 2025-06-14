import { Router } from 'express';
import { settingsController } from '../controllers/settingsController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { validateRequest } from '../middleware/validation';
import { body, param } from 'express-validator';

const router = Router();

// Validation schemas
const createSettingValidation = [
  body('key')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Key must contain only letters, numbers, and underscores'),
  body('value')
    .notEmpty()
    .withMessage('Value is required'),
  body('type')
    .isIn(['string', 'number', 'boolean', 'json'])
    .withMessage('Type must be one of: string, number, boolean, json'),
  body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be a string with max 500 characters'),
  body('category')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Category must be a string with max 50 characters'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean'),
];

const updateSettingValidation = [
  param('key')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Key must contain only letters, numbers, and underscores'),
  body('value')
    .notEmpty()
    .withMessage('Value is required'),
  body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be a string with max 500 characters'),
  body('category')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Category must be a string with max 50 characters'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean'),
];

const bulkUpdateValidation = [
  body('updates')
    .isArray({ min: 1 })
    .withMessage('Updates must be a non-empty array'),
  body('updates.*.key')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Each update key must contain only letters, numbers, and underscores'),
  body('updates.*.value')
    .notEmpty()
    .withMessage('Each update must have a value'),
];

const keyParamValidation = [
  param('key')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Key must contain only letters, numbers, and underscores'),
];

const categoryParamValidation = [
  param('category')
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Category must contain only letters, numbers, and underscores'),
];

// Public routes (no authentication required)
/**
 * @swagger
 * /api/settings/public:
 *   get:
 *     summary: Get all public settings
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Public settings retrieved successfully
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
 *                     settings:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Setting'
 */
router.get('/public', settingsController.getAllSettings);

/**
 * @swagger
 * /api/settings/public/category/{category}:
 *   get:
 *     summary: Get public settings by category
 *     tags: [Settings]
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *         description: Setting category
 *     responses:
 *       200:
 *         description: Public settings retrieved successfully
 *       404:
 *         description: Category not found
 */
router.get('/public/category/:category', categoryParamValidation, validateRequest, settingsController.getSettingsByCategory);

/**
 * @swagger
 * /api/settings/public/grouped:
 *   get:
 *     summary: Get public settings grouped by category
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Grouped public settings retrieved successfully
 */
router.get('/public/grouped', settingsController.getGroupedSettings);

/**
 * @swagger
 * /api/settings/categories:
 *   get:
 *     summary: Get all setting categories
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
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
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: string
 */
router.get('/categories', settingsController.getCategories);

// Protected routes (authentication required)
router.use(authenticate);

/**
 * @swagger
 * /api/settings:
 *   get:
 *     summary: Get all settings (admins can see private settings)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includePrivate
 *         schema:
 *           type: boolean
 *         description: Include private settings (admin only)
 *     responses:
 *       200:
 *         description: Settings retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', settingsController.getAllSettings);

/**
 * @swagger
 * /api/settings/grouped:
 *   get:
 *     summary: Get settings grouped by category
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includePrivate
 *         schema:
 *           type: boolean
 *         description: Include private settings (admin only)
 *     responses:
 *       200:
 *         description: Grouped settings retrieved successfully
 */
router.get('/grouped', settingsController.getGroupedSettings);

/**
 * @swagger
 * /api/settings/category/{category}:
 *   get:
 *     summary: Get settings by category
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includePrivate
 *         schema:
 *           type: boolean
 *         description: Include private settings (admin only)
 *     responses:
 *       200:
 *         description: Settings retrieved successfully
 *       404:
 *         description: Category not found
 */
router.get('/category/:category', categoryParamValidation, validateRequest, settingsController.getSettingsByCategory);

/**
 * @swagger
 * /api/settings/{key}:
 *   get:
 *     summary: Get specific setting value
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Setting value retrieved successfully
 *       403:
 *         description: Access denied to private setting
 *       404:
 *         description: Setting not found
 */
router.get('/:key', keyParamValidation, validateRequest, settingsController.getSettingValue);

// Admin-only routes
router.use(authorize(['admin', 'super_admin']));

/**
 * @swagger
 * /api/settings:
 *   post:
 *     summary: Create new setting (admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - key
 *               - value
 *               - type
 *             properties:
 *               key:
 *                 type: string
 *                 pattern: ^[a-zA-Z0-9_]+$
 *               value:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                   - type: boolean
 *                   - type: object
 *               type:
 *                 type: string
 *                 enum: [string, number, boolean, json]
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Setting created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Admin access required
 *       409:
 *         description: Setting already exists
 */
router.post('/', createSettingValidation, validateRequest, settingsController.createSetting);

/**
 * @swagger
 * /api/settings/{key}:
 *   put:
 *     summary: Update setting (admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
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
 *               - value
 *             properties:
 *               value:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                   - type: boolean
 *                   - type: object
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Setting updated successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Setting not found
 */
router.put('/:key', updateSettingValidation, validateRequest, settingsController.updateSetting);

/**
 * @swagger
 * /api/settings/{key}:
 *   delete:
 *     summary: Delete setting (admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Setting deleted successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Setting not found
 */
router.delete('/:key', keyParamValidation, validateRequest, settingsController.deleteSetting);

/**
 * @swagger
 * /api/settings/bulk/update:
 *   post:
 *     summary: Bulk update settings (admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updates
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - key
 *                     - value
 *                   properties:
 *                     key:
 *                       type: string
 *                     value:
 *                       oneOf:
 *                         - type: string
 *                         - type: number
 *                         - type: boolean
 *                         - type: object
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Admin access required
 */
router.post('/bulk/update', bulkUpdateValidation, validateRequest, settingsController.bulkUpdateSettings);

/**
 * @swagger
 * /api/settings/reset/defaults:
 *   post:
 *     summary: Reset settings to defaults (admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Reset only specific category
 *     responses:
 *       200:
 *         description: Settings reset successfully
 *       403:
 *         description: Admin access required
 */
router.post('/reset/defaults', settingsController.resetToDefaults);

/**
 * @swagger
 * /api/settings/initialize/defaults:
 *   post:
 *     summary: Initialize default settings (admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Default settings initialized successfully
 *       403:
 *         description: Admin access required
 */
router.post('/initialize/defaults', settingsController.initializeDefaults);

export default router;