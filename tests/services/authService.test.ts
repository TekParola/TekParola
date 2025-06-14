import { authService } from '../../src/services/authService';
import { userService } from '../../src/services/userService';
import { sessionService } from '../../src/services/sessionService';
import { cacheService } from '../../src/services/cacheService';
import { AuthenticationError, ValidationError } from '../../src/utils/errors';
import * as bcrypt from 'bcrypt';

// Mock dependencies
jest.mock('../../src/services/userService');
jest.mock('../../src/services/sessionService');
jest.mock('../../src/services/cacheService');
jest.mock('bcrypt');

const mockUserService = userService as jest.Mocked<typeof userService>;
const mockSessionService = sessionService as jest.Mocked<typeof sessionService>;
const mockCacheService = cacheService as jest.Mocked<typeof cacheService>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'TestPass123!',
      ipAddress: '127.0.0.1',
      userAgent: 'Test Browser',
    };

    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      password: 'hashed-password',
      isActive: true,
      isEmailVerified: true,
      roles: [
        {
          role: {
            id: 'role-123',
            name: 'user',
            permissions: [
              { permission: { name: 'read:profile' } },
            ],
          },
        },
      ],
      loginAttempts: 0,
      lockedUntil: null,
    };

    it('should login successfully with valid credentials', async () => {
      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };

      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      mockUserService.findByEmailWithAuth.mockResolvedValue(mockUser as any);
      mockBcrypt.compare.mockResolvedValue(true as never);
      mockSessionService.createSession.mockResolvedValue(mockSession as any);
      mockSessionService.generateTokens.mockResolvedValue(mockTokens);
      mockUserService.updateLastLogin.mockResolvedValue(undefined);
      mockUserService.resetLoginAttempts.mockResolvedValue(undefined);

      const result = await authService.login(loginData);

      expect(result.user).toEqual(expect.objectContaining({
        id: mockUser.id,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
      }));
      expect(result.tokens).toEqual(mockTokens);
      expect(result.sessionId).toBe(mockSession.id);
      expect(mockUserService.findByEmailWithAuth).toHaveBeenCalledWith(loginData.email);
      expect(mockBcrypt.compare).toHaveBeenCalledWith(loginData.password, mockUser.password);
      expect(mockSessionService.createSession).toHaveBeenCalled();
      expect(mockUserService.updateLastLogin).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw AuthenticationError for non-existent user', async () => {
      mockUserService.findByEmailWithAuth.mockResolvedValue(null);

      await expect(authService.login(loginData)).rejects.toThrow(AuthenticationError);
      expect(mockUserService.findByEmailWithAuth).toHaveBeenCalledWith(loginData.email);
      expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });

    it('should throw AuthenticationError for invalid password', async () => {
      mockUserService.findByEmailWithAuth.mockResolvedValue(mockUser as any);
      mockBcrypt.compare.mockResolvedValue(false as never);
      mockUserService.incrementLoginAttempts.mockResolvedValue(undefined);

      await expect(authService.login(loginData)).rejects.toThrow(AuthenticationError);
      expect(mockBcrypt.compare).toHaveBeenCalledWith(loginData.password, mockUser.password);
      expect(mockUserService.incrementLoginAttempts).toHaveBeenCalledWith(mockUser.id);
      expect(mockSessionService.createSession).not.toHaveBeenCalled();
    });

    it('should throw AuthenticationError for inactive user', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      mockUserService.findByEmailWithAuth.mockResolvedValue(inactiveUser as any);

      await expect(authService.login(loginData)).rejects.toThrow(AuthenticationError);
      expect(mockUserService.findByEmailWithAuth).toHaveBeenCalledWith(loginData.email);
      expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });

    it('should throw AuthenticationError for locked user account', async () => {
      const lockedUser = {
        ...mockUser,
        lockedUntil: new Date(Date.now() + 60 * 60 * 1000), // Locked for 1 hour
      };
      mockUserService.findByEmailWithAuth.mockResolvedValue(lockedUser as any);

      await expect(authService.login(loginData)).rejects.toThrow(AuthenticationError);
      expect(mockUserService.findByEmailWithAuth).toHaveBeenCalledWith(loginData.email);
      expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });

    it('should handle user with expired lock', async () => {
      const expiredLockUser = {
        ...mockUser,
        lockedUntil: new Date(Date.now() - 60 * 60 * 1000), // Lock expired 1 hour ago
        loginAttempts: 5,
      };
      
      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };

      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      mockUserService.findByEmailWithAuth.mockResolvedValue(expiredLockUser as any);
      mockBcrypt.compare.mockResolvedValue(true as never);
      mockSessionService.createSession.mockResolvedValue(mockSession as any);
      mockSessionService.generateTokens.mockResolvedValue(mockTokens);
      mockUserService.updateLastLogin.mockResolvedValue(undefined);
      mockUserService.resetLoginAttempts.mockResolvedValue(undefined);

      const result = await authService.login(loginData);

      expect(result.tokens).toEqual(mockTokens);
      expect(mockUserService.resetLoginAttempts).toHaveBeenCalledWith(expiredLockUser.id);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const sessionId = 'session-123';
      const userId = 'user-123';

      mockSessionService.invalidateSession.mockResolvedValue(undefined);
      mockCacheService.deleteByPattern.mockResolvedValue(undefined);

      await authService.logout(sessionId, userId);

      expect(mockSessionService.invalidateSession).toHaveBeenCalledWith(sessionId);
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith(`user:${userId}:*`);
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens successfully', async () => {
      const refreshToken = 'valid-refresh-token';
      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const mockTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      mockSessionService.validateRefreshToken.mockResolvedValue(mockSession as any);
      mockSessionService.generateTokens.mockResolvedValue(mockTokens);
      mockSessionService.updateSessionActivity.mockResolvedValue(undefined);

      const result = await authService.refreshTokens(refreshToken);

      expect(result.tokens).toEqual(mockTokens);
      expect(result.sessionId).toBe(mockSession.id);
      expect(mockSessionService.validateRefreshToken).toHaveBeenCalledWith(refreshToken);
      expect(mockSessionService.updateSessionActivity).toHaveBeenCalledWith(mockSession.id);
    });

    it('should throw AuthenticationError for invalid refresh token', async () => {
      const invalidToken = 'invalid-refresh-token';
      mockSessionService.validateRefreshToken.mockResolvedValue(null);

      await expect(authService.refreshTokens(invalidToken)).rejects.toThrow(AuthenticationError);
      expect(mockSessionService.validateRefreshToken).toHaveBeenCalledWith(invalidToken);
      expect(mockSessionService.generateTokens).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const resetData = {
      token: 'reset-token',
      newPassword: 'NewPass123!',
    };

    it('should reset password successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordResetToken: 'reset-token',
        passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
      };

      mockUserService.findByPasswordResetToken.mockResolvedValue(mockUser as any);
      mockUserService.updatePassword.mockResolvedValue(undefined);
      mockSessionService.invalidateAllUserSessions.mockResolvedValue(undefined);
      mockCacheService.deleteByPattern.mockResolvedValue(undefined);

      await authService.resetPassword(resetData);

      expect(mockUserService.findByPasswordResetToken).toHaveBeenCalledWith(resetData.token);
      expect(mockUserService.updatePassword).toHaveBeenCalledWith(
        mockUser.id,
        resetData.newPassword
      );
      expect(mockSessionService.invalidateAllUserSessions).toHaveBeenCalledWith(mockUser.id);
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith(`user:${mockUser.id}:*`);
    });

    it('should throw ValidationError for expired reset token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordResetToken: 'reset-token',
        passwordResetExpires: new Date(Date.now() - 60 * 60 * 1000), // Expired 1 hour ago
      };

      mockUserService.findByPasswordResetToken.mockResolvedValue(mockUser as any);

      await expect(authService.resetPassword(resetData)).rejects.toThrow(ValidationError);
      expect(mockUserService.updatePassword).not.toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid reset token', async () => {
      mockUserService.findByPasswordResetToken.mockResolvedValue(null);

      await expect(authService.resetPassword(resetData)).rejects.toThrow(ValidationError);
      expect(mockUserService.updatePassword).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    const changeData = {
      userId: 'user-123',
      currentPassword: 'OldPass123!',
      newPassword: 'NewPass123!',
    };

    it('should change password successfully', async () => {
      const mockUser = {
        id: 'user-123',
        password: 'hashed-old-password',
      };

      mockUserService.findById.mockResolvedValue(mockUser as any);
      mockBcrypt.compare.mockResolvedValue(true as never);
      mockUserService.updatePassword.mockResolvedValue(undefined);
      mockSessionService.invalidateAllUserSessions.mockResolvedValue(undefined);
      mockCacheService.deleteByPattern.mockResolvedValue(undefined);

      await authService.changePassword(changeData);

      expect(mockUserService.findById).toHaveBeenCalledWith(changeData.userId);
      expect(mockBcrypt.compare).toHaveBeenCalledWith(
        changeData.currentPassword,
        mockUser.password
      );
      expect(mockUserService.updatePassword).toHaveBeenCalledWith(
        changeData.userId,
        changeData.newPassword
      );
      expect(mockSessionService.invalidateAllUserSessions).toHaveBeenCalledWith(changeData.userId);
    });

    it('should throw AuthenticationError for invalid current password', async () => {
      const mockUser = {
        id: 'user-123',
        password: 'hashed-old-password',
      };

      mockUserService.findById.mockResolvedValue(mockUser as any);
      mockBcrypt.compare.mockResolvedValue(false as never);

      await expect(authService.changePassword(changeData)).rejects.toThrow(AuthenticationError);
      expect(mockUserService.updatePassword).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('should verify email successfully', async () => {
      const token = 'verification-token';
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        emailVerificationToken: token,
        isEmailVerified: false,
      };

      mockUserService.findByEmailVerificationToken.mockResolvedValue(mockUser as any);
      mockUserService.verifyEmail.mockResolvedValue(undefined);
      mockCacheService.deleteByPattern.mockResolvedValue(undefined);

      await authService.verifyEmail(token);

      expect(mockUserService.findByEmailVerificationToken).toHaveBeenCalledWith(token);
      expect(mockUserService.verifyEmail).toHaveBeenCalledWith(mockUser.id);
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith(`user:${mockUser.id}:*`);
    });

    it('should throw ValidationError for invalid verification token', async () => {
      const token = 'invalid-token';
      mockUserService.findByEmailVerificationToken.mockResolvedValue(null);

      await expect(authService.verifyEmail(token)).rejects.toThrow(ValidationError);
      expect(mockUserService.verifyEmail).not.toHaveBeenCalled();
    });

    it('should not verify already verified email', async () => {
      const token = 'verification-token';
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        emailVerificationToken: token,
        isEmailVerified: true, // Already verified
      };

      mockUserService.findByEmailVerificationToken.mockResolvedValue(mockUser as any);

      await expect(authService.verifyEmail(token)).rejects.toThrow(ValidationError);
      expect(mockUserService.verifyEmail).not.toHaveBeenCalled();
    });
  });
});
