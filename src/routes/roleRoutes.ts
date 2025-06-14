import { Router } from 'express';
import { roleController } from '../controllers/roleController';
import { permissionController } from '../controllers/permissionController';
import { authenticate, authorize } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { body, param, query } from 'express-validator';

const router = Router();

// All role routes require authentication
router.use(authenticate);

// Validation schemas
const createRoleValidation = [
  body('name')
    .isString()
    .trim()
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-z_]+$/)
    .withMessage('Name must contain only lowercase letters and underscores'),
  body('displayName')
    .isString()
    .trim()
    .isLength({ min: 3, max: 100 }),
  body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 }),
  body('parentId')
    .optional()
    .isString(),
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Permissions must be an array of permission IDs'),
];

const updateRoleValidation = [
  body('displayName')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 3, max: 100 }),
  body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 }),
  body('parentId')
    .optional()
    .isString(),
  body('isActive')
    .optional()
    .isBoolean(),
];

// Role endpoints

/**
 * @swagger
 * /api/v1/roles:
 *   get:
 *     summary: Get all roles
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isSystem
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: includePermissions
 *         schema:
 *           type: boolean
 *           default: true
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
 *         description: Roles retrieved successfully
 */
router.get('/',
  authorize(['admin', 'super_admin', 'user_manager']),
  [
    query('search').optional().isString(),
    query('isActive').optional().isBoolean(),
    query('isSystem').optional().isBoolean(),
    query('includePermissions').optional().isBoolean(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  validateRequest,
  roleController.getRoles
);

/**
 * @swagger
 * /api/v1/roles/hierarchy:
 *   get:
 *     summary: Get role hierarchy
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Role hierarchy retrieved successfully
 */
router.get('/hierarchy',
  authorize(['admin', 'super_admin', 'user_manager']),
  roleController.getRoleHierarchy
);

/**
 * @swagger
 * /api/v1/roles/{id}:
 *   get:
 *     summary: Get role by ID
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includePermissions
 *         schema:
 *           type: boolean
 *           default: true
 *     responses:
 *       200:
 *         description: Role retrieved successfully
 *       404:
 *         description: Role not found
 */
router.get('/:id',
  authorize(['admin', 'super_admin', 'user_manager']),
  param('id').isString(),
  query('includePermissions').optional().isBoolean(),
  validateRequest,
  roleController.getRoleById
);

/**
 * @swagger
 * /api/v1/roles:
 *   post:
 *     summary: Create a new role
 *     tags: [Roles]
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
 *               - displayName
 *             properties:
 *               name:
 *                 type: string
 *                 pattern: ^[a-z_]+$
 *               displayName:
 *                 type: string
 *               description:
 *                 type: string
 *               parentId:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Role created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Role already exists
 */
router.post('/',
  authorize(['super_admin']),
  createRoleValidation,
  validateRequest,
  roleController.createRole
);

/**
 * @swagger
 * /api/v1/roles/{id}:
 *   put:
 *     summary: Update a role
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *               description:
 *                 type: string
 *               parentId:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       404:
 *         description: Role not found
 */
router.put('/:id',
  authorize(['super_admin']),
  param('id').isString(),
  updateRoleValidation,
  validateRequest,
  roleController.updateRole
);

/**
 * @swagger
 * /api/v1/roles/{id}:
 *   delete:
 *     summary: Delete a role
 *     tags: [Roles]
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
 *         description: Role deleted successfully
 *       404:
 *         description: Role not found
 *       409:
 *         description: Cannot delete system role
 */
router.delete('/:id',
  authorize(['super_admin']),
  param('id').isString(),
  validateRequest,
  roleController.deleteRole
);

/**
 * @swagger
 * /api/v1/roles/{id}/permissions:
 *   get:
 *     summary: Get role permissions
 *     tags: [Roles]
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
 *         description: Role permissions retrieved successfully
 */
router.get('/:id/permissions',
  authorize(['admin', 'super_admin', 'user_manager']),
  param('id').isString(),
  validateRequest,
  roleController.getRolePermissions
);

/**
 * @swagger
 * /api/v1/roles/{id}/permissions:
 *   post:
 *     summary: Assign permissions to role
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - permissions
 *             properties:
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Permissions assigned successfully
 */
router.post('/:id/permissions',
  authorize(['super_admin']),
  param('id').isString(),
  body('permissions').isArray(),
  validateRequest,
  roleController.assignPermissions
);

/**
 * @swagger
 * /api/v1/roles/{id}/permissions:
 *   put:
 *     summary: Sync role permissions (replace all)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - permissions
 *             properties:
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Permissions synchronized successfully
 */
router.put('/:id/permissions',
  authorize(['super_admin']),
  param('id').isString(),
  body('permissions').isArray(),
  validateRequest,
  roleController.syncPermissions
);

/**
 * @swagger
 * /api/v1/roles/{id}/permissions:
 *   delete:
 *     summary: Remove permissions from role
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - permissions
 *             properties:
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Permissions removed successfully
 */
router.delete('/:id/permissions',
  authorize(['super_admin']),
  param('id').isString(),
  body('permissions').isArray(),
  validateRequest,
  roleController.removePermissions
);

/**
 * @swagger
 * /api/v1/roles/{id}/users:
 *   get:
 *     summary: Get users with this role
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *     responses:
 *       200:
 *         description: Role users retrieved successfully
 */
router.get('/:id/users',
  authorize(['admin', 'super_admin', 'user_manager']),
  param('id').isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  validateRequest,
  roleController.getRoleUsers
);

/**
 * @swagger
 * /api/v1/roles/{id}/clone:
 *   post:
 *     summary: Clone a role
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - name
 *               - displayName
 *             properties:
 *               name:
 *                 type: string
 *                 pattern: ^[a-z_]+$
 *               displayName:
 *                 type: string
 *     responses:
 *       201:
 *         description: Role cloned successfully
 */
router.post('/:id/clone',
  authorize(['super_admin']),
  param('id').isString(),
  body('name').isString().matches(/^[a-z_]+$/),
  body('displayName').isString(),
  validateRequest,
  roleController.cloneRole
);

// Permission endpoints

/**
 * @swagger
 * /api/v1/permissions:
 *   get:
 *     summary: Get all permissions
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: scope
 *         schema:
 *           type: string
 *       - in: query
 *         name: isSystem
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [resource]
 *     responses:
 *       200:
 *         description: Permissions retrieved successfully
 */
router.get('/permissions',
  authorize(['admin', 'super_admin', 'user_manager']),
  [
    query('resource').optional().isString(),
    query('action').optional().isString(),
    query('scope').optional().isString(),
    query('isSystem').optional().isBoolean(),
    query('search').optional().isString(),
    query('groupBy').optional().isIn(['resource']),
  ],
  validateRequest,
  permissionController.getPermissions
);

/**
 * @swagger
 * /api/v1/permissions/resources:
 *   get:
 *     summary: Get unique resources
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resources retrieved successfully
 */
router.get('/permissions/resources',
  authorize(['admin', 'super_admin', 'user_manager']),
  permissionController.getResources
);

/**
 * @swagger
 * /api/v1/permissions/actions:
 *   get:
 *     summary: Get unique actions
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Actions retrieved successfully
 */
router.get('/permissions/actions',
  authorize(['admin', 'super_admin', 'user_manager']),
  query('resource').optional().isString(),
  validateRequest,
  permissionController.getActions
);

/**
 * @swagger
 * /api/v1/permissions/scopes:
 *   get:
 *     summary: Get unique scopes
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Scopes retrieved successfully
 */
router.get('/permissions/scopes',
  authorize(['admin', 'super_admin', 'user_manager']),
  permissionController.getScopes
);

/**
 * @swagger
 * /api/v1/permissions/check:
 *   post:
 *     summary: Check if user has permission
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *               permission:
 *                 type: string
 *               resource:
 *                 type: string
 *               action:
 *                 type: string
 *               scope:
 *                 type: string
 *     responses:
 *       200:
 *         description: Permission check completed
 */
router.post('/permissions/check',
  authorize(['admin', 'super_admin', 'user_manager']),
  [
    body('userId').isString(),
    body('permission').optional().isString(),
    body('resource').optional().isString(),
    body('action').optional().isString(),
    body('scope').optional().isString(),
  ],
  validateRequest,
  permissionController.checkPermission
);

/**
 * @swagger
 * /api/v1/permissions/{id}:
 *   get:
 *     summary: Get permission by ID
 *     tags: [Permissions]
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
 *         description: Permission retrieved successfully
 *       404:
 *         description: Permission not found
 */
router.get('/permissions/:id',
  authorize(['admin', 'super_admin', 'user_manager']),
  param('id').isString(),
  validateRequest,
  permissionController.getPermissionById
);

/**
 * @swagger
 * /api/v1/permissions:
 *   post:
 *     summary: Create a new permission
 *     tags: [Permissions]
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
 *               - displayName
 *               - resource
 *               - action
 *             properties:
 *               name:
 *                 type: string
 *               displayName:
 *                 type: string
 *               description:
 *                 type: string
 *               resource:
 *                 type: string
 *               action:
 *                 type: string
 *               scope:
 *                 type: string
 *     responses:
 *       201:
 *         description: Permission created successfully
 */
router.post('/permissions',
  authorize(['super_admin']),
  [
    body('name').isString().trim(),
    body('displayName').isString().trim(),
    body('description').optional().isString(),
    body('resource').isString().trim(),
    body('action').isString().trim(),
    body('scope').optional().isString().trim(),
  ],
  validateRequest,
  permissionController.createPermission
);

export default router;