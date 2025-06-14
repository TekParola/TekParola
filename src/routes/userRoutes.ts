import { Router } from 'express';
import { userController } from '../controllers/userController';
import { authenticate, authorize } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import {
  validateUserId,
  validateCreateUser,
  validateUpdateUser,
  validateUserSearch,
  validateRoleAssignment,
  validateBulkOperation,
  validateAdminPasswordReset,
} from '../validators/userValidators';

const router = Router();

// All user management routes require authentication
router.use(authenticate);

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: Get all users
 *     description: Retrieve a paginated list of users with optional filtering and search
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - $ref: '#/components/parameters/OrderParam'
 *       - name: isActive
 *         in: query
 *         description: Filter by active status
 *         schema:
 *           type: boolean
 *       - name: isEmailVerified
 *         in: query
 *         description: Filter by email verification status
 *         schema:
 *           type: boolean
 *       - name: role
 *         in: query
 *         description: Filter by role name
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/',
  authorize('users.read'),
  validateUserSearch,
  validateRequest,
  userController.getAllUsers
);

/**
 * @openapi
 * /users/stats:
 *   get:
 *     tags: [Users]
 *     summary: Get user statistics
 *     description: Retrieve statistical information about users
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: Total number of users
 *                     active:
 *                       type: integer
 *                       description: Number of active users
 *                     verified:
 *                       type: integer
 *                       description: Number of email-verified users
 *                     twoFactorEnabled:
 *                       type: integer
 *                       description: Number of users with 2FA enabled
 *                     lastWeek:
 *                       type: integer
 *                       description: New users in last week
 *                     lastMonth:
 *                       type: integer
 *                       description: New users in last month
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/stats',
  authorize('users.read'),
  userController.getUserStats
);

// Bulk operations (admin only)
router.post(
  '/bulk',
  authorize('users.update'),
  validateBulkOperation,
  validateRequest,
  userController.bulkOperation
);

// Create new user (admin only)
router.post(
  '/',
  authorize('users.create'),
  validateCreateUser,
  validateRequest,
  userController.createUser
);

// Get user by ID (admin only)
router.get(
  '/:id',
  authorize('users.read'),
  validateUserId,
  validateRequest,
  userController.getUserById
);

// Update user (admin only)
router.put(
  '/:id',
  authorize('users.update'),
  validateUserId,
  validateUpdateUser,
  validateRequest,
  userController.updateUser
);

// Delete user (admin only)
router.delete(
  '/:id',
  authorize('users.delete'),
  validateUserId,
  validateRequest,
  userController.deleteUser
);

// Activate user (admin only)
router.post(
  '/:id/activate',
  authorize('users.update'),
  validateUserId,
  validateRequest,
  userController.activateUser
);

// Deactivate user (admin only)
router.post(
  '/:id/deactivate',
  authorize('users.update'),
  validateUserId,
  validateRequest,
  userController.deactivateUser
);

// Reset user password (admin only)
router.post(
  '/:id/reset-password',
  authorize('users.update'),
  validateUserId,
  validateAdminPasswordReset,
  validateRequest,
  userController.resetUserPassword
);

// Assign role to user (admin only)
router.post(
  '/:id/roles',
  authorize('users.update'),
  validateUserId,
  validateRoleAssignment,
  validateRequest,
  userController.assignRole
);

// Revoke role from user (admin only)
router.delete(
  '/:id/roles/:roleId',
  authorize('users.update'),
  validateUserId,
  validateRequest,
  userController.revokeRole
);

// Get user sessions (admin only)
router.get(
  '/:id/sessions',
  authorize(['users.read', 'sessions.read']),
  validateUserId,
  validateRequest,
  userController.getUserSessions
);

// Revoke user session (admin only)
router.delete(
  '/:id/sessions/:sessionId',
  authorize(['users.update', 'sessions.delete']),
  validateUserId,
  validateRequest,
  userController.revokeUserSession
);

// Revoke all user sessions (admin only)
router.delete(
  '/:id/sessions',
  authorize(['users.update', 'sessions.delete']),
  validateUserId,
  validateRequest,
  userController.revokeAllUserSessions
);

export default router;