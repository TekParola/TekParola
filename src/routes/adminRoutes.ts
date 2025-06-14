import { Router } from 'express';
import { adminController } from '../controllers/adminController';
import { authenticate, authorize, requireRole } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { body, param, query } from 'express-validator';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireRole(['admin', 'super_admin']));

// Dashboard and Analytics
router.get(
  '/dashboard',
  adminController.getDashboardOverview
);

router.get(
  '/analytics',
  [
    query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365'),
  ],
  validateRequest,
  adminController.getAnalytics
);

router.get(
  '/system/health',
  adminController.getSystemHealth
);

router.get(
  '/system/stats',
  adminController.getSystemStats
);

// Audit and Security
router.get(
  '/audit-logs',
  [
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  ],
  validateRequest,
  adminController.getAuditLogs
);

router.get(
  '/security/events',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  ],
  validateRequest,
  adminController.getSecurityEvents
);

// Role Management
router.get(
  '/roles',
  adminController.getRolesAndPermissions
);

router.post(
  '/roles',
  authorize('roles.create'),
  [
    body('name')
      .notEmpty()
      .withMessage('Role name is required')
      .matches(/^[a-z][a-z0-9_]*$/)
      .withMessage('Role name must start with a letter and contain only lowercase letters, numbers, and underscores'),
    body('displayName')
      .notEmpty()
      .withMessage('Display name is required')
      .isLength({ min: 1, max: 100 })
      .withMessage('Display name must be between 1 and 100 characters'),
    body('description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),
    body('parentId')
      .optional()
      .isString()
      .withMessage('Parent ID must be a string'),
    body('permissions')
      .optional()
      .isArray()
      .withMessage('Permissions must be an array'),
  ],
  validateRequest,
  adminController.createRole
);

router.put(
  '/roles/:id',
  authorize('roles.update'),
  [
    param('id').notEmpty().withMessage('Role ID is required'),
    body('displayName')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Display name must be between 1 and 100 characters'),
    body('description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('Active status must be a boolean'),
  ],
  validateRequest,
  adminController.updateRole
);

router.delete(
  '/roles/:id',
  authorize('roles.delete'),
  [param('id').notEmpty().withMessage('Role ID is required')],
  validateRequest,
  adminController.deleteRole
);

router.get(
  '/roles/hierarchy',
  authorize('roles.read'),
  adminController.getRoleHierarchy
);

router.get(
  '/roles/:id/permissions',
  authorize('roles.read'),
  [
    param('id').notEmpty().withMessage('Role ID is required'),
    query('includeInherited').optional().isBoolean().withMessage('Include inherited must be a boolean'),
  ],
  validateRequest,
  adminController.getRolePermissions
);

router.post(
  '/roles/:id/permissions',
  authorize('roles.update'),
  [
    param('id').notEmpty().withMessage('Role ID is required'),
    body('permissionId').notEmpty().withMessage('Permission ID is required'),
  ],
  validateRequest,
  adminController.assignPermissionToRole
);

router.delete(
  '/roles/:id/permissions/:permissionId',
  authorize('roles.update'),
  [
    param('id').notEmpty().withMessage('Role ID is required'),
    param('permissionId').notEmpty().withMessage('Permission ID is required'),
  ],
  validateRequest,
  adminController.revokePermissionFromRole
);

// Permission Management
router.post(
  '/permissions',
  authorize('permissions.create'),
  [
    body('name')
      .notEmpty()
      .withMessage('Permission name is required')
      .matches(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/)
      .withMessage('Permission name must follow the format: resource.action or resource.action.scope'),
    body('displayName')
      .notEmpty()
      .withMessage('Display name is required')
      .isLength({ min: 1, max: 100 })
      .withMessage('Display name must be between 1 and 100 characters'),
    body('description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),
    body('resource')
      .notEmpty()
      .withMessage('Resource is required')
      .matches(/^[a-z][a-z0-9_]*$/)
      .withMessage('Resource must start with a letter and contain only lowercase letters, numbers, and underscores'),
    body('action')
      .notEmpty()
      .withMessage('Action is required')
      .isIn(['create', 'read', 'update', 'delete', 'manage'])
      .withMessage('Action must be one of: create, read, update, delete, manage'),
    body('scope')
      .optional()
      .isIn(['own', 'department', 'all'])
      .withMessage('Scope must be one of: own, department, all'),
  ],
  validateRequest,
  adminController.createPermission
);

router.put(
  '/permissions/:id',
  authorize('permissions.update'),
  [
    param('id').notEmpty().withMessage('Permission ID is required'),
    body('displayName')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Display name must be between 1 and 100 characters'),
    body('description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),
  ],
  validateRequest,
  adminController.updatePermission
);

router.delete(
  '/permissions/:id',
  authorize('permissions.delete'),
  [param('id').notEmpty().withMessage('Permission ID is required')],
  validateRequest,
  adminController.deletePermission
);

// Data Export
router.get(
  '/export/users',
  authorize('users.read'),
  [
    query('format').optional().isIn(['json', 'csv']).withMessage('Format must be json or csv'),
  ],
  validateRequest,
  adminController.exportUsers
);

// Analytics
router.get(
  '/analytics/logins',
  authorize('audit.read'),
  [
    query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365'),
  ],
  validateRequest,
  adminController.getLoginAnalytics
);

export default router;