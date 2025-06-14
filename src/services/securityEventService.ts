import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { userService } from './userService';
import { auditService } from './auditService';
import { emailService } from './emailService';
import { jwtService } from '../utils/jwt';

export enum SecurityEventType {
  SUSPICIOUS_LOGIN = 'suspicious_login',
  MULTIPLE_FAILED_LOGINS = 'multiple_failed_logins',
  PASSWORD_CHANGED = 'password_changed',
  EMAIL_CHANGED = 'email_changed',
  TWO_FA_DISABLED = 'two_fa_disabled',
  ACCOUNT_LOCKED = 'account_locked',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  ADMIN_ROLE_ASSIGNED = 'admin_role_assigned',
  ADMIN_ROLE_REMOVED = 'admin_role_removed',
  PERMISSION_ESCALATION = 'permission_escalation',
  UNUSUAL_LOCATION = 'unusual_location',
  CONCURRENT_SESSIONS_LIMIT = 'concurrent_sessions_limit',
  API_KEY_COMPROMISED = 'api_key_compromised',
  BRUTE_FORCE_DETECTED = 'brute_force_detected',
}

export interface SecurityEvent {
  type: SecurityEventType;
  userId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  shouldInvalidateSessions?: boolean;
  shouldNotifyUser?: boolean;
  shouldLockAccount?: boolean;
}

export interface SecurityEventResponse {
  sessionsInvalidated: number;
  userNotified: boolean;
  accountLocked: boolean;
  auditLogCreated: boolean;
}

export class SecurityEventService {
  private readonly MAX_FAILED_LOGINS = 5;
  private readonly BRUTE_FORCE_WINDOW = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_CONCURRENT_SESSIONS = 10;

  async handleSecurityEvent(event: SecurityEvent): Promise<SecurityEventResponse> {
    try {
      logger.warn(`Security event detected: ${event.type} for user ${event.userId}`, {
        severity: event.severity,
        details: event.details,
        ipAddress: event.ipAddress,
      });

      const response: SecurityEventResponse = {
        sessionsInvalidated: 0,
        userNotified: false,
        accountLocked: false,
        auditLogCreated: false,
      };

      // Create audit log
      await auditService.log({
        userId: event.userId,
        action: 'security_event',
        resource: 'user',
        resourceId: event.userId,
        details: {
          eventType: event.type,
          severity: event.severity,
          ...event.details,
        },
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        success: true,
      });
      response.auditLogCreated = true;

      // Handle session invalidation
      if (event.shouldInvalidateSessions || this.shouldInvalidateSessionsForEvent(event)) {
        response.sessionsInvalidated = await this.invalidateUserSessions(event);
      }

      // Handle account locking
      if (event.shouldLockAccount || this.shouldLockAccountForEvent(event)) {
        await this.lockUserAccount(event.userId, event.type);
        response.accountLocked = true;
      }

      // Handle user notification
      if (event.shouldNotifyUser || this.shouldNotifyUserForEvent(event)) {
        await this.notifyUserOfSecurityEvent(event);
        response.userNotified = true;
      }

      // Handle specific event types
      await this.handleSpecificEventType(event);

      logger.info(`Security event handled: ${event.type}`, response);
      return response;
    } catch (error) {
      logger.error('Failed to handle security event:', error);
      throw error;
    }
  }

