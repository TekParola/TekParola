import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface DashboardStats {
  users: {
    total: number;
    active: number;
    inactive: number;
    emailVerified: number;
    newThisMonth: number;
    newToday: number;
  };
  sessions: {
    total: number;
    active: number;
    uniqueUsers: number;
    averagePerUser: number;
  };
  authentication: {
    loginAttemptsToday: number;
    successfulLoginsToday: number;
    failedLoginsToday: number;
    successRate: number;
    lockedAccounts: number;
  };
  applications: {
    total: number;
    active: number;
    inactive: number;
  };
  security: {
    recentFailedLogins: number;
    suspiciousActivities: number;
    twoFactorEnabled: number;
  };
}

export interface ActivityMetrics {
  daily: Array<{
    date: string;
    logins: number;
    registrations: number;
    failedLogins: number;
  }>;
  hourly: Array<{
    hour: number;
    logins: number;
  }>;
}

export interface TopUsers {
  mostActive: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    sessionCount: number;
    lastLoginAt: Date;
  }>;
  recentRegistrations: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    createdAt: Date;
  }>;
}

export class DashboardService {
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // User statistics
      const [
        totalUsers,
        activeUsers,
        inactiveUsers,
        emailVerifiedUsers,
        newUsersThisMonth,
        newUsersToday,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.user.count({ where: { isActive: false } }),
        prisma.user.count({ where: { isEmailVerified: true } }),
        prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
        prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      ]);

      // Session statistics
      const [
        totalSessions,
        activeSessions,
        uniqueActiveUsers,
      ] = await Promise.all([
        prisma.userSession.count(),
        prisma.userSession.count({ where: { isActive: true } }),
        prisma.userSession.groupBy({
          by: ['userId'],
          where: { isActive: true },
        }).then(result => result.length),
      ]);

      // Authentication statistics
      const [
        loginAttemptsToday,
        successfulLoginsToday,
        lockedAccounts,
        twoFactorEnabledUsers,
      ] = await Promise.all([
        prisma.auditLog.count({
          where: {
            action: 'login',
            createdAt: { gte: todayStart },
          },
        }),
        prisma.auditLog.count({
          where: {
            action: 'login',
            success: true,
            createdAt: { gte: todayStart },
          },
        }),
        prisma.user.count({ where: { lockedUntil: { gt: now } } }),
        prisma.user.count({ where: { twoFactorEnabled: true } }),
      ]);

      const failedLoginsToday = loginAttemptsToday - successfulLoginsToday;
      const successRate = loginAttemptsToday > 0 ? (successfulLoginsToday / loginAttemptsToday) * 100 : 0;

      // Application statistics
      const [
        totalApplications,
        activeApplications,
      ] = await Promise.all([
        prisma.application.count(),
        prisma.application.count({ where: { isActive: true } }),
      ]);

      // Security metrics
      const recentFailedLogins = await prisma.auditLog.count({
        where: {
          action: 'login',
          success: false,
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, // Last 24 hours
        },
      });

      return {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: inactiveUsers,
          emailVerified: emailVerifiedUsers,
          newThisMonth: newUsersThisMonth,
          newToday: newUsersToday,
        },
        sessions: {
          total: totalSessions,
          active: activeSessions,
          uniqueUsers: uniqueActiveUsers,
          averagePerUser: uniqueActiveUsers > 0 ? activeSessions / uniqueActiveUsers : 0,
        },
        authentication: {
          loginAttemptsToday,
          successfulLoginsToday,
          failedLoginsToday,
          successRate: Math.round(successRate * 100) / 100,
          lockedAccounts,
        },
        applications: {
          total: totalApplications,
          active: activeApplications,
          inactive: totalApplications - activeApplications,
        },
        security: {
          recentFailedLogins,
          suspiciousActivities: 0, // This would be calculated based on specific criteria
          twoFactorEnabled: twoFactorEnabledUsers,
        },
      };
    } catch (error) {
      logger.error('Failed to get dashboard stats:', error);
      throw error;
    }
  }

  async getActivityMetrics(days = 7): Promise<ActivityMetrics> {
    try {
      const now = new Date();
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      // Daily metrics
      const dailyMetrics = [];
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
        
        const [logins, registrations, failedLogins] = await Promise.all([
          prisma.auditLog.count({
            where: {
              action: 'login',
              success: true,
              createdAt: { gte: date, lt: nextDate },
            },
          }),
          prisma.user.count({
            where: {
              createdAt: { gte: date, lt: nextDate },
            },
          }),
          prisma.auditLog.count({
            where: {
              action: 'login',
              success: false,
              createdAt: { gte: date, lt: nextDate },
            },
          }),
        ]);

        dailyMetrics.push({
          date: date.toISOString().split('T')[0]!,
          logins,
          registrations,
          failedLogins,
        });
      }

      // Hourly metrics for today
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const hourlyMetrics = [];
      
      for (let hour = 0; hour < 24; hour++) {
        const hourStart = new Date(todayStart.getTime() + hour * 60 * 60 * 1000);
        const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
        
        const logins = await prisma.auditLog.count({
          where: {
            action: 'login',
            success: true,
            createdAt: { gte: hourStart, lt: hourEnd },
          },
        });

        hourlyMetrics.push({
          hour,
          logins,
        });
      }

      return {
        daily: dailyMetrics,
        hourly: hourlyMetrics,
      };
    } catch (error) {
      logger.error('Failed to get activity metrics:', error);
      throw error;
    }
  }

  async getTopUsers(): Promise<TopUsers> {
    try {
      // Most active users (by session count)
      const mostActiveUsers = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          lastLoginAt: true,
          _count: {
            select: {
              sessions: {
                where: { isActive: true },
              },
            },
          },
        },
        orderBy: {
          sessions: {
            _count: 'desc',
          },
        },
        take: 10,
      });

      // Recent registrations
      const recentRegistrations = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      });

      return {
        mostActive: mostActiveUsers.map(user => ({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          sessionCount: user._count.sessions,
          lastLoginAt: user.lastLoginAt!,
        })),
        recentRegistrations,
      };
    } catch (error) {
      logger.error('Failed to get top users:', error);
      throw error;
    }
  }

  async getRecentAuditLogs(limit = 50): Promise<any[]> {
    try {
      return await prisma.auditLog.findMany({
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          success: true,
          ipAddress: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      });
    } catch (error) {
      logger.error('Failed to get recent audit logs:', error);
      throw error;
    }
  }

  async getSystemHealth(): Promise<{
    database: boolean;
    redis: boolean;
    email: boolean;
    uptime: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
  }> {
    try {
      // Check database connection
      let databaseHealthy = true;
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        databaseHealthy = false;
      }

      // Check Redis connection
      let redisHealthy = true;
      try {
        const { redisClient } = await import('../config/redis');
        await redisClient.ping();
      } catch (error) {
        redisHealthy = false;
      }

      // Check email service
      let emailHealthy = true;
      try {
        const { emailService } = await import('./emailService');
        emailHealthy = await emailService.testConnection();
      } catch (error) {
        emailHealthy = false;
      }

      // Memory usage
      const memoryUsage = process.memoryUsage();
      const totalMemory = memoryUsage.heapTotal;
      const usedMemory = memoryUsage.heapUsed;
      const memoryPercentage = (usedMemory / totalMemory) * 100;

      return {
        database: databaseHealthy,
        redis: redisHealthy,
        email: emailHealthy,
        uptime: process.uptime(),
        memory: {
          used: usedMemory,
          total: totalMemory,
          percentage: Math.round(memoryPercentage * 100) / 100,
        },
      };
    } catch (error) {
      logger.error('Failed to get system health:', error);
      throw error;
    }
  }

  async getSecurityEvents(limit = 20): Promise<any[]> {
    try {
      return await prisma.auditLog.findMany({
        where: {
          OR: [
            { action: 'login', success: false },
            { action: 'password_reset_request' },
            { action: 'enable_2fa' },
            { action: 'disable_2fa' },
            { action: 'account_locked' },
          ],
        },
        select: {
          id: true,
          action: true,
          success: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      });
    } catch (error) {
      logger.error('Failed to get security events:', error);
      throw error;
    }
  }
}

export const dashboardService = new DashboardService();