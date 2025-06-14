import { Request, Response } from 'express';
import { userService } from '../services/userService';
import { prisma } from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';
import { NotFoundError } from '../utils/errors';

export class SessionController {
  // Get current user's sessions
  getCurrentUserSessions = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const sessions = await userService.getUserSessions(userId);

    res.status(200).json({
      success: true,
      message: 'Sessions retrieved successfully',
      data: {
        sessions: sessions.map(session => ({
          id: session.id,
          sessionToken: session.sessionToken,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          country: session.country,
          city: session.city,
          device: session.device,
          browser: session.browser,
          os: session.os,
          createdAt: session.createdAt,
          lastActivityAt: session.lastActivityAt,
          expiresAt: session.expiresAt,
          isCurrent: session.sessionToken === req.sessionId,
        })),
      },
    });
  });

  // Revoke current user's session
  revokeCurrentUserSession = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { sessionId } = req.params;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
      return;
    }

    await userService.revokeUserSession(userId, sessionId);

    res.status(200).json({
      success: true,
      message: 'Session revoked successfully',
    });
  });

  // Revoke all current user's sessions except current
  revokeAllCurrentUserSessions = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const currentSessionId = req.sessionId!;

    // Revoke all sessions except the current one
    await prisma.userSession.updateMany({
      where: {
        userId,
        sessionToken: { not: currentSessionId },
      },
      data: {
        isActive: false,
      },
    });

    res.status(200).json({
      success: true,
      message: 'All other sessions revoked successfully',
    });
  });

  // Get all sessions (admin only)
  getAllSessions = asyncHandler(async (req: Request, res: Response) => {
    const {
      userId,
      isActive = 'all',
      limit = 50,
      offset = 0,
    } = req.query;

    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    // Build where conditions
    const where: any = {};

    if (userId) {
      where.userId = userId;
    }

    if (isActive !== 'all') {
      where.isActive = isActive === 'true';
    }

    const [sessions, total] = await Promise.all([
      prisma.userSession.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { lastActivityAt: 'desc' },
        take: limitNum,
        skip: offsetNum,
      }),
      prisma.userSession.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      message: 'Sessions retrieved successfully',
      data: {
        sessions: sessions.map(session => ({
          id: session.id,
          sessionToken: session.sessionToken,
          userId: session.userId,
          user: session.user,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          country: session.country,
          city: session.city,
          device: session.device,
          browser: session.browser,
          os: session.os,
          isActive: session.isActive,
          createdAt: session.createdAt,
          lastActivityAt: session.lastActivityAt,
          expiresAt: session.expiresAt,
        })),
        pagination: {
          total,
          limit: limitNum,
          offset: offsetNum,
          hasNext: offsetNum + limitNum < total,
          hasPrev: offsetNum > 0,
        },
      },
    });
  });

  // Revoke session (admin only)
  revokeSession = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
      return;
    }

    // Find session first to get user info
    const session = await prisma.userSession.findUnique({
      where: { sessionToken: sessionId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Revoke the session
    await prisma.userSession.update({
      where: { sessionToken: sessionId },
      data: { isActive: false },
    });

    res.status(200).json({
      success: true,
      message: 'Session revoked successfully',
      data: {
        sessionId,
        userId: session.userId,
        userEmail: session.user.email,
      },
    });
  });

  // Get session statistics (admin only)
  getSessionStats = asyncHandler(async (req: Request, res: Response) => {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalSessions,
      activeSessions,
      inactiveSessions,
      uniqueActiveUsers,
      sessionsLast24h,
      sessionsLast7Days,
    ] = await Promise.all([
      prisma.userSession.count(),
      prisma.userSession.count({ where: { isActive: true } }),
      prisma.userSession.count({ where: { isActive: false } }),
      prisma.userSession.groupBy({
        by: ['userId'],
        where: { isActive: true },
      }).then(result => result.length),
      prisma.userSession.count({
        where: { createdAt: { gte: last24Hours } },
      }),
      prisma.userSession.count({
        where: { createdAt: { gte: last7Days } },
      }),
    ]);

    // Get top browsers and operating systems
    const [topBrowsers, topOS] = await Promise.all([
      prisma.userSession.groupBy({
        by: ['browser'],
        where: {
          isActive: true,
          browser: { not: null },
        },
        _count: {
          browser: true,
        },
        orderBy: {
          _count: {
            browser: 'desc',
          },
        },
        take: 5,
      }),
      prisma.userSession.groupBy({
        by: ['os'],
        where: {
          isActive: true,
          os: { not: null },
        },
        _count: {
          os: true,
        },
        orderBy: {
          _count: {
            os: 'desc',
          },
        },
        take: 5,
      }),
    ]);

    res.status(200).json({
      success: true,
      message: 'Session statistics retrieved successfully',
      data: {
        stats: {
          total: totalSessions,
          active: activeSessions,
          inactive: inactiveSessions,
          uniqueActiveUsers,
          averageSessionsPerUser: uniqueActiveUsers > 0 ? activeSessions / uniqueActiveUsers : 0,
          createdLast24h: sessionsLast24h,
          createdLast7Days: sessionsLast7Days,
        },
        topBrowsers: topBrowsers.map(item => ({
          browser: item.browser,
          count: item._count.browser,
        })),
        topOS: topOS.map(item => ({
          os: item.os,
          count: item._count.os,
        })),
      },
    });
  });

  // Clean expired sessions (admin only)
  cleanExpiredSessions = asyncHandler(async (req: Request, res: Response) => {
    const now = new Date();

    const result = await prisma.userSession.updateMany({
      where: {
        expiresAt: { lt: now },
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Expired sessions cleaned successfully',
      data: {
        cleanedSessions: result.count,
      },
    });
  });

  // Get session activity trends (admin only)
  getSessionActivity = asyncHandler(async (req: Request, res: Response) => {
    const { days = 7 } = req.query;
    const daysNum = parseInt(days as string, 10);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    // Get daily session creation trends
    const dailyTrends = [];
    for (let i = 0; i < daysNum; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const sessionsCreated = await prisma.userSession.count({
        where: {
          createdAt: {
            gte: date,
            lt: nextDate,
          },
        },
      });

      dailyTrends.push({
        date: date.toISOString().split('T')[0],
        sessionsCreated,
      });
    }

    // Get hourly trends for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const hourlyTrends = [];

    for (let hour = 0; hour < 24; hour++) {
      const hourStart = new Date(today);
      hourStart.setHours(hour);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hour + 1);

      const sessionsCreated = await prisma.userSession.count({
        where: {
          createdAt: {
            gte: hourStart,
            lt: hourEnd,
          },
        },
      });

      hourlyTrends.push({
        hour,
        sessionsCreated,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Session activity trends retrieved successfully',
      data: {
        dailyTrends,
        hourlyTrends,
      },
    });
  });
}

export const sessionController = new SessionController();