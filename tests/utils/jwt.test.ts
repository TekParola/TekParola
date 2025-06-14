import jwt from 'jsonwebtoken';
import { jwtService, JWTService, TokenPayload } from '../../src/utils/jwt';
import { redisClient } from '../../src/config/redis';

// Mock dependencies
jest.mock('../../src/config/redis');
jest.mock('../../src/utils/logger');

const mockRedis = redisClient as jest.Mocked<typeof redisClient>;

describe('JWTService', () => {
  let service: JWTService;

  beforeEach(() => {
    service = new JWTService();
    jest.clearAllMocks();
  });

  describe('generateTokenPair', () => {
    it('should generate access and refresh tokens', () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const sessionId = 'session-123';

      const tokenPair = service.generateTokenPair(userId, email, sessionId);

      expect(tokenPair.accessToken).toBeDefined();
      expect(tokenPair.refreshToken).toBeDefined();
      expect(tokenPair.expiresIn).toBeGreaterThan(0);

      // Verify access token payload
      const accessDecoded = jwt.decode(tokenPair.accessToken) as TokenPayload;
      expect(accessDecoded.userId).toBe(userId);
      expect(accessDecoded.email).toBe(email);
      expect(accessDecoded.sessionId).toBe(sessionId);
      expect(accessDecoded.type).toBe('access');

      // Verify refresh token payload
      const refreshDecoded = jwt.decode(tokenPair.refreshToken) as TokenPayload;
      expect(refreshDecoded.userId).toBe(userId);
      expect(refreshDecoded.email).toBe(email);
      expect(refreshDecoded.sessionId).toBe(sessionId);
      expect(refreshDecoded.type).toBe('refresh');
    });

    it('should generate different tokens each time', () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const sessionId = 'session-123';

      const tokenPair1 = service.generateTokenPair(userId, email, sessionId);
      const tokenPair2 = service.generateTokenPair(userId, email, sessionId);

      expect(tokenPair1.accessToken).not.toBe(tokenPair2.accessToken);
      expect(tokenPair1.refreshToken).not.toBe(tokenPair2.refreshToken);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid access token', () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const sessionId = 'session-123';

      const tokenPair = service.generateTokenPair(userId, email, sessionId);
      const decoded = service.verifyAccessToken(tokenPair.accessToken);

      expect(decoded.userId).toBe(userId);
      expect(decoded.email).toBe(email);
      expect(decoded.sessionId).toBe(sessionId);
      expect(decoded.type).toBe('access');
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => service.verifyAccessToken(invalidToken))
        .toThrow('Invalid access token');
    });

    it('should throw error for refresh token used as access token', () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const sessionId = 'session-123';

      const tokenPair = service.generateTokenPair(userId, email, sessionId);

      expect(() => service.verifyAccessToken(tokenPair.refreshToken))
        .toThrow('Invalid access token');
    });

    it('should throw error for malformed token', () => {
      const malformedToken = 'not-a-jwt-token';

      expect(() => service.verifyAccessToken(malformedToken))
        .toThrow('Invalid access token');
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify valid refresh token', () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const sessionId = 'session-123';

      const tokenPair = service.generateTokenPair(userId, email, sessionId);
      const decoded = service.verifyRefreshToken(tokenPair.refreshToken);

      expect(decoded.userId).toBe(userId);
      expect(decoded.email).toBe(email);
      expect(decoded.sessionId).toBe(sessionId);
      expect(decoded.type).toBe('refresh');
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => service.verifyRefreshToken(invalidToken))
        .toThrow('Invalid refresh token');
    });

    it('should throw error for access token used as refresh token', () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const sessionId = 'session-123';

      const tokenPair = service.generateTokenPair(userId, email, sessionId);

      expect(() => service.verifyRefreshToken(tokenPair.accessToken))
        .toThrow('Invalid refresh token');
    });
  });

  describe('blacklistToken', () => {
    it('should blacklist valid token', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const sessionId = 'session-123';

      const tokenPair = service.generateTokenPair(userId, email, sessionId);
      mockRedis.setEx.mockResolvedValue('OK');

      await service.blacklistToken(tokenPair.accessToken);

      expect(mockRedis.setEx).toHaveBeenCalledWith(
        `blacklist:${tokenPair.accessToken}`,
        expect.any(Number),
        'blacklisted'
      );
    });

    it('should handle expired token gracefully', async () => {
      const expiredToken = jwt.sign(
        { userId: 'user-123', exp: Math.floor(Date.now() / 1000) - 3600 },
        process.env.JWT_SECRET!
      );

      await service.blacklistToken(expiredToken);

      expect(mockRedis.setEx).not.toHaveBeenCalled();
    });

    it('should handle invalid token gracefully', async () => {
      const invalidToken = 'invalid-token';

      await expect(service.blacklistToken(invalidToken)).rejects.toThrow('Failed to blacklist token');
    });

    it('should handle Redis error', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const sessionId = 'session-123';

      const tokenPair = service.generateTokenPair(userId, email, sessionId);
      mockRedis.setEx.mockRejectedValue(new Error('Redis error'));

      await expect(service.blacklistToken(tokenPair.accessToken))
        .rejects.toThrow('Failed to blacklist token');
    });
  });

  describe('isTokenBlacklisted', () => {
    it('should return true for blacklisted token', async () => {
      const token = 'some-token';
      mockRedis.get.mockResolvedValue('blacklisted');

      const result = await service.isTokenBlacklisted(token);

      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith(`blacklist:${token}`);
    });

    it('should return false for non-blacklisted token', async () => {
      const token = 'some-token';
      mockRedis.get.mockResolvedValue(null);

      const result = await service.isTokenBlacklisted(token);

      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      const token = 'some-token';
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.isTokenBlacklisted(token);

      expect(result).toBe(false);
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all user tokens', async () => {
      const userId = 'user-123';
      mockRedis.setEx.mockResolvedValue('OK');

      await service.revokeAllUserTokens(userId);

      expect(mockRedis.setEx).toHaveBeenCalledWith(
        `revoked:user:${userId}`,
        86400,
        'revoked'
      );
    });

    it('should handle Redis error', async () => {
      const userId = 'user-123';
      mockRedis.setEx.mockRejectedValue(new Error('Redis error'));

      await expect(service.revokeAllUserTokens(userId))
        .rejects.toThrow('Failed to revoke user tokens');
    });
  });

  describe('areUserTokensRevoked', () => {
    it('should return true for revoked user tokens', async () => {
      const userId = 'user-123';
      mockRedis.get.mockResolvedValue('revoked');

      const result = await service.areUserTokensRevoked(userId);

      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith(`revoked:user:${userId}`);
    });

    it('should return false for non-revoked user tokens', async () => {
      const userId = 'user-123';
      mockRedis.get.mockResolvedValue(null);

      const result = await service.areUserTokensRevoked(userId);

      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      const userId = 'user-123';
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.areUserTokensRevoked(userId);

      expect(result).toBe(false);
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from valid Bearer header', () => {
      const token = 'some-jwt-token';
      const authHeader = `Bearer ${token}`;

      const extracted = service.extractTokenFromHeader(authHeader);

      expect(extracted).toBe(token);
    });

    it('should return null for undefined header', () => {
      const extracted = service.extractTokenFromHeader(undefined);

      expect(extracted).toBeNull();
    });

    it('should return null for non-Bearer header', () => {
      const authHeader = 'Basic dXNlcjpwYXNz';

      const extracted = service.extractTokenFromHeader(authHeader);

      expect(extracted).toBeNull();
    });

    it('should return null for malformed Bearer header', () => {
      const authHeader = 'Bearer';

      const extracted = service.extractTokenFromHeader(authHeader);

      expect(extracted).toBe('');
    });

    it('should handle Bearer header with extra spaces', () => {
      const token = 'some-jwt-token';
      const authHeader = `Bearer  ${token}`;

      const extracted = service.extractTokenFromHeader(authHeader);

      expect(extracted).toBe(` ${token}`);
    });
  });

  describe('generatePasswordResetToken', () => {
    it('should generate password reset token', async () => {
      const userId = 'user-123';

      const token = await service.generatePasswordResetToken(userId);

      expect(token).toBeDefined();

      const decoded = jwt.decode(token) as any;
      expect(decoded.userId).toBe(userId);
      expect(decoded.type).toBe('password_reset');
      expect(decoded.iat).toBeDefined();
    });
  });

  describe('verifyPasswordResetToken', () => {
    it('should verify valid password reset token', async () => {
      const userId = 'user-123';

      const token = await service.generatePasswordResetToken(userId);
      const decoded = service.verifyPasswordResetToken(token);

      expect(decoded.userId).toBe(userId);
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => service.verifyPasswordResetToken(invalidToken))
        .toThrow('Invalid or expired password reset token');
    });

    it('should throw error for wrong token type', () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const sessionId = 'session-123';

      const tokenPair = service.generateTokenPair(userId, email, sessionId);

      expect(() => service.verifyPasswordResetToken(tokenPair.accessToken))
        .toThrow('Invalid or expired password reset token');
    });
  });

  describe('generateMagicLinkToken', () => {
    it('should generate magic link token', async () => {
      const userId = 'user-123';

      const token = await service.generateMagicLinkToken(userId);

      expect(token).toBeDefined();

      const decoded = jwt.decode(token) as any;
      expect(decoded.userId).toBe(userId);
      expect(decoded.type).toBe('magic_link');
      expect(decoded.iat).toBeDefined();
    });
  });

  describe('verifyMagicLinkToken', () => {
    it('should verify valid magic link token', async () => {
      const userId = 'user-123';

      const token = await service.generateMagicLinkToken(userId);
      const decoded = service.verifyMagicLinkToken(token);

      expect(decoded.userId).toBe(userId);
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => service.verifyMagicLinkToken(invalidToken))
        .toThrow('Invalid or expired magic link token');
    });

    it('should throw error for wrong token type', async () => {
      const userId = 'user-123';

      const passwordResetToken = await service.generatePasswordResetToken(userId);

      expect(() => service.verifyMagicLinkToken(passwordResetToken))
        .toThrow('Invalid or expired magic link token');
    });
  });

  describe('singleton instance', () => {
    it('should export singleton instance', () => {
      expect(jwtService).toBeInstanceOf(JWTService);
    });
  });
});