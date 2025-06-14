import { AuditLog, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface AuditLogData {
  userId?: string;
  applicationId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  errorMessage?: string;
}

export interface AuditLogFilters {
  userId?: string;
  applicationId?: string;
  action?: string;
  resource?: string;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
  ipAddress?: string;
}

export class AuditService {
  async findById(id: string): Promise<AuditLog | null> {
    try {
      return await prisma.auditLog.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          application: {
            select: {
              id: true,
              name: true,
              displayName: true,
            },
          },
        },
      });
    } catch (error) {
      logger.error('Failed to find audit log by ID:', error);
      throw error;
    }
  }

  async log(logData: AuditLogData): Promise<AuditLog> {
    try {
      const auditLog = await prisma.auditLog.create({
        data: {
          userId: logData.userId,
          applicationId: logData.applicationId,
          action: logData.action,
          resource: logData.resource,
          resourceId: logData.resourceId,
          details: logData.details || {},
          ipAddress: logData.ipAddress || '0.0.0.0',
          userAgent: logData.userAgent || 'Unknown',
          success: logData.success !== false, // Default to true unless explicitly false
          errorMessage: logData.errorMessage,
        },
      });

      return auditLog;
    } catch (error) {
      // Don't throw errors for audit logging failures to avoid breaking main functionality
      logger.error('Failed to create audit log:', error);
      throw error;
    }
  }

  async findMany(
    filters: AuditLogFilters = {},
    options: {
      limit?: number;
      offset?: number;
      orderBy?: Prisma.AuditLogOrderByWithRelationInput[];
    } = {}
  ): Promise<AuditLog[]> {
    try {
      const where: Prisma.AuditLogWhereInput = {};

      if (filters.userId) {where.userId = filters.userId;}
      if (filters.applicationId) {where.applicationId = filters.applicationId;}
      if (filters.action) {where.action = filters.action;}
      if (filters.resource) {where.resource = filters.resource;}
      if (filters.success !== undefined) {where.success = filters.success;}
      if (filters.ipAddress) {where.ipAddress = filters.ipAddress;}

      if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) {where.createdAt.gte = filters.startDate;}
        if (filters.endDate) {where.createdAt.lte = filters.endDate;}
      }

      return await prisma.auditLog.findMany({
        where,
        orderBy: options.orderBy || [{ createdAt: 'desc' }],
        take: options.limit || 50,
        skip: options.offset || 0,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          application: {
            select: {
              id: true,
              name: true,
              displayName: true,
            },
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get audit logs:', error);
      throw error;
    }
  }

  async count(filters: AuditLogFilters = {}): Promise<number> {
    try {
      const where: Prisma.AuditLogWhereInput = {};

      if (filters.userId) {where.userId = filters.userId;}
      if (filters.applicationId) {where.applicationId = filters.applicationId;}
      if (filters.action) {where.action = filters.action;}
      if (filters.resource) {where.resource = filters.resource;}
      if (filters.success !== undefined) {where.success = filters.success;}
      if (filters.ipAddress) {where.ipAddress = filters.ipAddress;}

      if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) {where.createdAt.gte = filters.startDate;}
        if (filters.endDate) {where.createdAt.lte = filters.endDate;}
      }

      return await prisma.auditLog.count({ where });
    } catch (error) {
      logger.error('Failed to count audit logs:', error);
      throw error;
    }
  }

  async getActionStats(
    filters: AuditLogFilters = {},
    limit = 10
  ): Promise<Array<{ action: string; count: number }>> {
    try {
      const where: Prisma.AuditLogWhereInput = {};

      if (filters.userId) {where.userId = filters.userId;}
      if (filters.applicationId) {where.applicationId = filters.applicationId;}
      if (filters.resource) {where.resource = filters.resource;}
      if (filters.success !== undefined) {where.success = filters.success;}

      if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) {where.createdAt.gte = filters.startDate;}
        if (filters.endDate) {where.createdAt.lte = filters.endDate;}
      }

      const stats = await prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: {
          action: true,
        },
        orderBy: {
          _count: {
            action: 'desc',
          },
        },
        take: limit,
      });

      return stats.map(stat => ({
        action: stat.action,
        count: stat._count.action,
      }));
    } catch (error) {
      logger.error('Failed to get action stats:', error);
      throw error;
    }
  }

  async getUserActivity(
    userId: string,
    limit = 20,
    offset = 0
  ): Promise<AuditLog[]> {
    try {
      return await this.findMany(
        { userId },
        {
          limit,
          offset,
          orderBy: [{ createdAt: 'desc' }],
        }
      );
    } catch (error) {
      logger.error('Failed to get user activity:', error);
      throw error;
    }
  }

  async getApplicationActivity(
    applicationId: string,
    limit = 20,
    offset = 0
  ): Promise<AuditLog[]> {
    try {
      return await this.findMany(
        { applicationId },
        {
          limit,
          offset,
          orderBy: [{ createdAt: 'desc' }],
        }
      );
    } catch (error) {
      logger.error('Failed to get application activity:', error);
      throw error;
    }
  }

  async getFailedActions(
    filters: AuditLogFilters = {},
    limit = 20,
    offset = 0
  ): Promise<AuditLog[]> {
    try {
      return await this.findMany(
        { ...filters, success: false },
        {
          limit,
          offset,
          orderBy: [{ createdAt: 'desc' }],
        }
      );
    } catch (error) {
      logger.error('Failed to get failed actions:', error);
      throw error;
    }
  }

  async getSecurityEvents(
    limit = 20,
    offset = 0
  ): Promise<AuditLog[]> {
    try {
      const securityActions = [
        'login',
        'logout',
        'password_reset',
        'password_change',
        'email_verification',
        'two_factor_enable',
        'two_factor_disable',
        'account_locked',
        'account_unlocked',
        'permission_granted',
        'permission_revoked',
        'role_assigned',
        'role_revoked',
        'api_key_created',
        'api_key_revoked',
        'sso_authorize',
        'sso_token_exchange',
      ];

      const where: Prisma.AuditLogWhereInput = {
        action: { in: securityActions },
      };

      return await prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          application: {
            select: {
              id: true,
              name: true,
              displayName: true,
            },
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get security events:', error);
      throw error;
    }
  }

  async cleanup(retentionDays = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await prisma.auditLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      logger.info(`Cleaned up ${result.count} audit logs older than ${retentionDays} days`);
      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup audit logs:', error);
      throw error;
    }
  }
}

export const auditService = new AuditService();