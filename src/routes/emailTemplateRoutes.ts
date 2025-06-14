import { Router } from 'express';
import { emailTemplateController } from '../controllers/emailTemplateController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { validateRequest } from '../middleware/validation';
import { body, param } from 'express-validator';

const router = Router();

// Validation schemas
const createTemplateValidation = [
  body('name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Name must contain only letters, numbers, hyphens, and underscores'),
  body('subject')
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Subject is required and must be max 200 characters'),
  body('htmlContent')
    .isString()
    .isLength({ min: 1 })
    .withMessage('HTML content is required'),
  body('textContent')
    .optional()
    .isString()
    .withMessage('Text content must be a string'),
  body('category')
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Category is required and must be max 50 characters'),
  body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be max 500 characters'),
  body('variables')
    .optional()
    .isArray()
    .withMessage('Variables must be an array'),
  body('variables.*')
    .optional()
    .isString()
    .withMessage('Each variable must be a string'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];

const updateTemplateValidation = [
  param('name')
    .isString()
    .trim()
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Template name must contain only letters, numbers, hyphens, and underscores'),
  body('subject')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Subject must be max 200 characters'),
  body('htmlContent')
    .optional()
    .isString()
    .isLength({ min: 1 })
    .withMessage('HTML content cannot be empty'),
  body('textContent')
    .optional()
    .isString()
    .withMessage('Text content must be a string'),
  body('category')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Category must be max 50 characters'),
  body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be max 500 characters'),
  body('variables')
    .optional()
    .isArray()
    .withMessage('Variables must be an array'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];

const nameParamValidation = [
  param('name')
    .isString()
    .trim()
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Template name must contain only letters, numbers, hyphens, and underscores'),
];

const categoryParamValidation = [
  param('category')
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Category must be a valid string'),
];

const duplicateValidation = [
  ...nameParamValidation,
  body('newName')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('New name must contain only letters, numbers, hyphens, and underscores'),
];

const bulkUpdateValidation = [
  body('templateNames')
    .isArray({ min: 1 })
    .withMessage('Template names must be a non-empty array'),
  body('templateNames.*')
    .isString()
    .trim()
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Each template name must be valid'),
  body('isActive')
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];

// Public routes (no authentication required)
/**
 * @swagger
 * /api/email-templates/categories:
 *   get:
 *     summary: Get all template categories
 *     tags: [Email Templates]
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
router.get('/categories', emailTemplateController.getCategories);

// Protected routes (authentication required)
router.use(authenticate);

/**
 * @swagger
 * /api/email-templates:
 *   get:
 *     summary: Get all email templates
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *         description: Include inactive templates (admin only)
 *     responses:
 *       200:
 *         description: Email templates retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', emailTemplateController.getAllTemplates);

/**
 * @swagger
 * /api/email-templates/category/{category}:
 *   get:
 *     summary: Get templates by category
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *         description: Include inactive templates (admin only)
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 *       404:
 *         description: Category not found
 */
router.get('/category/:category', categoryParamValidation, validateRequest, emailTemplateController.getTemplatesByCategory);

/**
 * @swagger
 * /api/email-templates/{name}:
 *   get:
 *     summary: Get specific email template
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeContent
 *         schema:
 *           type: boolean
 *         description: Include template content
 *     responses:
 *       200:
 *         description: Template retrieved successfully
 *       404:
 *         description: Template not found
 */
router.get('/:name', nameParamValidation, validateRequest, emailTemplateController.getTemplate);

/**
 * @swagger
 * /api/email-templates/{name}/variables:
 *   get:
 *     summary: Get template variables
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Variables retrieved successfully
 *       404:
 *         description: Template not found
 */
router.get('/:name/variables', nameParamValidation, validateRequest, emailTemplateController.getTemplateVariables);

/**
 * @swagger
 * /api/email-templates/{name}/preview:
 *   post:
 *     summary: Preview template with data
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: object
 *                 description: Template variables data
 *     responses:
 *       200:
 *         description: Preview generated successfully
 *       404:
 *         description: Template not found
 */
router.post('/:name/preview', nameParamValidation, validateRequest, emailTemplateController.previewTemplate);

/**
 * @swagger
 * /api/email-templates/{name}/render:
 *   post:
 *     summary: Render template with data
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
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
 *               - data
 *             properties:
 *               data:
 *                 type: object
 *                 description: Template variables data
 *     responses:
 *       200:
 *         description: Template rendered successfully
 *       400:
 *         description: Invalid template or data
 *       404:
 *         description: Template not found
 */
router.post('/:name/render', nameParamValidation, validateRequest, emailTemplateController.renderTemplate);

// Admin-only routes
router.use(authorize(['admin', 'super_admin']));

/**
 * @swagger
 * /api/email-templates:
 *   post:
 *     summary: Create new email template (admin only)
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - subject
 *               - htmlContent
 *               - category
 *             properties:
 *               name:
 *                 type: string
 *                 pattern: ^[a-zA-Z0-9_-]+$
 *               subject:
 *                 type: string
 *                 maxLength: 200
 *               htmlContent:
 *                 type: string
 *               textContent:
 *                 type: string
 *               category:
 *                 type: string
 *                 maxLength: 50
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               variables:
 *                 type: array
 *                 items:
 *                   type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Template created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Admin access required
 *       409:
 *         description: Template already exists
 */
router.post('/', createTemplateValidation, validateRequest, emailTemplateController.createTemplate);

/**
 * @swagger
 * /api/email-templates/{name}:
 *   put:
 *     summary: Update email template (admin only)
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               subject:
 *                 type: string
 *                 maxLength: 200
 *               htmlContent:
 *                 type: string
 *               textContent:
 *                 type: string
 *               category:
 *                 type: string
 *                 maxLength: 50
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               variables:
 *                 type: array
 *                 items:
 *                   type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Template updated successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Template not found
 */
router.put('/:name', updateTemplateValidation, validateRequest, emailTemplateController.updateTemplate);

/**
 * @swagger
 * /api/email-templates/{name}:
 *   delete:
 *     summary: Delete email template (admin only)
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Template deleted successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Template not found
 */
router.delete('/:name', nameParamValidation, validateRequest, emailTemplateController.deleteTemplate);

/**
 * @swagger
 * /api/email-templates/{name}/duplicate:
 *   post:
 *     summary: Duplicate email template (admin only)
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
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
 *               - newName
 *             properties:
 *               newName:
 *                 type: string
 *                 pattern: ^[a-zA-Z0-9_-]+$
 *     responses:
 *       201:
 *         description: Template duplicated successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Template not found
 *       409:
 *         description: New template name already exists
 */
router.post('/:name/duplicate', duplicateValidation, validateRequest, emailTemplateController.duplicateTemplate);

/**
 * @swagger
 * /api/email-templates/{name}/test:
 *   post:
 *     summary: Test template rendering (admin only)
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               testData:
 *                 type: object
 *                 description: Custom test data for template variables
 *     responses:
 *       200:
 *         description: Template test completed successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Template not found
 */
router.post('/:name/test', nameParamValidation, validateRequest, emailTemplateController.testTemplate);

/**
 * @swagger
 * /api/email-templates/bulk/status:
 *   post:
 *     summary: Bulk update template status (admin only)
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - templateNames
 *               - isActive
 *             properties:
 *               templateNames:
 *                 type: array
 *                 items:
 *                   type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Templates updated successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Admin access required
 */
router.post('/bulk/status', bulkUpdateValidation, validateRequest, emailTemplateController.bulkUpdateStatus);

/**
 * @swagger
 * /api/email-templates/initialize/defaults:
 *   post:
 *     summary: Initialize default email templates (admin only)
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Default templates initialized successfully
 *       403:
 *         description: Admin access required
 */
router.post('/initialize/defaults', emailTemplateController.initializeDefaults);

export default router;