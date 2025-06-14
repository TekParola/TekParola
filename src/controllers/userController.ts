import { Request, Response } from 'express';
import { userService } from '../services/userService';
import { roleService } from '../services/roleService';
import { emailService } from '../services/emailService';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { Prisma } from '@prisma/client';

export class UserController {
  // Get all users with pagination and filtering
  getAllUsers = asyncHandler(async (req: Request, res: Response) => {
    const {
      q,
      status = 'all',
      role,
      emailVerified,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    // Build where conditions
    const whereConditions: Prisma.UserWhereInput = {};

    // Search query
    if (q) {
      whereConditions.OR = [
        { email: { contains: q as string, mode: 'insensitive' } },
        { username: { contains: q as string, mode: 'insensitive' } },
        { firstName: { contains: q as string, mode: 'insensitive' } },
        { lastName: { contains: q as string, mode: 'insensitive' } },
      ];
    }

    // Status filter
    if (status !== 'all') {
      whereConditions.isActive = status === 'active';
    }

    // Email verified filter
    if (emailVerified !== undefined) {
      whereConditions.isEmailVerified = emailVerified === 'true';
    }

    // Role filter
    if (role) {
      whereConditions.roles = {
        some: {
          role: {
            name: role as string,
          },
        },
      };
    }

    // Get users and total count
    const [users, total] = await Promise.all([
      userService.findManyWithFilters(whereConditions, {
        skip: offset,
        take: limitNum,
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc',
        },
      }),
      userService.countWithFilters(whereConditions),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully',
      data: {
        users: users.map(user => ({
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          isActive: user.isActive,
          isEmailVerified: user.isEmailVerified,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          roles: user.roles?.map(ur => ({
            id: (ur as any).role.id,
            name: (ur as any).role.name,
            displayName: (ur as any).role.displayName,
            assignedAt: (ur as any).assignedAt,
            expiresAt: (ur as any).expiresAt,
          })) || [],
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      },
    });
  });

  // Get user by ID
  getUserById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
      return;
    }

    const user = await userService.findWithRoles(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.status(200).json({
      success: true,
      message: 'User retrieved successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          avatar: user.avatar,
          timezone: user.timezone,
          language: user.language,
          dateFormat: user.dateFormat,
          timeFormat: user.timeFormat,
          isActive: user.isActive,
          isEmailVerified: user.isEmailVerified,
          emailVerifiedAt: user.emailVerifiedAt,
          twoFactorEnabled: user.twoFactorEnabled,
          lastLoginAt: user.lastLoginAt,
          lastLoginIp: user.lastLoginIp,
          failedLoginAttempts: user.failedLoginAttempts,
          lockedUntil: user.lockedUntil,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          roles: (user as any).roles.map((ur: any) => ({
            id: ur.role.id,
            name: ur.role.name,
            displayName: ur.role.displayName,
            description: ur.role.description,
            assignedAt: ur.assignedAt,
            assignedBy: ur.assignedBy,
            expiresAt: ur.expiresAt,
            permissions: ur.role.permissions.map((rp: any) => ({
              id: rp.permission.id,
              name: rp.permission.name,
              displayName: rp.permission.displayName,
              resource: rp.permission.resource,
              action: rp.permission.action,
              scope: rp.permission.scope,
            })),
          })),
        },
      },
    });
  });

  // Create new user (admin)
  createUser = asyncHandler(async (req: Request, res: Response) => {
    const {
      email,
      username,
      firstName,
      lastName,
      password,
      phoneNumber,
      isEmailVerified = false,
      roles = [],
    } = req.body;

    const adminUserId = req.user!.id;

    // Generate random password if not provided
    const userPassword = password || this.generateRandomPassword();

    // Create user
    const user = await userService.createUser({
      email,
      username,
      firstName,
      lastName,
      password: userPassword,
      phoneNumber,
      isEmailVerified,
      createdBy: adminUserId,
    });

    // Assign roles if provided
    for (const roleName of roles) {
      const role = await roleService.findByName(roleName);
      if (role) {
        await roleService.assignRoleToUser(user.id, role.id, adminUserId);
      }
    }

    // Send welcome email with temporary password if generated
    if (!password) {
      try {
        await emailService.sendEmail({
          to: user.email,
          subject: 'Account Created - Temporary Password',
          htmlContent: `
            <h1>Your Account Has Been Created</h1>
            <p>Hello ${user.firstName},</p>
            <p>An administrator has created an account for you with the following details:</p>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Temporary Password:</strong> ${userPassword}</p>
            <p>Please log in and change your password immediately.</p>
            <p>Best regards,<br>TekParola Team</p>
          `,
        });
      } catch (emailError) {
        logger.warn('Failed to send welcome email:', emailError);
      }
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          isEmailVerified: user.isEmailVerified,
          isActive: user.isActive,
          createdAt: user.createdAt,
        },
        temporaryPassword: !password ? userPassword : undefined,
      },
    });
  });

  // Update user (admin)
  updateUser = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;
    const adminUserId = req.user!.id;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
      return;
    }

    const updatedUser = await userService.updateUser(id, {
      ...updateData,
      updatedBy: adminUserId,
    });

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          username: updatedUser.username,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          phoneNumber: updatedUser.phoneNumber,
          isActive: updatedUser.isActive,
          isEmailVerified: updatedUser.isEmailVerified,
          updatedAt: updatedUser.updatedAt,
        },
      },
    });
  });

  // Delete user (admin)
  deleteUser = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminUserId = req.user!.id;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
      return;
    }

    // Prevent deleting own account
    if (id === adminUserId) {
      throw new ValidationError('Cannot delete your own account');
    }

    // Check if user exists
    const user = await userService.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check if user is a system admin (prevent deletion)
    const userRoles = await roleService.getUserRoles(id);
    const hasSystemRole = userRoles.some(role => role.isSystem && role.name === 'super_admin');
    
    if (hasSystemRole) {
      throw new ValidationError('Cannot delete system administrator accounts');
    }

    await userService.deleteUser(id);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  });

  // Activate user
  activateUser = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminUserId = req.user!.id;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
      return;
    }

    const user = await userService.activateUser(id, adminUserId);

    res.status(200).json({
      success: true,
      message: 'User activated successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          isActive: user.isActive,
          updatedAt: user.updatedAt,
        },
      },
    });
  });

  // Deactivate user
  deactivateUser = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminUserId = req.user!.id;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
      return;
    }

    // Prevent deactivating own account
    if (id === adminUserId) {
      throw new ValidationError('Cannot deactivate your own account');
    }

    const user = await userService.deactivateUser(id, adminUserId);

    res.status(200).json({
      success: true,
      message: 'User deactivated successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          isActive: user.isActive,
          updatedAt: user.updatedAt,
        },
      },
    });
  });

  // Reset user password (admin)
  resetUserPassword = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { newPassword, sendEmail = true } = req.body;
    const adminUserId = req.user!.id;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
      return;
    }

    const user = await userService.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Generate random password if not provided
    const password = newPassword || this.generateRandomPassword();

    await userService.updatePassword(id, password, adminUserId);

    // Send password reset email
    if (sendEmail) {
      try {
        await emailService.sendEmail({
          to: user.email,
          subject: 'Password Reset by Administrator',
          htmlContent: `
            <h1>Your Password Has Been Reset</h1>
            <p>Hello ${user.firstName},</p>
            <p>An administrator has reset your password. Your new temporary password is:</p>
            <p><strong>${password}</strong></p>
            <p>Please log in and change your password immediately.</p>
            <p>Best regards,<br>TekParola Team</p>
          `,
        });
      } catch (emailError) {
        logger.warn('Failed to send password reset email:', emailError);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
      data: {
        temporaryPassword: !newPassword ? password : undefined,
        emailSent: sendEmail,
      },
    });
  });

  // Assign role to user
  assignRole = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { roleId, expiresAt } = req.body;
    const adminUserId = req.user!.id;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
      return;
    }

    const expirationDate = expiresAt ? new Date(expiresAt) : undefined;

    await roleService.assignRoleToUser(id, roleId, adminUserId, expirationDate);

    res.status(200).json({
      success: true,
      message: 'Role assigned successfully',
    });
  });

  // Revoke role from user
  revokeRole = asyncHandler(async (req: Request, res: Response) => {
    const { id, roleId } = req.params;

    if (!id || !roleId) {
      res.status(400).json({
        success: false,
        message: 'User ID and Role ID are required',
      });
      return;
    }

    await roleService.revokeRoleFromUser(id, roleId);

    res.status(200).json({
      success: true,
      message: 'Role revoked successfully',
    });
  });

  // Bulk operations
  bulkOperation = asyncHandler(async (req: Request, res: Response) => {
    const { userIds, action } = req.body;
    const adminUserId = req.user!.id;

    const results = {
      success: [] as string[],
      failed: [] as Array<{ userId: string; error: string }>,
    };

    for (const userId of userIds) {
      try {
        // Prevent operations on own account for certain actions
        if ((action === 'deactivate' || action === 'delete') && userId === adminUserId) {
          results.failed.push({
            userId,
            error: 'Cannot perform this action on your own account',
          });
          continue;
        }

        switch (action) {
          case 'activate':
            await userService.activateUser(userId, adminUserId);
            break;
          case 'deactivate':
            await userService.deactivateUser(userId, adminUserId);
            break;
          case 'delete':
            await userService.deleteUser(userId);
            break;
          case 'verify-email':
            await userService.verifyEmail(userId);
            break;
        }

        results.success.push(userId);
      } catch (error) {
        results.failed.push({
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk ${action} operation completed`,
      data: {
        processed: userIds.length,
        successful: results.success.length,
        failed: results.failed.length,
        results,
      },
    });
  });

  // Get user statistics
  getUserStats = asyncHandler(async (req: Request, res: Response) => {
    const stats = await userService.getUserStats();

    res.status(200).json({
      success: true,
      message: 'User statistics retrieved successfully',
      data: { stats },
    });
  });

  // Get user sessions
  getUserSessions = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
      return;
    }

    const sessions = await userService.getUserSessions(id);

    res.status(200).json({
      success: true,
      message: 'User sessions retrieved successfully',
      data: { sessions },
    });
  });

  // Revoke user session
  revokeUserSession = asyncHandler(async (req: Request, res: Response) => {
    const { id, sessionId } = req.params;

    if (!id || !sessionId) {
      res.status(400).json({
        success: false,
        message: 'User ID and Session ID are required',
      });
      return;
    }

    await userService.revokeUserSession(id, sessionId);

    res.status(200).json({
      success: true,
      message: 'User session revoked successfully',
    });
  });

  // Revoke all user sessions
  revokeAllUserSessions = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
      return;
    }

    await userService.revokeAllUserSessions(id);

    res.status(200).json({
      success: true,
      message: 'All user sessions revoked successfully',
    });
  });

  private generateRandomPassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@$!%*?&';
    let password = '';
    
    // Ensure at least one character from each required set
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.charAt(Math.floor(Math.random() * 26));
    password += 'abcdefghijklmnopqrstuvwxyz'.charAt(Math.floor(Math.random() * 26));
    password += '0123456789'.charAt(Math.floor(Math.random() * 10));
    password += '@$!%*?&'.charAt(Math.floor(Math.random() * 7));
    
    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
}

export const userController = new UserController();