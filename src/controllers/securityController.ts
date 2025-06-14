import { Request, Response } from 'express';
import { securityEventService } from '../services/securityEventService';
import { auditService } from '../services/auditService';
import { userService } from '../services/userService';
import { ApiResponse } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { NotFoundError, ValidationError } from '../utils/errors';

class SecurityController {
  // Get security events for a user
  getSecurityEvents = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { userId } = req.params;
    const { 
      limit = 50, 
      offset = 0, 
      startDate, 
      endDate,
      action 
    } = req.query;

    // Verify user exists
    if (!userId) {
      throw new ValidationError('User ID is required');
    }
    const user = await userService.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const filters: any = {
      userId,
      action: action ? String(action) : undefined,
      startDate: startDate ? new Date(String(startDate)) : undefined,
      endDate: endDate ? new Date(String(endDate)) : undefined,
    };

    const events = await auditService.findMany(filters, {
      limit: Number(limit),
      offset: Number(offset),
    });

    const totalCount = await auditService.count(filters);

    res.json({
      success: true,
      message: 'Security events retrieved successfully',
      data: {
        events,
        pagination: {
          total: totalCount,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: totalCount > Number(offset) + Number(limit),
        },
      },
    });
  });

  // Get security overview for a user
  getSecurityOverview = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { userId } = req.params;

    // Verify user exists
    if (!userId) {
      throw new ValidationError('User ID is required');
    }
    const user = await userService.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get security events from last 30 days
    const securityEvents = await auditService.findMany({
      userId,
      action: 'security_event',
      startDate: thirtyDaysAgo,
    });

    // Get login attempts
    const loginAttempts = await auditService.findMany({
      userId,
      action: 'login',
      startDate: thirtyDaysAgo,
    });

    const failedLogins = loginAttempts.filter(event => !event.success);
    const successfulLogins = loginAttempts.filter(event => event.success);

    // Get active sessions
    const activeSessions = await userService.getUserSessions(userId);

    // Get recent locations (unique IP addresses)
    const recentLocations = [...new Set(
      successfulLogins
        .slice(0, 10)
        .map(login => login.ipAddress)
        .filter(Boolean)
    )];

    // Count security events by type
    const eventTypeStats = securityEvents.reduce((acc: Record<string, number>, event) => {
      const eventType = (event.details as any)?.eventType || 'unknown';
      acc[eventType] = (acc[eventType] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      message: 'Security overview retrieved successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          isActive: user.isActive,
          twoFactorEnabled: user.twoFactorEnabled,
          lastLoginAt: user.lastLoginAt,
          lockedUntil: user.lockedUntil,
        },
        statistics: {
          totalSecurityEvents: securityEvents.length,
          failedLoginAttempts: failedLogins.length,
          successfulLogins: successfulLogins.length,
          activeSessions: activeSessions.length,
          recentLocations: recentLocations.length,
        },
        securityEvents: {
          byType: eventTypeStats,
          recent: securityEvents.slice(0, 5),
        },
        sessions: {
          active: activeSessions.slice(0, 5),
          total: activeSessions.length,
        },
        locations: {
          recent: recentLocations.slice(0, 5),
        },
      },
    });
  });

  // Manually trigger a security check for a user
  triggerSecurityCheck = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { userId } = req.params;
    const { ipAddress, userAgent } = req.body;

    // Verify user exists
    if (!userId) {
      throw new ValidationError('User ID is required');
    }
    const user = await userService.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Trigger security checks
    await securityEventService.detectSuspiciousLogin(
      userId, 
      ipAddress || req.ip || '0.0.0.0', 
      userAgent || req.get('User-Agent') || 'Unknown'
    );

    res.json({
      success: true,
      message: 'Security check triggered successfully',
      data: {
        userId,
        checkedAt: new Date().toISOString(),
      },
    });
  });

  // Invalidate all sessions for security reasons
  invalidateAllSessions = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { userId } = req.params;
    const { reason } = req.body;

    // Verify user exists
    if (!userId) {
      throw new ValidationError('User ID is required');
    }
    const user = await userService.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Count active sessions before invalidation
    const activeSessions = await userService.getUserSessions(userId);

    // Revoke all sessions
    await userService.revokeAllUserSessions(userId);

    // Log the action
    await auditService.log({
      userId,
      action: 'security_action',
      resource: 'session',
      resourceId: userId,
      details: {
        action: 'invalidate_all_sessions',
        reason: reason || 'Manual security action',
        sessionsInvalidated: activeSessions.length,
        triggeredBy: req.user?.id,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      success: true,
    });

    res.json({
      success: true,
      message: 'All sessions invalidated successfully',
      data: {
        userId,
        sessionsInvalidated: activeSessions.length,
        invalidatedAt: new Date().toISOString(),
      },
    });
  });

  // Lock user account for security reasons
  lockAccount = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { userId } = req.params;
    const { reason, duration = 3600 } = req.body; // Default 1 hour lock

    // Verify user exists
    if (!userId) {
      throw new ValidationError('User ID is required');
    }
    const user = await userService.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Set lock duration
    const lockedUntil = new Date(Date.now() + Number(duration) * 1000);

    // Update user lock status is handled by prisma directly below

    // Use direct Prisma update for lock fields
    const { prisma } = await import('../config/database');
    await prisma.user.update({
      where: { id: userId },
      data: {
        lockedAt: new Date(),
        lockedUntil,
      },
    });

    // Revoke all sessions
    await userService.revokeAllUserSessions(userId);

    // Log the action
    await auditService.log({
      userId,
      action: 'security_action',
      resource: 'user',
      resourceId: userId,
      details: {
        action: 'lock_account',
        reason: reason || 'Manual security action',
        lockedUntil: lockedUntil.toISOString(),
        triggeredBy: req.user?.id,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      success: true,
    });

    res.json({
      success: true,
      message: 'Account locked successfully',
      data: {
        userId,
        lockedUntil: lockedUntil.toISOString(),
        reason,
      },
    });
  });

  // Unlock user account
  unlockAccount = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
      return;
    }

    // Verify user exists
    const user = await userService.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Remove lock
    const { prisma } = await import('../config/database');
    await prisma.user.update({
      where: { id: userId },
      data: {
        lockedAt: null,
        lockedUntil: null,
      },
    });

    // Log the action
    await auditService.log({
      userId,
      action: 'security_action',
      resource: 'user',
      resourceId: userId,
      details: {
        action: 'unlock_account',
        reason: reason || 'Manual security action',
        triggeredBy: req.user?.id,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      success: true,
    });

    res.json({
      success: true,
      message: 'Account unlocked successfully',
      data: {
        userId,
        unlockedAt: new Date().toISOString(),
        reason,
      },
    });
  });

  // Get system-wide security statistics
  getSystemSecurityStats = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { 
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), 
      endDate = new Date().toISOString() 
    } = req.query;

    const filters = {
      startDate: new Date(String(startDate)),
      endDate: new Date(String(endDate)),
    };

    // Get security events
    const securityEvents = await auditService.findMany({
      ...filters,
      action: 'security_event',
    });

    // Get failed login attempts
    const failedLogins = await auditService.findMany({
      ...filters,
      action: 'login',
      success: false,
    });

    // Get successful logins
    const successfulLogins = await auditService.findMany({
      ...filters,
      action: 'login',
      success: true,
    });

    // Get locked accounts
    const { prisma } = await import('../config/database');
    const lockedAccounts = await prisma.user.count({
      where: {
        lockedUntil: {
          gt: new Date(),
        },
      },
    });

    // Group events by type
    const eventsByType = securityEvents.reduce((acc: Record<string, number>, event) => {
      const eventType = (event.details as any)?.eventType || 'unknown';
      acc[eventType] = (acc[eventType] || 0) + 1;
      return acc;
    }, {});

    // Group failed logins by IP
    const failedLoginsByIp = failedLogins.reduce((acc: Record<string, number>, event) => {
      const ip = event.ipAddress || 'unknown';
      acc[ip] = (acc[ip] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      message: 'System security statistics retrieved successfully',
      data: {
        period: {
          startDate: filters.startDate,
          endDate: filters.endDate,
        },
        statistics: {
          totalSecurityEvents: securityEvents.length,
          failedLoginAttempts: failedLogins.length,
          successfulLogins: successfulLogins.length,
          lockedAccounts,
        },
        trends: {
          securityEventsByType: eventsByType,
          failedLoginsByIp: Object.entries(failedLoginsByIp)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .reduce((acc, [ip, count]) => ({ ...acc, [ip]: count }), {}),
        },
        recentEvents: securityEvents.slice(0, 10),
      },
    });
  });
}

export const securityController = new SecurityController();