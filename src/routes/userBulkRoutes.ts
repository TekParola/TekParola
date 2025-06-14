import { Router } from 'express';
import { userBulkController } from '../controllers/userBulkController';
import { authenticate, authorize } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { uploadCSV, processCSVUpload, handleUploadErrors } from '../middleware/fileUpload';
import {
  validateImportUsers,
  validateExportUsers,
  validateBulkDeleteUsers,
  validateCSV,
  validateImportPreview,
  validateBulkOperationHistory,
  validateBulkStats,
} from '../validators/userBulkValidators';

const router = Router();

// All bulk routes require authentication
router.use(authenticate);

/**
 * @swagger
 * components:
 *   schemas:
 *     BulkImportResult:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *           description: Total number of records processed
 *         successful:
 *           type: integer
 *           description: Number of successfully imported users
 *         failed:
 *           type: integer
 *           description: Number of failed imports
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               row:
 *                 type: integer
 *               email:
 *                 type: string
 *               username:
 *                 type: string
 *               error:
 *                 type: string
 *         importId:
 *           type: string
 *           description: Unique identifier for this import operation
 *         createdUsers:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               email:
 *                 type: string
 *               username:
 *                 type: string
 *     
 *     BulkDeleteResult:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *         successful:
 *           type: integer
 *         failed:
 *           type: integer
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *         deletedUsers:
 *           type: array
 *           items:
 *             type: object
 *     
 *     CSVValidation:
 *       type: object
 *       properties:
 *         valid:
 *           type: boolean
 *         errors:
 *           type: array
 *           items:
 *             type: string
 *         sampleData:
 *           type: array
 *           items:
 *             type: object
 */

