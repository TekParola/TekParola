import { sessionService } from '../../src/services/sessionService';
import { prisma } from '../../src/config/database';
import { redisClient } from '../../src/config/redis';
import { ValidationError } from '../../src/utils/errors';

// Mock dependencies
jest.mock('../../src/config/database');
jest.mock('../../src/config/redis');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockRedis = redisClient as jest.Mocked<typeof redisClient>;

describe('SessionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    const sessionData = {
      userId: 'user-123',
      ipAddress: '127.0.0.1',
      userAgent: 'Test Browser',
      remember: false,
    };

    it('should create session successfully', async () => {
      const mockSession = {
        id: 'session-123',
        userId: sessionData.userId,
        applicationId: null,
        sessionToken: 'generated-session-token',
        refreshToken: 'generated-refresh-token',
        ipAddress: sessionData.ipAddress,
        userAgent: sessionData.userAgent,
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastActivityAt: new Date(),
        country: null,
        city: null,
        device: null,
        browser: null,
        os: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.userSession.create.mockResolvedValue(mockSession as any);
      mockRedis.setEx.mockResolvedValue('OK');

      const result = await sessionService.createSession(sessionData);

      expect(result).toEqual(mockSession);
      expect(mockPrisma.userSession.create).toHaveBeenCalledWith({
        data: {
          userId: sessionData.userId,
          applicationId: undefined,
          sessionToken: expect.any(String),
          refreshToken: expect.any(String),
          ipAddress: sessionData.ipAddress,
          userAgent: sessionData.userAgent,
          expiresAt: expect.any(Date),
          country: undefined,
          city: undefined,
          device: undefined,
          browser: undefined,
          os: undefined,
        },
      });
      expect(mockRedis.setEx).toHaveBeenCalled();
    });

    it('should create extended session when remember is true', async () => {
      const rememberSessionData = { ...sessionData, remember: true };
      const mockSession = {
        id: 'session-123',
        userId: sessionData.userId,
        applicationId: null,
        sessionToken: 'generated-session-token',
        refreshToken: 'generated-refresh-token',
        ipAddress: sessionData.ipAddress,
        userAgent: sessionData.userAgent,
        isActive: true,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        lastActivityAt: new Date(),
        country: null,
        city: null,
        device: null,
        browser: null,
        os: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.userSession.create.mockResolvedValue(mockSession as any);
      mockRedis.setEx.mockResolvedValue('OK');

      const result = await sessionService.createSession(rememberSessionData);

      expect(result).toEqual(mockSession);
      // Expect longer expiration time for remember sessions
      const createCall = mockPrisma.userSession.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt as Date;
      const expectedMinTime = Date.now() + 25 * 24 * 60 * 60 * 1000; // At least 25 days
      expect(expiresAt.getTime()).toBeGreaterThan(expectedMinTime);
    });

    it('should handle database error', async () => {
      mockPrisma.userSession.create.mockRejectedValue(new Error('Database error'));

      await expect(sessionService.createSession(sessionData)).rejects.toThrow(ValidationError);
    });
  });

  describe('getSession', () => {
    it('should get session from cache first', async () => {
      const sessionToken = 'valid-session-token';
      const cachedData = JSON.stringify({
        id: 'session-123',
        userId: 'user-123',
        applicationId: null,
        isActive: true,
      });

      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        sessionToken,
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      mockRedis.get.mockResolvedValue(cachedData);
      mockPrisma.userSession.findUnique.mockResolvedValue(mockSession as any);

      const result = await sessionService.getSession(sessionToken);

      expect(result).toEqual(mockSession);
      expect(mockRedis.get).toHaveBeenCalledWith(`session:${sessionToken}`);
      expect(mockPrisma.userSession.findUnique).toHaveBeenCalledWith({
        where: {
          sessionToken,
          isActive: true,
          expiresAt: {
            gt: expect.any(Date),
          },
        },
      });
    });

    it('should return null for expired session', async () => {
      const sessionToken = 'expired-session-token';
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.userSession.findUnique.mockResolvedValue(null);

      const result = await sessionService.getSession(sessionToken);

      expect(result).toBeNull();
    });

    it('should handle cache miss and get from database', async () => {
      const sessionToken = 'valid-session-token';
      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        sessionToken,
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      mockRedis.get.mockResolvedValue(null);
      mockPrisma.userSession.findUnique.mockResolvedValue(mockSession as any);

      const result = await sessionService.getSession(sessionToken);

      expect(result).toEqual(mockSession);
    });
  });

  describe('updateSessionActivity', () => {
    it('should update session activity successfully', async () => {
      const sessionToken = 'valid-session-token';
      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        sessionToken,
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastActivityAt: new Date(),
      };

      const updatedSession = {
        ...mockSession,
        lastActivityAt: new Date(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify({
        id: mockSession.id,
        userId: mockSession.userId,
        applicationId: null,
        isActive: true,
      }));
      mockPrisma.userSession.findUnique.mockResolvedValue(mockSession as any);
      mockPrisma.userSession.update.mockResolvedValue(updatedSession as any);
      mockRedis.setEx.mockResolvedValue('OK');

      const result = await sessionService.updateSessionActivity(sessionToken);

      expect(result).toEqual(updatedSession);
      expect(mockPrisma.userSession.update).toHaveBeenCalledWith({
        where: { id: mockSession.id },
        data: {
          lastActivityAt: expect.any(Date),
        },
      });
    });

    it('should return null for non-existent session', async () => {
      const sessionToken = 'invalid-session-token';
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.userSession.findUnique.mockResolvedValue(null);

      const result = await sessionService.updateSessionActivity(sessionToken);

      expect(result).toBeNull();
    });
  });

  describe('invalidateSession', () => {
    it('should invalidate session successfully', async () => {
      const sessionToken = 'valid-session-token';
      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        sessionToken,
        isActive: true,
      };

      mockPrisma.userSession.findUnique.mockResolvedValue(mockSession as any);
      mockPrisma.userSession.update.mockResolvedValue({
        ...mockSession,
        isActive: false,
      } as any);
      mockRedis.del.mockResolvedValue(1);

      const result = await sessionService.invalidateSession(sessionToken);

      expect(result).toBe(true);
      expect(mockPrisma.userSession.update).toHaveBeenCalledWith({
        where: { id: mockSession.id },
        data: { isActive: false },
      });
      expect(mockRedis.del).toHaveBeenCalledWith(`session:${sessionToken}`);
    });

    it('should return false for non-existent session', async () => {
      const sessionToken = 'invalid-session-token';
      mockPrisma.userSession.findUnique.mockResolvedValue(null);

      const result = await sessionService.invalidateSession(sessionToken);

      expect(result).toBe(false);
    });
  });

  describe('invalidateUserSessions', () => {
    it('should invalidate all user sessions', async () => {
      const userId = 'user-123';
      const mockSessions = [
        { sessionToken: 'session-1' },
        { sessionToken: 'session-2' },
      ];

      mockPrisma.userSession.findMany.mockResolvedValue(mockSessions as any);
      mockPrisma.userSession.updateMany.mockResolvedValue({ count: 2 });
      mockRedis.del.mockResolvedValue(2);

      const result = await sessionService.invalidateUserSessions(userId);

      expect(result).toBe(2);
      expect(mockPrisma.userSession.findMany).toHaveBeenCalledWith({
        where: { userId, isActive: true },
        select: { sessionToken: true },
      });
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId, isActive: true },
        data: { isActive: false },
      });
    });

    it('should invalidate user sessions excluding specific session', async () => {
      const userId = 'user-123';
      const excludeSessionId = 'session-to-keep';
      const mockSessions = [
        { sessionToken: 'session-1' },
        { sessionToken: 'session-2' },
      ];

      mockPrisma.userSession.findMany.mockResolvedValue(mockSessions as any);
      mockPrisma.userSession.updateMany.mockResolvedValue({ count: 2 });
      mockRedis.del.mockResolvedValue(2);

      const result = await sessionService.invalidateUserSessions(userId, excludeSessionId);

      expect(result).toBe(2);
      expect(mockPrisma.userSession.findMany).toHaveBeenCalledWith({
        where: { userId, isActive: true, id: { not: excludeSessionId } },
        select: { sessionToken: true },
      });
    });
  });

  describe('getUserSessions', () => {
    it('should get active user sessions', async () => {
      const userId = 'user-123';
      const mockSessions = [
        {
          id: 'session-1',
          userId,
          ipAddress: '127.0.0.1',
          userAgent: 'Browser 1',
          isActive: true,
          createdAt: new Date(),
          lastActivityAt: new Date(),
        },
        {
          id: 'session-2',
          userId,
          ipAddress: '192.168.1.1',
          userAgent: 'Browser 2',
          isActive: true,
          createdAt: new Date(),
          lastActivityAt: new Date(),
        },
      ];

      mockPrisma.userSession.findMany.mockResolvedValue(mockSessions as any);

      const result = await sessionService.getUserSessions(userId);

      expect(result).toEqual(mockSessions);
      expect(mockPrisma.userSession.findMany).toHaveBeenCalledWith({
        where: { userId, isActive: true, expiresAt: { gt: expect.any(Date) } },
        orderBy: { lastActivityAt: 'desc' },
      });
    });

    it('should get all user sessions when activeOnly is false', async () => {
      const userId = 'user-123';
      const mockSessions = [
        { id: 'session-1', userId, isActive: true },
        { id: 'session-2', userId, isActive: false },
      ];

      mockPrisma.userSession.findMany.mockResolvedValue(mockSessions as any);

      const result = await sessionService.getUserSessions(userId, false);

      expect(result).toEqual(mockSessions);
      expect(mockPrisma.userSession.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { lastActivityAt: 'desc' },
      });
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should cleanup expired sessions', async () => {
      const expiredSessions = [
        { sessionToken: 'session-1' },
        { sessionToken: 'session-2' },
      ];

      mockPrisma.userSession.findMany.mockResolvedValue(expiredSessions as any);
      mockPrisma.userSession.deleteMany.mockResolvedValue({ count: 2 });
      mockRedis.del.mockResolvedValue(2);

      const result = await sessionService.cleanupExpiredSessions();

      expect(result).toBe(2);
      expect(mockPrisma.userSession.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { expiresAt: { lt: expect.any(Date) } },
            { isActive: false },
          ],
        },
        select: { sessionToken: true },
      });
      expect(mockPrisma.userSession.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { expiresAt: { lt: expect.any(Date) } },
            { isActive: false },
          ],
        },
      });
    });

    it('should handle no expired sessions', async () => {
      mockPrisma.userSession.findMany.mockResolvedValue([]);

      const result = await sessionService.cleanupExpiredSessions();

      expect(result).toBe(0);
      expect(mockPrisma.userSession.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('getSessionStats', () => {
    it('should get session statistics', async () => {
      const mockUniqueUsers = [
        { userId: 'user-1' },
        { userId: 'user-2' },
        { userId: 'user-3' },
      ];

      mockPrisma.userSession.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(80) // active
        .mockResolvedValueOnce(20); // expired

      mockPrisma.userSession.findMany.mockResolvedValue(mockUniqueUsers as any);

      const result = await sessionService.getSessionStats();

      expect(result).toEqual({
        total: 100,
        active: 80,
        expired: 20,
        uniqueUsers: 3,
      });
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.userSession.count.mockRejectedValue(new Error('Database error'));

      const result = await sessionService.getSessionStats();

      expect(result).toEqual({
        total: 0,
        active: 0,
        expired: 0,
        uniqueUsers: 0,
      });
    });
  });
});