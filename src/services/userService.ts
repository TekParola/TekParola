import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { User, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';
import { cacheService } from './cacheService';

export interface CreateUserData {
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  password: string;
  phoneNumber?: string;
  isEmailVerified?: boolean;
  createdBy?: string;
}

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  avatar?: string;
  timezone?: string;
  language?: string;
  dateFormat?: string;
  timeFormat?: string;
  updatedBy?: string;
}

export interface UserWithRoles extends User {
  roles: Array<{
    roleId: string;
    role: {
      id: string;
      name: string;
      displayName: string;
      permissions: Array<{
        permission: {
          id: string;
          name: string;
          resource: string;
          action: string;
          scope: string | null;
        };
      }>;
    };
  }>;
}

export class UserService {
  async createUser(userData: CreateUserData): Promise<User> {
    try {
      // Check if user already exists
      const existingUser = await this.findByEmailOrUsername(userData.email, userData.username);
      if (existingUser) {
        throw new ConflictError('User with this email or username already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, config.security.bcryptRounds);

      // Get default role
      const defaultRole = await prisma.role.findUnique({
        where: { name: config.app.defaultRole },
      });

      if (!defaultRole) {
        throw new ValidationError('Default role not found');
      }

      // Create user with role assignment in transaction
      const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email: userData.email,
            username: userData.username,
            firstName: userData.firstName,
            lastName: userData.lastName,
            password: hashedPassword,
            phoneNumber: userData.phoneNumber,
            isEmailVerified: userData.isEmailVerified || false,
            createdBy: userData.createdBy,
          },
        });

        // Assign default role
        await tx.userRole.create({
          data: {
            userId: newUser.id,
            roleId: defaultRole.id,
            assignedBy: userData.createdBy,
          },
        });

        return newUser;
      });

      logger.info(`User created: ${user.id} (${user.email})`);
      return user;
    } catch (error) {
      logger.error('Failed to create user:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<User | null> {
    try {
      return await cacheService.getOrSet(
        cacheService.getCacheKeyConfig('USER_BY_ID')?.pattern.replace('{id}', id) || `user:id:${id}`,
        async () => {
          return await prisma.user.findUnique({
            where: { id },
          });
        },
        { ttl: cacheService.getCacheKeyConfig('USER_BY_ID')?.ttl || 1800 }
      );
    } catch (error) {
      logger.error('Failed to find user by ID:', error);
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      return await cacheService.getOrSet(
        cacheService.getCacheKeyConfig('USER_BY_EMAIL')?.pattern.replace('{email}', email) || `user:email:${email}`,
        async () => {
          return await prisma.user.findUnique({
            where: { email },
          });
        },
        { ttl: cacheService.getCacheKeyConfig('USER_BY_EMAIL')?.ttl || 1800 }
      );
    } catch (error) {
      logger.error('Failed to find user by email:', error);
      throw error;
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    try {
      return await prisma.user.findUnique({
        where: { username },
      });
    } catch (error) {
      logger.error('Failed to find user by username:', error);
      throw error;
    }
  }

  async findByEmailOrUsername(email: string, username?: string): Promise<User | null> {
    try {
      const whereConditions: Prisma.UserWhereInput[] = [{ email }];
      
      if (username) {
        whereConditions.push({ username });
      }

      return await prisma.user.findFirst({
        where: {
          OR: whereConditions,
        },
      });
    } catch (error) {
      logger.error('Failed to find user by email or username:', error);
      throw error;
    }
  }

  async findWithRoles(id: string): Promise<UserWithRoles | null> {
    try {
      return await prisma.user.findUnique({
        where: { id },
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    } catch (error) {
      logger.error('Failed to find user with roles:', error);
      throw error;
    }
  }

  async updateUser(id: string, updateData: UpdateUserData): Promise<User> {
    try {
      const user = await this.findById(id);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
      });

      // Invalidate user cache
      await cacheService.invalidateKey('USER_BY_ID', { id });
      await cacheService.invalidateKey('USER_BY_EMAIL', { email: user.email });

      logger.info(`User updated: ${updatedUser.id} (${updatedUser.email})`);
      return updatedUser;
    } catch (error) {
      logger.error('Failed to update user:', error);
      throw error;
    }
  }

  async updatePassword(id: string, newPassword: string, updatedBy?: string, triggerSecurityEvent = true): Promise<void> {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, config.security.bcryptRounds);

      await prisma.user.update({
        where: { id },
        data: {
          password: hashedPassword,
          updatedBy,
          updatedAt: new Date(),
        },
      });

      // Invalidate user cache
      await cacheService.invalidateKey('USER_BY_ID', { id });

      // Trigger security event for password change (if enabled)
      if (triggerSecurityEvent) {
        // Import dynamically to avoid circular dependency
        const { securityEventService } = await import('./securityEventService');
        await securityEventService.handlePasswordChange(id);
      }

      logger.info(`Password updated for user: ${id}`);
    } catch (error) {
      logger.error('Failed to update password:', error);
      throw error;
    }
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, user.password);
    } catch (error) {
      logger.error('Failed to verify password:', error);
      return false;
    }
  }

  async deactivateUser(id: string, updatedBy?: string): Promise<User> {
    try {
      await this.updateUser(id, { updatedBy });
      
      const deactivatedUser = await prisma.user.update({
        where: { id },
        data: {
          isActive: false,
          updatedBy,
          updatedAt: new Date(),
        },
      });

      logger.info(`User deactivated: ${deactivatedUser.id} (${deactivatedUser.email})`);
      return deactivatedUser;
    } catch (error) {
      logger.error('Failed to deactivate user:', error);
      throw error;
    }
  }

  async activateUser(id: string, updatedBy?: string): Promise<User> {
    try {
      const user = await this.findById(id);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const activatedUser = await prisma.user.update({
        where: { id },
        data: {
          isActive: true,
          updatedBy,
          updatedAt: new Date(),
        },
      });

      logger.info(`User activated: ${activatedUser.id} (${activatedUser.email})`);
      return activatedUser;
    } catch (error) {
      logger.error('Failed to activate user:', error);
      throw error;
    }
  }

  async verifyEmail(id: string): Promise<User> {
    try {
      const user = await prisma.user.update({
        where: { id },
        data: {
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.info(`Email verified for user: ${user.id} (${user.email})`);
      return user;
    } catch (error) {
      logger.error('Failed to verify email:', error);
      throw error;
    }
  }

  async recordLoginAttempt(id: string, success: boolean, ipAddress?: string): Promise<void> {
    try {
      if (success) {
        await prisma.user.update({
          where: { id },
          data: {
            lastLoginAt: new Date(),
            lastLoginIp: ipAddress,
            failedLoginAttempts: 0,
            lockedAt: null,
            lockedUntil: null,
          },
        });
      } else {
        const user = await this.findById(id);
        if (!user) {return;}

        const failedAttempts = user.failedLoginAttempts + 1;
        const shouldLock = failedAttempts >= config.security.maxLoginAttempts;

        await prisma.user.update({
          where: { id },
          data: {
            failedLoginAttempts: failedAttempts,
            lockedAt: shouldLock ? new Date() : null,
            lockedUntil: shouldLock ? new Date(Date.now() + config.security.lockoutTime) : null,
          },
        });

        if (shouldLock) {
          logger.warn(`User account locked due to failed login attempts: ${user.email}`);
        }
      }
    } catch (error) {
      logger.error('Failed to record login attempt:', error);
    }
  }

  async isAccountLocked(user: User): Promise<boolean> {
    if (!user.lockedUntil) {return false;}
    
    if (user.lockedUntil > new Date()) {
      return true;
    }

    // Unlock account if lockout period has expired
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedAt: null,
        lockedUntil: null,
      },
    });

    return false;
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    try {
      const userWithRoles = await this.findWithRoles(userId);
      if (!userWithRoles) {
        return [];
      }

      const permissions = new Set<string>();
      
      for (const userRole of userWithRoles.roles) {
        for (const rolePermission of userRole.role.permissions) {
          permissions.add(rolePermission.permission.name);
        }
      }

      return Array.from(permissions);
    } catch (error) {
      logger.error('Failed to get user permissions:', error);
      return [];
    }
  }

  async hasPermission(userId: string, permission: string): Promise<boolean> {
    try {
      const permissions = await this.getUserPermissions(userId);
      return permissions.includes(permission);
    } catch (error) {
      logger.error('Failed to check user permission:', error);
      return false;
    }
  }

  async searchUsers(query: string, limit = 10, offset = 0): Promise<{ users: User[]; total: number }> {
    try {
      const where: Prisma.UserWhereInput = {
        OR: [
          { email: { contains: query, mode: 'insensitive' } },
          { username: { contains: query, mode: 'insensitive' } },
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
        ],
      };

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
      ]);

      return { users, total };
    } catch (error) {
      logger.error('Failed to search users:', error);
      throw error;
    }
  }

  async getUserStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    emailVerified: number;
    lockedAccounts: number;
  }> {
    try {
      const [total, active, inactive, emailVerified, lockedAccounts] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.user.count({ where: { isActive: false } }),
        prisma.user.count({ where: { isEmailVerified: true } }),
        prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
      ]);

      return {
        total,
        active,
        inactive,
        emailVerified,
        lockedAccounts,
      };
    } catch (error) {
      logger.error('Failed to get user stats:', error);
      throw error;
    }
  }

  async findManyWithFilters(
    where: Prisma.UserWhereInput,
    options: {
      skip?: number;
      take?: number;
      orderBy?: Prisma.UserOrderByWithRelationInput;
    } = {}
  ): Promise<UserWithRoles[]> {
    try {
      return await prisma.user.findMany({
        where,
        ...options,
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    } catch (error) {
      logger.error('Failed to find users with filters:', error);
      throw error;
    }
  }

  async countWithFilters(where: Prisma.UserWhereInput): Promise<number> {
    try {
      return await prisma.user.count({ where });
    } catch (error) {
      logger.error('Failed to count users with filters:', error);
      throw error;
    }
  }

  async deleteUser(id: string): Promise<void> {
    try {
      const user = await this.findById(id);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Delete user (cascade will handle related records)
      await prisma.user.delete({
        where: { id },
      });

      logger.info(`User deleted: ${id} (${user.email})`);
    } catch (error) {
      logger.error('Failed to delete user:', error);
      throw error;
    }
  }


  async revokeUserSession(userId: string, sessionId: string): Promise<void> {
    try {
      await prisma.userSession.updateMany({
        where: {
          userId,
          sessionToken: sessionId,
        },
        data: {
          isActive: false,
        },
      });

      logger.info(`Session revoked: ${sessionId} for user ${userId}`);
    } catch (error) {
      logger.error('Failed to revoke user session:', error);
      throw error;
    }
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    try {
      await prisma.userSession.updateMany({
        where: { userId },
        data: { isActive: false },
      });

      logger.info(`All sessions revoked for user: ${userId}`);
    } catch (error) {
      logger.error('Failed to revoke all user sessions:', error);
      throw error;
    }
  }

  async createSession(sessionData: {
    userId: string;
    applicationId?: string;
    ipAddress: string;
    userAgent: string;
    expiresAt: Date;
    country?: string;
    city?: string;
    device?: string;
    browser?: string;
    os?: string;
  }): Promise<any> {
    try {
      const sessionToken = this.generateSessionToken();
      
      const session = await prisma.userSession.create({
        data: {
          userId: sessionData.userId,
          applicationId: sessionData.applicationId,
          sessionToken,
          ipAddress: sessionData.ipAddress,
          userAgent: sessionData.userAgent,
          expiresAt: sessionData.expiresAt,
          country: sessionData.country,
          city: sessionData.city,
          device: sessionData.device,
          browser: sessionData.browser,
          os: sessionData.os,
        },
      });

      logger.info(`Session created: ${sessionToken} for user ${sessionData.userId}`);
      return session;
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw error;
    }
  }

  async assignRoles(userId: string, roleIds: string[], assignedBy?: string): Promise<void> {
    try {
      const user = await this.findWithRoles(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const oldRoles = user.roles.map(ur => ur.role.name);

      // Remove existing roles
      await prisma.userRole.deleteMany({
        where: { userId },
      });

      // Add new roles
      const userRoles = roleIds.map(roleId => ({
        userId,
        roleId,
        assignedBy,
      }));

      await prisma.userRole.createMany({
        data: userRoles,
      });

      // Get new role names for security event
      const newRoles = await prisma.role.findMany({
        where: { id: { in: roleIds } },
        select: { name: true },
      });
      const newRoleNames = newRoles.map(r => r.name);

      // Trigger security event for role changes
      if (oldRoles.length > 0 || newRoleNames.length > 0) {
        const { securityEventService } = await import('./securityEventService');
        await securityEventService.handleRoleChange(userId, oldRoles, newRoleNames);
      }

      logger.info(`Roles updated for user ${userId}: ${oldRoles.join(', ')} -> ${newRoleNames.join(', ')}`);
    } catch (error) {
      logger.error('Failed to assign roles:', error);
      throw error;
    }
  }

  async addRole(userId: string, roleId: string, assignedBy?: string): Promise<void> {
    try {
      const user = await this.findWithRoles(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const existingRole = user.roles.find(ur => ur.roleId === roleId);
      if (existingRole) {
        throw new ConflictError('User already has this role');
      }

      await prisma.userRole.create({
        data: {
          userId,
          roleId,
          assignedBy,
        },
      });

      // Get role name for logging
      const role = await prisma.role.findUnique({
        where: { id: roleId },
        select: { name: true },
      });

      const oldRoles = user.roles.map(ur => ur.role.name);
      const newRoles = [...oldRoles, role?.name || 'unknown'];

      // Trigger security event for role addition
      const { securityEventService } = await import('./securityEventService');
      await securityEventService.handleRoleChange(userId, oldRoles, newRoles);

      logger.info(`Role ${role?.name} added to user ${userId}`);
    } catch (error) {
      logger.error('Failed to add role:', error);
      throw error;
    }
  }

  async removeRole(userId: string, roleId: string): Promise<void> {
    try {
      const user = await this.findWithRoles(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const existingRole = user.roles.find(ur => ur.roleId === roleId);
      if (!existingRole) {
        throw new NotFoundError('User does not have this role');
      }

      await prisma.userRole.delete({
        where: {
          userId_roleId: {
            userId,
            roleId,
          },
        },
      });

      // Get role name for logging
      const role = await prisma.role.findUnique({
        where: { id: roleId },
        select: { name: true },
      });

      const oldRoles = user.roles.map(ur => ur.role.name);
      const newRoles = oldRoles.filter(roleName => roleName !== role?.name);

      // Trigger security event for role removal
      const { securityEventService } = await import('./securityEventService');
      await securityEventService.handleRoleChange(userId, oldRoles, newRoles);

      logger.info(`Role ${role?.name} removed from user ${userId}`);
    } catch (error) {
      logger.error('Failed to remove role:', error);
      throw error;
    }
  }

  async updateEmail(userId: string, newEmail: string, updatedBy?: string): Promise<User> {
    try {
      const user = await this.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const oldEmail = user.email;

      // Check if email already exists
      const existingUser = await this.findByEmail(newEmail);
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictError('Email already in use');
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          email: newEmail,
          isEmailVerified: false, // Reset email verification
          emailVerifiedAt: null,
          updatedBy,
          updatedAt: new Date(),
        },
      });

      // Trigger security event for email change
      const { securityEventService } = await import('./securityEventService');
      await securityEventService.handleEmailChange(userId, oldEmail, newEmail);

      logger.info(`Email updated for user ${userId}: ${oldEmail} -> ${newEmail}`);
      return updatedUser;
    } catch (error) {
      logger.error('Failed to update email:', error);
      throw error;
    }
  }

  async getUserSessions(userId: string, options: { activeOnly?: boolean; limit?: number } = {}): Promise<any[]> {
    try {
      const { activeOnly = false, limit } = options;
      
      const whereClause: any = { userId };
      
      if (activeOnly) {
        whereClause.isActive = true;
        whereClause.expiresAt = {
          gt: new Date(),
        };
      }

      const sessions = await prisma.userSession.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return sessions;
    } catch (error) {
      logger.error('Failed to get user sessions:', error);
      throw error;
    }
  }

  private generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

export const userService = new UserService();