  async detectSuspiciousLogin(userId: string, ipAddress: string, userAgent: string): Promise<void> {
    try {
      // Check for unusual location (simplified - in production, use geolocation service)
      const recentSessions = await prisma.userSession.findMany({
        where: {
          userId,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const knownIpAddresses = recentSessions.map(s => s.ipAddress);
      const isNewLocation = !knownIpAddresses.includes(ipAddress);

      if (isNewLocation && recentSessions.length > 0) {
        await this.handleSecurityEvent({
          type: SecurityEventType.UNUSUAL_LOCATION,
          userId,
          severity: 'medium',
          details: {
            newIpAddress: ipAddress,
            knownIpAddresses: knownIpAddresses.slice(0, 3), // Include only first 3 for privacy
          },
          ipAddress,
          userAgent,
        });
      }

      // Check for concurrent sessions
      const activeSessions = await prisma.userSession.count({
        where: {
          userId,
          isActive: true,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      if (activeSessions > this.MAX_CONCURRENT_SESSIONS) {
        await this.handleSecurityEvent({
          type: SecurityEventType.CONCURRENT_SESSIONS_LIMIT,
          userId,
          severity: 'medium',
          details: {
            activeSessionCount: activeSessions,
            maxAllowed: this.MAX_CONCURRENT_SESSIONS,
          },
          ipAddress,
          userAgent,
        });
      }
    } catch (error) {
      logger.error('Failed to detect suspicious login:', error);
    }
  }

  async detectBruteForceAttack(email: string, ipAddress: string): Promise<void> {
    try {
      const recentAttempts = await auditService.findMany({
        action: 'login',
        success: false,
        startDate: new Date(Date.now() - this.BRUTE_FORCE_WINDOW),
        ipAddress,
      });

      if (recentAttempts.length >= this.MAX_FAILED_LOGINS) {
        const user = await userService.findByEmail(email);
        if (user) {
          await this.handleSecurityEvent({
            type: SecurityEventType.BRUTE_FORCE_DETECTED,
            userId: user.id,
            severity: 'high',
            details: {
              attemptCount: recentAttempts.length,
              timeWindow: this.BRUTE_FORCE_WINDOW / 1000 / 60, // minutes
              targetEmail: email,
            },
            ipAddress,
            shouldInvalidateSessions: true,
            shouldLockAccount: true,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to detect brute force attack:', error);
    }
  }

  async handlePasswordChange(userId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.handleSecurityEvent({
      type: SecurityEventType.PASSWORD_CHANGED,
      userId,
      severity: 'medium',
      details: {
        reason: 'Password changed - invalidating all sessions for security',
      },
      ipAddress,
      userAgent,
      shouldInvalidateSessions: true,
      shouldNotifyUser: true,
    });
  }

  async handleEmailChange(userId: string, oldEmail: string, newEmail: string, ipAddress?: string): Promise<void> {
    await this.handleSecurityEvent({
      type: SecurityEventType.EMAIL_CHANGED,
      userId,
      severity: 'high',
      details: {
        oldEmail,
        newEmail,
        reason: 'Email changed - invalidating all sessions for security',
      },
      ipAddress,
      shouldInvalidateSessions: true,
      shouldNotifyUser: true,
    });
  }

  async handle2FADisabled(userId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.handleSecurityEvent({
      type: SecurityEventType.TWO_FA_DISABLED,
      userId,
      severity: 'high',
      details: {
        reason: 'Two-factor authentication disabled - security risk',
      },
      ipAddress,
      userAgent,
      shouldNotifyUser: true,
    });
  }

  async handleRoleChange(userId: string, oldRoles: string[], newRoles: string[], ipAddress?: string): Promise<void> {
    const addedRoles = newRoles.filter(role => !oldRoles.includes(role));
    const removedRoles = oldRoles.filter(role => !newRoles.includes(role));
    
    const isAdminRoleAdded = addedRoles.some(role => role.includes('admin'));
    const isAdminRoleRemoved = removedRoles.some(role => role.includes('admin'));

    if (isAdminRoleAdded) {
      await this.handleSecurityEvent({
        type: SecurityEventType.ADMIN_ROLE_ASSIGNED,
        userId,
        severity: 'critical',
        details: {
          addedRoles,
          oldRoles,
          newRoles,
        },
        ipAddress,
        shouldNotifyUser: true,
      });
    }

    if (isAdminRoleRemoved) {
      await this.handleSecurityEvent({
        type: SecurityEventType.ADMIN_ROLE_REMOVED,
        userId,
        severity: 'high',
        details: {
          removedRoles,
          oldRoles,
          newRoles,
        },
        ipAddress,
        shouldInvalidateSessions: true,
        shouldNotifyUser: true,
      });
    }
  }

  private shouldInvalidateSessionsForEvent(event: SecurityEvent): boolean {
    const highRiskEvents = [
      SecurityEventType.PASSWORD_CHANGED,
      SecurityEventType.EMAIL_CHANGED,
      SecurityEventType.BRUTE_FORCE_DETECTED,
      SecurityEventType.ADMIN_ROLE_REMOVED,
      SecurityEventType.ACCOUNT_LOCKED,
      SecurityEventType.API_KEY_COMPROMISED,
    ];

    return event.severity === 'critical' || highRiskEvents.includes(event.type);
  }

  private shouldLockAccountForEvent(event: SecurityEvent): boolean {
    const lockEvents = [
      SecurityEventType.BRUTE_FORCE_DETECTED,
      SecurityEventType.MULTIPLE_FAILED_LOGINS,
    ];

    return event.severity === 'critical' || lockEvents.includes(event.type);
  }

  private shouldNotifyUserForEvent(event: SecurityEvent): boolean {
    const notifyEvents = [
      SecurityEventType.PASSWORD_CHANGED,
      SecurityEventType.EMAIL_CHANGED,
      SecurityEventType.TWO_FA_DISABLED,
      SecurityEventType.UNUSUAL_LOCATION,
      SecurityEventType.ADMIN_ROLE_ASSIGNED,
      SecurityEventType.ADMIN_ROLE_REMOVED,
    ];

    return event.severity === 'high' || event.severity === 'critical' || notifyEvents.includes(event.type);
  }

  private async invalidateUserSessions(event: SecurityEvent): Promise<number> {
    try {
      // Get count of active sessions before invalidation
      const activeSessions = await prisma.userSession.count({
        where: {
          userId: event.userId,
          isActive: true,
        },
      });

      // Invalidate all user sessions
      await userService.revokeAllUserSessions(event.userId);

      // Revoke all JWT tokens for the user
      await jwtService.revokeAllUserTokens(event.userId);

      logger.info(`Invalidated ${activeSessions} sessions for user ${event.userId} due to security event: ${event.type}`);
      return activeSessions;
    } catch (error) {
      logger.error('Failed to invalidate user sessions:', error);
      return 0;
    }
  }

  private async lockUserAccount(userId: string, reason: SecurityEventType): Promise<void> {
    try {
      const lockDuration = this.getLockDuration(reason);
      const lockedUntil = new Date(Date.now() + lockDuration);

      await prisma.user.update({
        where: { id: userId },
        data: {
          lockedAt: new Date(),
          lockedUntil,
        },
      });

      logger.info(`Account locked for user ${userId} until ${lockedUntil} due to: ${reason}`);
    } catch (error) {
      logger.error('Failed to lock user account:', error);
    }
  }

  private async notifyUserOfSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      const user = await userService.findById(event.userId);
      if (!user) {
        logger.warn(`User not found for security notification: ${event.userId}`);
        return;
      }

      const eventDescription = this.getEventDescription(event.type);
      
      await emailService.sendSecurityAlertEmail(
        user.email,
        user.firstName,
        eventDescription,
        this.formatEventDetails(event)
      );

      logger.info(`Security notification sent to user ${event.userId} for event: ${event.type}`);
    } catch (error) {
      logger.error('Failed to notify user of security event:', error);
    }
  }

  private async handleSpecificEventType(event: SecurityEvent): Promise<void> {
    switch (event.type) {
      case SecurityEventType.CONCURRENT_SESSIONS_LIMIT:
        await this.handleConcurrentSessionsLimit(event);
        break;
      case SecurityEventType.UNUSUAL_LOCATION:
        await this.handleUnusualLocation(event);
        break;
      default:
        // No specific handling needed
        break;
    }
  }

  private async handleConcurrentSessionsLimit(event: SecurityEvent): Promise<void> {
    try {
      // Keep only the most recent sessions and terminate older ones
      const sessions = await prisma.userSession.findMany({
        where: {
          userId: event.userId,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (sessions.length > this.MAX_CONCURRENT_SESSIONS) {
        const _sessionsToKeep = sessions.slice(0, this.MAX_CONCURRENT_SESSIONS);
        const sessionsToRevoke = sessions.slice(this.MAX_CONCURRENT_SESSIONS);

        for (const session of sessionsToRevoke) {
          await userService.revokeUserSession(event.userId, session.sessionToken);
        }

        logger.info(`Revoked ${sessionsToRevoke.length} excess sessions for user ${event.userId}`);
      }
    } catch (error) {
      logger.error('Failed to handle concurrent sessions limit:', error);
    }
  }

  private async handleUnusualLocation(event: SecurityEvent): Promise<void> {
    // In production, this could integrate with geolocation services
    // and implement more sophisticated location-based security policies
    logger.info(`Unusual location detected for user ${event.userId} from IP ${event.ipAddress}`);
  }

  private getLockDuration(reason: SecurityEventType): number {
    const durations: Partial<Record<SecurityEventType, number>> = {
      [SecurityEventType.BRUTE_FORCE_DETECTED]: 60 * 60 * 1000, // 1 hour
      [SecurityEventType.MULTIPLE_FAILED_LOGINS]: 30 * 60 * 1000, // 30 minutes
      [SecurityEventType.SUSPICIOUS_ACTIVITY]: 2 * 60 * 60 * 1000, // 2 hours
      [SecurityEventType.SUSPICIOUS_LOGIN]: 60 * 60 * 1000, // 1 hour
    };

    return durations[reason] || 60 * 60 * 1000; // Default 1 hour
  }

  private getEventDescription(type: SecurityEventType): string {
    const descriptions = {
      [SecurityEventType.SUSPICIOUS_LOGIN]: 'Suspicious Login Detected',
      [SecurityEventType.MULTIPLE_FAILED_LOGINS]: 'Multiple Failed Login Attempts',
      [SecurityEventType.PASSWORD_CHANGED]: 'Password Changed',
      [SecurityEventType.EMAIL_CHANGED]: 'Email Address Changed',
      [SecurityEventType.TWO_FA_DISABLED]: 'Two-Factor Authentication Disabled',
      [SecurityEventType.ACCOUNT_LOCKED]: 'Account Locked',
      [SecurityEventType.ADMIN_ROLE_ASSIGNED]: 'Administrator Role Assigned',
      [SecurityEventType.ADMIN_ROLE_REMOVED]: 'Administrator Role Removed',
      [SecurityEventType.UNUSUAL_LOCATION]: 'Login from Unusual Location',
      [SecurityEventType.CONCURRENT_SESSIONS_LIMIT]: 'Too Many Active Sessions',
      [SecurityEventType.BRUTE_FORCE_DETECTED]: 'Brute Force Attack Detected',
      [SecurityEventType.SUSPICIOUS_ACTIVITY]: 'Suspicious Activity Detected',
      [SecurityEventType.API_KEY_COMPROMISED]: 'API Key Compromised',
      [SecurityEventType.PERMISSION_ESCALATION]: 'Permission Escalation Detected',
    };

    return descriptions[type] || 'Security Event Detected';
  }

  private formatEventDetails(event: SecurityEvent): string {
    const details = [];
    
    if (event.ipAddress) {
      details.push(`IP Address: ${event.ipAddress}`);
    }
    
    if (event.details.newIpAddress) {
      details.push(`New Location: ${event.details.newIpAddress}`);
    }
    
    if (event.details.attemptCount) {
      details.push(`Failed Attempts: ${event.details.attemptCount}`);
    }
    
    details.push(`Severity: ${event.severity.toUpperCase()}`);
    details.push(`Time: ${new Date().toISOString()}`);
    
    return details.join('\n');
  }
}

export const securityEventService = new SecurityEventService();