/**
 * @swagger
 * /api/v1/users/bulk/import:
 *   post:
 *     summary: Import users from CSV content
 *     tags: [Users - Bulk Operations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - csvContent
 *             properties:
 *               csvContent:
 *                 type: string
 *                 description: CSV content with user data
 *               options:
 *                 type: object
 *                 properties:
 *                   skipDuplicates:
 *                     type: boolean
 *                     default: false
 *                     description: Skip users that already exist
 *                   generatePasswords:
 *                     type: boolean
 *                     default: false
 *                     description: Generate passwords for users without passwords
 *                   sendWelcomeEmails:
 *                     type: boolean
 *                     default: false
 *                     description: Send welcome emails to imported users
 *                   defaultRoles:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Default roles to assign to imported users
 *     responses:
 *       200:
 *         description: Import completed successfully
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
 *                   $ref: '#/components/schemas/BulkImportResult'
 *       400:
 *         description: Invalid CSV content or options
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/import',
  authorize('users.create'),
  validateImportUsers,
  validateRequest,
  userBulkController.importUsers
);

/**
 * @swagger
 * /api/v1/users/bulk/import-file:
 *   post:
 *     summary: Import users from CSV file upload
 *     tags: [Users - Bulk Operations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - csvFile
 *             properties:
 *               csvFile:
 *                 type: string
 *                 format: binary
 *                 description: CSV file with user data (max 5MB)
 *               skipDuplicates:
 *                 type: boolean
 *                 default: false
 *               generatePasswords:
 *                 type: boolean
 *                 default: false
 *               sendWelcomeEmails:
 *                 type: boolean
 *                 default: false
 *               defaultRoles:
 *                 type: string
 *                 description: Comma-separated list of default roles
 *     responses:
 *       200:
 *         description: Import completed successfully
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
 *                   $ref: '#/components/schemas/BulkImportResult'
 *       400:
 *         description: Invalid CSV file or options
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/import-file',
  authorize('users.create'),
  uploadCSV,
  handleUploadErrors,
  processCSVUpload,
  userBulkController.importUsersFromFile
);

/**
 * @swagger
 * /api/v1/users/bulk/export:
 *   post:
 *     summary: Export users to CSV or JSON format
 *     tags: [Users - Bulk Operations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [csv, json]
 *                 default: csv
 *                 description: Export format
 *               includeInactive:
 *                 type: boolean
 *                 default: false
 *                 description: Include inactive users in export
 *               includeRoles:
 *                 type: boolean
 *                 default: false
 *                 description: Include user roles in export
 *               filters:
 *                 type: object
 *                 properties:
 *                   createdAfter:
 *                     type: string
 *                     format: date-time
 *                   createdBefore:
 *                     type: string
 *                     format: date-time
 *                   lastLoginAfter:
 *                     type: string
 *                     format: date-time
 *                   lastLoginBefore:
 *                     type: string
 *                     format: date-time
 *                   emailVerified:
 *                     type: boolean
 *                   roles:
 *                     type: array
 *                     items:
 *                       type: string
 *               fields:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Specific fields to include in export
 *     responses:
 *       200:
 *         description: Export file generated successfully
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid export parameters
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/export',
  authorize('users.read'),
  validateExportUsers,
  validateRequest,
  userBulkController.exportUsers
);

/**
 * @swagger
 * /api/v1/users/bulk/delete:
 *   post:
 *     summary: Bulk delete users by IDs
 *     tags: [Users - Bulk Operations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userIds
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of user IDs to delete (max 100)
 *               options:
 *                 type: object
 *                 properties:
 *                   skipSystemUsers:
 *                     type: boolean
 *                     default: true
 *                     description: Skip deletion of system users
 *                   sendNotificationEmails:
 *                     type: boolean
 *                     default: false
 *                     description: Send notification emails to deleted users
 *     responses:
 *       200:
 *         description: Bulk delete completed successfully
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
 *                   $ref: '#/components/schemas/BulkDeleteResult'
 *       400:
 *         description: Invalid user IDs or options
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/delete',
  authorize('users.delete'),
  validateBulkDeleteUsers,
  validateRequest,
  userBulkController.bulkDeleteUsers
);

/**
 * @swagger
 * /api/v1/users/bulk/history:
 *   get:
 *     summary: Get bulk operation history
 *     tags: [Users - Bulk Operations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Number of operations to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Number of operations to skip
 *     responses:
 *       200:
 *         description: Bulk operation history retrieved successfully
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
 *                     operations:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/history',
  authorize('users.read'),
  validateBulkOperationHistory,
  validateRequest,
  userBulkController.getBulkOperationHistory
);

/**
 * @swagger
 * /api/v1/users/bulk/validate-csv:
 *   post:
 *     summary: Validate CSV template format
 *     tags: [Users - Bulk Operations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - csvContent
 *             properties:
 *               csvContent:
 *                 type: string
 *                 description: CSV content to validate
 *     responses:
 *       200:
 *         description: CSV validation completed
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
 *                   $ref: '#/components/schemas/CSVValidation'
 *       400:
 *         description: Invalid CSV content
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/validate-csv',
  authorize('users.read'),
  validateCSV,
  validateRequest,
  userBulkController.validateCSV
);

/**
 * @swagger
 * /api/v1/users/bulk/validate-csv-file:
 *   post:
 *     summary: Validate CSV file upload
 *     tags: [Users - Bulk Operations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - csvFile
 *             properties:
 *               csvFile:
 *                 type: string
 *                 format: binary
 *                 description: CSV file to validate (max 5MB)
 *     responses:
 *       200:
 *         description: CSV file validation completed
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
 *                   $ref: '#/components/schemas/CSVValidation'
 *       400:
 *         description: Invalid CSV file
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/validate-csv-file',
  authorize('users.read'),
  uploadCSV,
  handleUploadErrors,
  processCSVUpload,
  userBulkController.validateCSVFromFile
);

/**
 * @swagger
 * /api/v1/users/bulk/csv-template:
 *   get:
 *     summary: Download CSV template for user import
 *     tags: [Users - Bulk Operations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV template file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/csv-template',
  authorize('users.read'),
  userBulkController.getCSVTemplate
);

/**
 * @swagger
 * /api/v1/users/bulk/stats:
 *   get:
 *     summary: Get bulk operation statistics
 *     tags: [Users - Bulk Operations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for statistics
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for statistics
 *     responses:
 *       200:
 *         description: Bulk operation statistics retrieved successfully
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
 *                     totalOperations:
 *                       type: integer
 *                     recentImports:
 *                       type: integer
 *                     recentExports:
 *                       type: integer
 *                     recentDeletes:
 *                       type: integer
 *                     lastOperation:
 *                       type: object
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/stats',
  authorize('users.read'),
  validateBulkStats,
  validateRequest,
  userBulkController.getBulkStats
);

/**
 * @swagger
 * /api/v1/users/bulk/preview-import:
 *   post:
 *     summary: Preview import data before actual import
 *     tags: [Users - Bulk Operations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - csvContent
 *             properties:
 *               csvContent:
 *                 type: string
 *                 description: CSV content to preview
 *               previewCount:
 *                 type: integer
 *                 default: 5
 *                 minimum: 1
 *                 maximum: 20
 *                 description: Number of records to preview
 *     responses:
 *       200:
 *         description: Import preview generated successfully
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
 *                     valid:
 *                       type: boolean
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     preview:
 *                       type: array
 *                       items:
 *                         type: object
 *                     estimatedTotal:
 *                       type: integer
 *       400:
 *         description: Invalid CSV content
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/preview-import',
  authorize('users.read'),
  validateImportPreview,
  validateRequest,
  userBulkController.previewImport
);

/**
 * @swagger
 * /api/v1/users/bulk/export-options:
 *   get:
 *     summary: Get available export formats and field options
 *     tags: [Users - Bulk Operations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Export options retrieved successfully
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
 *                     formats:
 *                       type: array
 *                       items:
 *                         type: string
 *                     availableFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                     filterOptions:
 *                       type: object
 *                     maxExportSize:
 *                       type: integer
 *                     maxImportSize:
 *                       type: integer
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/export-options',
  authorize('users.read'),
  userBulkController.getExportOptions
);

export default router;