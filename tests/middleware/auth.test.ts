import { Request, Response, NextFunction } from 'express';
import { authenticateToken, authenticateApiKey } from '../../src/middleware/auth';
import { jwtService } from '../../src/utils/jwt';
import { sessionService } from '../../src/services/sessionService';
import { prisma } from '../../src/config/database';

// Mock dependencies
jest.mock('../../src/utils/jwt');
jest.mock('../../src/services/sessionService');
jest.mock('../../src/config/database');

const mockJwtService = jwtService as jest.Mocked<typeof jwtService>;
const mockSessionService = sessionService as jest.Mocked<typeof sessionService>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Auth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      user: undefined,
      session: undefined,
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticateToken', () => {
    it('should authenticate valid token', async () => {
      const token = 'valid-jwt-token';
      const sessionToken = 'session-token';
      const mockTokenPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        sessionId: 'session-123',
        type: 'access' as const,
      };
      
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
      };

      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        sessionToken,
        isActive: true,
        expiresAt: new Date(Date.now() + 3600000),
      };

      mockReq.headers = { authorization: `Bearer ${token}` };
      mockReq.cookies = { sessionToken };

      mockJwtService.extractTokenFromHeader.mockReturnValue(token);
      mockJwtService.verifyAccessToken.mockReturnValue(mockTokenPayload);
      mockJwtService.isTokenBlacklisted.mockResolvedValue(false);
      mockJwtService.areUserTokensRevoked.mockResolvedValue(false);
      
      mockSessionService.getSession.mockResolvedValue(mockSession as any);
      mockSessionService.updateSessionActivity.mockResolvedValue(mockSession as any);
      
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.user).toEqual(mockUser);
      expect(mockReq.session).toEqual(mockSession);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject request without authorization header', async () => {
      mockReq.headers = {};

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'MISSING_TOKEN',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      const invalidToken = 'invalid-token';
      mockReq.headers = { authorization: `Bearer ${invalidToken}` };

      mockJwtService.extractTokenFromHeader.mockReturnValue(invalidToken);
      mockJwtService.verifyAccessToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject blacklisted token', async () => {
      const token = 'blacklisted-token';
      const mockTokenPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        sessionId: 'session-123',
        type: 'access' as const,
      };

      mockReq.headers = { authorization: `Bearer ${token}` };

      mockJwtService.extractTokenFromHeader.mockReturnValue(token);
      mockJwtService.verifyAccessToken.mockReturnValue(mockTokenPayload);
      mockJwtService.isTokenBlacklisted.mockResolvedValue(true);

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Token has been revoked',
        code: 'TOKEN_REVOKED',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject revoked user tokens', async () => {
      const token = 'valid-token';
      const mockTokenPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        sessionId: 'session-123',
        type: 'access' as const,
      };

      mockReq.headers = { authorization: `Bearer ${token}` };

      mockJwtService.extractTokenFromHeader.mockReturnValue(token);
      mockJwtService.verifyAccessToken.mockReturnValue(mockTokenPayload);
      mockJwtService.isTokenBlacklisted.mockResolvedValue(false);
      mockJwtService.areUserTokensRevoked.mockResolvedValue(true);

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'User tokens have been revoked',
        code: 'USER_TOKENS_REVOKED',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject inactive session', async () => {
      const token = 'valid-token';
      const sessionToken = 'session-token';
      const mockTokenPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        sessionId: 'session-123',
        type: 'access' as const,
      };

      mockReq.headers = { authorization: `Bearer ${token}` };
      mockReq.cookies = { sessionToken };

      mockJwtService.extractTokenFromHeader.mockReturnValue(token);
      mockJwtService.verifyAccessToken.mockReturnValue(mockTokenPayload);
      mockJwtService.isTokenBlacklisted.mockResolvedValue(false);
      mockJwtService.areUserTokensRevoked.mockResolvedValue(false);
      
      mockSessionService.getSession.mockResolvedValue(null);

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid or expired session',
        code: 'INVALID_SESSION',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject inactive user', async () => {
      const token = 'valid-token';
      const sessionToken = 'session-token';
      const mockTokenPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        sessionId: 'session-123',
        type: 'access' as const,
      };
      
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        isActive: false,
      };

      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        sessionToken,
        isActive: true,
        expiresAt: new Date(Date.now() + 3600000),
      };

      mockReq.headers = { authorization: `Bearer ${token}` };
      mockReq.cookies = { sessionToken };

      mockJwtService.extractTokenFromHeader.mockReturnValue(token);
      mockJwtService.verifyAccessToken.mockReturnValue(mockTokenPayload);
      mockJwtService.isTokenBlacklisted.mockResolvedValue(false);
      mockJwtService.areUserTokensRevoked.mockResolvedValue(false);
      
      mockSessionService.getSession.mockResolvedValue(mockSession as any);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'User account is deactivated',
        code: 'USER_DEACTIVATED',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const token = 'valid-token';
      const sessionToken = 'session-token';
      const mockTokenPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        sessionId: 'session-123',
        type: 'access' as const,
      };

      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        sessionToken,
        isActive: true,
        expiresAt: new Date(Date.now() + 3600000),
      };

      mockReq.headers = { authorization: `Bearer ${token}` };
      mockReq.cookies = { sessionToken };

      mockJwtService.extractTokenFromHeader.mockReturnValue(token);
      mockJwtService.verifyAccessToken.mockReturnValue(mockTokenPayload);
      mockJwtService.isTokenBlacklisted.mockResolvedValue(false);
      mockJwtService.areUserTokensRevoked.mockResolvedValue(false);
      
      mockSessionService.getSession.mockResolvedValue(mockSession as any);
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Authentication service unavailable',
        code: 'AUTH_SERVICE_ERROR',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('authenticateApiKey', () => {
    it('should authenticate valid API key', async () => {
      const apiKey = 'valid-api-key';
      const mockApiKeyRecord = {
        id: 'api-key-123',
        key: apiKey,
        applicationId: 'app-123',
        isActive: true,
        expiresAt: null,
        application: {
          id: 'app-123',
          name: 'test-app',
          isActive: true,
        },
      };

      mockReq.headers = { 'x-api-key': apiKey };

      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKeyRecord as any);

      await authenticateApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.apiKey).toEqual(mockApiKeyRecord);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject request without API key', async () => {
      mockReq.headers = {};

      await authenticateApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'API key required',
        code: 'MISSING_API_KEY',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid API key', async () => {
      const invalidApiKey = 'invalid-api-key';
      mockReq.headers = { 'x-api-key': invalidApiKey };

      mockPrisma.apiKey.findUnique.mockResolvedValue(null);

      await authenticateApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid API key',
        code: 'INVALID_API_KEY',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject expired API key', async () => {
      const apiKey = 'expired-api-key';
      const mockApiKeyRecord = {
        id: 'api-key-123',
        key: apiKey,
        applicationId: 'app-123',
        isActive: true,
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        application: {
          id: 'app-123',
          name: 'test-app',
          isActive: true,
        },
      };

      mockReq.headers = { 'x-api-key': apiKey };

      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKeyRecord as any);

      await authenticateApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'API key has expired',
        code: 'API_KEY_EXPIRED',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject inactive API key', async () => {
      const apiKey = 'inactive-api-key';
      const mockApiKeyRecord = {
        id: 'api-key-123',
        key: apiKey,
        applicationId: 'app-123',
        isActive: false,
        expiresAt: null,
        application: {
          id: 'app-123',
          name: 'test-app',
          isActive: true,
        },
      };

      mockReq.headers = { 'x-api-key': apiKey };

      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKeyRecord as any);

      await authenticateApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'API key is inactive',
        code: 'API_KEY_INACTIVE',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject API key for inactive application', async () => {
      const apiKey = 'valid-api-key';
      const mockApiKeyRecord = {
        id: 'api-key-123',
        key: apiKey,
        applicationId: 'app-123',
        isActive: true,
        expiresAt: null,
        application: {
          id: 'app-123',
          name: 'test-app',
          isActive: false,
        },
      };

      mockReq.headers = { 'x-api-key': apiKey };

      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKeyRecord as any);

      await authenticateApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Application is inactive',
        code: 'APPLICATION_INACTIVE',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});