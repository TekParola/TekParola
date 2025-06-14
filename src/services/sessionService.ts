import { prisma } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';
import { UserSession } from '@prisma/client';
import crypto from 'crypto';
import { config } from '../config/env';

export interface CreateSessionData {
  userId: string;
  applicationId?: string;
  ipAddress: string;
  userAgent: string;
  remember?: boolean;
  country?: string;
  city?: string;
  device?: string;
  browser?: string;
  os?: string;
}

export interface SessionInfo {
  id: string;
  userId: string;
  applicationId?: string;
  sessionToken: string;
  ipAddress: string;
  userAgent: string;
  isActive: boolean;
  expiresAt: Date;
  lastActivityAt: Date;
  country?: string;
  city?: string;
  device?: string;
  browser?: string;
  os?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class SessionService {
  private generateSessionToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  private generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  private getSessionExpirationTime(remember: boolean = false): Date {
    const now = new Date();
    if (remember) {
      // 30 days for "remember me"
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    } else {
      // 24 hours for regular session
      return new Date(now.getTime() + config.session.timeout);
    }
  }

  async createSession(data: CreateSessionData): Promise<UserSession> {
    try {
      const sessionToken = this.generateSessionToken();
      const refreshToken = this.generateRefreshToken();
      const expiresAt = this.getSessionExpirationTime(data.remember);

      const session = await prisma.userSession.create({
        data: {
          userId: data.userId,
          applicationId: data.applicationId,
          sessionToken,
          refreshToken,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          expiresAt,
          country: data.country,
          city: data.city,
          device: data.device,
          browser: data.browser,
          os: data.os,
        },
      });

      // Cache session in Redis for quick lookup
      const sessionTtl = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
      await redisClient.setEx(
        `session:${sessionToken}`,
        sessionTtl,
        JSON.stringify({
          id: session.id,
          userId: session.userId,
          applicationId: session.applicationId,
          isActive: session.isActive,
        })
      );

      logger.info('Session created', {
        sessionId: session.id,
        userId: data.userId,
        ipAddress: data.ipAddress,
      });

      return session;
    } catch (error) {
      logger.error('Failed to create session', { error, userId: data.userId });
      throw new ValidationError('Failed to create session');
    }
  }

  async getSession(sessionToken: string): Promise<UserSession | null> {
    try {
      // Try Redis first for better performance
      const cachedSession = await redisClient.get(`session:${sessionToken}`);
      if (cachedSession) {
        const sessionData = JSON.parse(cachedSession);
        if (!sessionData.isActive) {
          return null;
        }
      }

      const session = await prisma.userSession.findUnique({
        where: {
          sessionToken,
          isActive: true,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      if (!session) {
        // Remove from cache if exists
        await redisClient.del(`session:${sessionToken}`);
        return null;
      }

      return session;
    } catch (error) {
      logger.error('Failed to get session', { error, sessionToken });
      return null;
    }
  }

  async updateSessionActivity(sessionToken: string): Promise<UserSession | null> {
    try {
      const session = await this.getSession(sessionToken);
      if (!session) {
        return null;
      }

      const updatedSession = await prisma.userSession.update({
        where: { id: session.id },
        data: {
          lastActivityAt: new Date(),
        },
      });

      // Update cache
      const sessionTtl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
      if (sessionTtl > 0) {
        await redisClient.setEx(
          `session:${sessionToken}`,
          sessionTtl,
          JSON.stringify({
            id: updatedSession.id,
            userId: updatedSession.userId,
            applicationId: updatedSession.applicationId,
            isActive: updatedSession.isActive,
          })
        );
      }

      return updatedSession;
    } catch (error) {
      logger.error('Failed to update session activity', { error, sessionToken });
      return null;
    }
  }

  async invalidateSession(sessionToken: string): Promise<boolean> {
    try {
      const session = await prisma.userSession.findUnique({
        where: { sessionToken },
      });

      if (!session) {
        return false;
      }

      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          isActive: false,
        },
      });

      // Remove from cache
      await redisClient.del(`session:${sessionToken}`);

      logger.info('Session invalidated', {
        sessionId: session.id,
        userId: session.userId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to invalidate session', { error, sessionToken });
      return false;
    }
  }

  async invalidateUserSessions(userId: string, excludeSessionId?: string): Promise<number> {
    try {
      const whereClause: any = {
        userId,
        isActive: true,
      };

      if (excludeSessionId) {
        whereClause.id = { not: excludeSessionId };
      }

      const sessions = await prisma.userSession.findMany({
        where: whereClause,
        select: { sessionToken: true },
      });

      if (sessions.length === 0) {
        return 0;
      }

      // Invalidate in database
      const result = await prisma.userSession.updateMany({
        where: whereClause,
        data: {
          isActive: false,
        },
      });

      // Remove from cache
      const deletePromises = sessions.map(session =>
        redisClient.del(`session:${session.sessionToken}`)
      );
      await Promise.all(deletePromises);

      logger.info('User sessions invalidated', {
        userId,
        excludeSessionId,
        count: result.count,
      });

      return result.count;
    } catch (error) {
      logger.error('Failed to invalidate user sessions', { error, userId });
      return 0;
    }
  }

  async getUserSessions(userId: string, activeOnly: boolean = true): Promise<UserSession[]> {
    try {
      const whereClause: any = { userId };
      
      if (activeOnly) {
        whereClause.isActive = true;
        whereClause.expiresAt = { gt: new Date() };
      }

      const sessions = await prisma.userSession.findMany({
        where: whereClause,
        orderBy: { lastActivityAt: 'desc' },
      });

      return sessions;
    } catch (error) {
      logger.error('Failed to get user sessions', { error, userId });
      return [];
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    try {
      const expiredSessions = await prisma.userSession.findMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { isActive: false },
          ],
        },
        select: { sessionToken: true },
      });

      if (expiredSessions.length === 0) {
        return 0;
      }

      // Remove from database
      const result = await prisma.userSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { isActive: false },
          ],
        },
      });

      // Remove from cache
      const deletePromises = expiredSessions.map(session =>
        redisClient.del(`session:${session.sessionToken}`)
      );
      await Promise.all(deletePromises);

      logger.info('Expired sessions cleaned up', { count: result.count });

      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', { error });
      return 0;
    }
  }

  async getSessionStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    uniqueUsers: number;
  }> {
    try {
      const [total, active, expired, uniqueUsersResult] = await Promise.all([
        prisma.userSession.count(),
        prisma.userSession.count({
          where: {
            isActive: true,
            expiresAt: { gt: new Date() },
          },
        }),
        prisma.userSession.count({
          where: {
            OR: [
              { expiresAt: { lt: new Date() } },
              { isActive: false },
            ],
          },
        }),
        prisma.userSession.findMany({
          where: {
            isActive: true,
            expiresAt: { gt: new Date() },
          },
          select: { userId: true },
          distinct: ['userId'],
        }),
      ]);

      return {
        total,
        active,
        expired,
        uniqueUsers: uniqueUsersResult.length,
      };
    } catch (error) {
      logger.error('Failed to get session stats', { error });
      return {
        total: 0,
        active: 0,
        expired: 0,
        uniqueUsers: 0,
      };
    }
  }
}

export const sessionService = new SessionService();