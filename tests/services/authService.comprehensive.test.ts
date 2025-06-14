import { authService } from '../../src/services/authService';
import { userService } from '../../src/services/userService';
import { emailService } from '../../src/services/emailService';
import { sessionService } from '../../src/services/sessionService';
import { securityEventService } from '../../src/services/securityEventService';
import { jwtService } from '../../src/utils/jwt';

// Mock all dependencies
jest.mock('../../src/services/userService');
jest.mock('../../src/services/emailService');
jest.mock('../../src/services/sessionService');
jest.mock('../../src/services/securityEventService');
jest.mock('../../src/utils/jwt');
jest.mock('speakeasy');
jest.mock('bcrypt');
jest.mock('uuid');

const mockUserService = userService as jest.Mocked<typeof userService>;
const mockEmailService = emailService as jest.Mocked<typeof emailService>;
const mockSessionService = sessionService as jest.Mocked<typeof sessionService>;
const mockSecurityEventService = securityEventService as jest.Mocked<typeof securityEventService>;
const mockJwtService = jwtService as jest.Mocked<typeof jwtService>;

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    const mockCredentials = {
      email: 'test@example.com',
      password: 'password123',
    };
    
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      isActive: true,
      twoFactorEnabled: false,
    };

    const mockSession = {
      id: 'session-123',
      userId: 'user-123',
      sessionToken: 'session-token',
    };

    const mockTokens = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    };

    it('should login successfully with valid credentials', async () => {
      mockUserService.findByEmail.mockResolvedValue(mockUser as any);
      mockUserService.isAccountLocked.mockResolvedValue(false);
      mockUserService.verifyPassword.mockResolvedValue(true);
      mockUserService.recordLoginAttempt.mockResolvedValue(undefined);
      mockSessionService.createSession.mockResolvedValue(mockSession as any);
      mockJwtService.generateTokenPair.mockReturnValue(mockTokens);

      const result = await authService.login(mockCredentials, '127.0.0.1', 'Test Browser');

      expect(result).toEqual({
        user: expect.objectContaining({ id: 'user-123' }),
        tokens: mockTokens,
        sessionId: 'session-123',
      });
      expect(mockUserService.recordLoginAttempt).toHaveBeenCalledWith('user-123', true, '127.0.0.1');
    });

    it('should throw error for invalid email', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);

      await expect(authService.login(mockCredentials, '127.0.0.1', 'Test Browser'))
        .rejects.toThrow('Invalid credentials');
    });

    it('should throw error for locked account', async () => {
      mockUserService.findByEmail.mockResolvedValue(mockUser as any);
      mockUserService.isAccountLocked.mockResolvedValue(true);

      await expect(authService.login(mockCredentials, '127.0.0.1', 'Test Browser'))
        .rejects.toThrow('Account is locked');
    });

    it('should throw error for inactive account', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      mockUserService.findByEmail.mockResolvedValue(inactiveUser as any);
      mockUserService.isAccountLocked.mockResolvedValue(false);

      await expect(authService.login(mockCredentials, '127.0.0.1', 'Test Browser'))
        .rejects.toThrow('Account is deactivated');
    });

    it('should throw error for invalid password', async () => {
      mockUserService.findByEmail.mockResolvedValue(mockUser as any);
      mockUserService.isAccountLocked.mockResolvedValue(false);
      mockUserService.verifyPassword.mockResolvedValue(false);
      mockUserService.recordLoginAttempt.mockResolvedValue(undefined);
      mockSecurityEventService.detectBruteForceAttack.mockResolvedValue(undefined);

      await expect(authService.login(mockCredentials, '127.0.0.1', 'Test Browser'))
        .rejects.toThrow('Invalid credentials');

      expect(mockUserService.recordLoginAttempt).toHaveBeenCalledWith('user-123', false, '127.0.0.1');
      expect(mockSecurityEventService.detectBruteForceAttack).toHaveBeenCalledWith('test@example.com', '127.0.0.1');
    });

    it('should handle 2FA requirement', async () => {
      const twoFactorUser = { ...mockUser, twoFactorEnabled: true };
      mockUserService.findByEmail.mockResolvedValue(twoFactorUser as any);
      mockUserService.isAccountLocked.mockResolvedValue(false);
      mockUserService.verifyPassword.mockResolvedValue(true);

      const result = await authService.login(mockCredentials, '127.0.0.1', 'Test Browser');

      expect(result.requiresTwoFactor).toBe(true);
      expect(result.tokens.accessToken).toBe('');
    });
  });

  describe('register', () => {
    const mockRegisterData = {
      email: 'new@example.com',
      firstName: 'New',
      lastName: 'User',
      password: 'newpassword123',
    };

    const mockCreatedUser = {
      id: 'user-new',
      email: 'new@example.com',
      firstName: 'New',
      lastName: 'User',
    };

    it('should register user successfully', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);
      mockUserService.create.mockResolvedValue(mockCreatedUser as any);
      mockEmailService.sendWelcomeEmail.mockResolvedValue(undefined);

      const result = await authService.register(mockRegisterData);

      expect(result).toEqual(mockCreatedUser);
      expect(mockUserService.create).toHaveBeenCalledWith(mockRegisterData);
      expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledWith(mockCreatedUser);
    });

    it('should throw error for existing email', async () => {
      const existingUser = { id: 'existing', email: 'new@example.com' };
      mockUserService.findByEmail.mockResolvedValue(existingUser as any);

      await expect(authService.register(mockRegisterData))
        .rejects.toThrow('Email already exists');

      expect(mockUserService.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const sessionId = 'session-123';
      const accessToken = 'access-token';

      mockSessionService.invalidateSession.mockResolvedValue(true);
      mockJwtService.blacklistToken.mockResolvedValue(undefined);

      await authService.logout(sessionId, accessToken);

      expect(mockSessionService.invalidateSession).toHaveBeenCalledWith(sessionId);
      expect(mockJwtService.blacklistToken).toHaveBeenCalledWith(accessToken);
    });

    it('should handle logout errors gracefully', async () => {
      const sessionId = 'session-123';
      const accessToken = 'access-token';

      mockSessionService.invalidateSession.mockResolvedValue(false);
      mockJwtService.blacklistToken.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await authService.logout(sessionId, accessToken);

      expect(mockSessionService.invalidateSession).toHaveBeenCalledWith(sessionId);
      expect(mockJwtService.blacklistToken).toHaveBeenCalledWith(accessToken);
    });
  });

  describe('refreshToken', () => {
    const mockRefreshToken = 'refresh-token';
    const mockTokenPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      sessionId: 'session-123',
      type: 'refresh' as const,
    };

    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      isActive: true,
    };

    const mockSession = {
      id: 'session-123',
      userId: 'user-123',
      isActive: true,
    };

    const mockNewTokens = {
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
    };

    it('should refresh token successfully', async () => {
      mockJwtService.verifyRefreshToken.mockReturnValue(mockTokenPayload);
      mockUserService.findById.mockResolvedValue(mockUser as any);
      mockSessionService.getSession.mockResolvedValue(mockSession as any);
      mockJwtService.generateTokenPair.mockReturnValue(mockNewTokens);
      mockJwtService.blacklistToken.mockResolvedValue(undefined);

      const result = await authService.refreshToken(mockRefreshToken);

      expect(result).toEqual({
        user: mockUser,
        tokens: mockNewTokens,
      });
      expect(mockJwtService.blacklistToken).toHaveBeenCalledWith(mockRefreshToken);
    });

    it('should throw error for invalid refresh token', async () => {
      mockJwtService.verifyRefreshToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.refreshToken(mockRefreshToken))
        .rejects.toThrow('Invalid refresh token');
    });

    it('should throw error for inactive user', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      mockJwtService.verifyRefreshToken.mockReturnValue(mockTokenPayload);
      mockUserService.findById.mockResolvedValue(inactiveUser as any);

      await expect(authService.refreshToken(mockRefreshToken))
        .rejects.toThrow('User account is deactivated');
    });

    it('should throw error for invalid session', async () => {
      mockJwtService.verifyRefreshToken.mockReturnValue(mockTokenPayload);
      mockUserService.findById.mockResolvedValue(mockUser as any);
      mockSessionService.getSession.mockResolvedValue(null);

      await expect(authService.refreshToken(mockRefreshToken))
        .rejects.toThrow('Invalid session');
    });
  });

  describe('requestPasswordReset', () => {
    const mockEmail = 'test@example.com';
    const mockUser = {
      id: 'user-123',
      email: mockEmail,
      firstName: 'Test',
      lastName: 'User',
    };

    it('should send password reset email for valid user', async () => {
      const mockResetToken = 'reset-token';
      
      mockUserService.findByEmail.mockResolvedValue(mockUser as any);
      mockJwtService.generatePasswordResetToken.mockResolvedValue(mockResetToken);
      mockUserService.setPasswordResetToken.mockResolvedValue(undefined);
      mockEmailService.sendPasswordResetEmail.mockResolvedValue(undefined);

      await authService.requestPasswordReset(mockEmail);

      expect(mockUserService.setPasswordResetToken).toHaveBeenCalledWith('user-123', mockResetToken);
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(mockUser, mockResetToken);
    });

    it('should not throw error for non-existent user (security)', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);

      // Should not throw to prevent email enumeration
      await authService.requestPasswordReset(mockEmail);

      expect(mockUserService.setPasswordResetToken).not.toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const mockResetData = {
      token: 'reset-token',
      newPassword: 'newpassword123',
    };

    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      resetPasswordToken: 'reset-token',
      resetPasswordExpires: new Date(Date.now() + 3600000),
    };

    it('should reset password successfully', async () => {
      mockJwtService.verifyPasswordResetToken.mockReturnValue({ userId: 'user-123' });
      mockUserService.findById.mockResolvedValue(mockUser as any);
      mockUserService.updatePassword.mockResolvedValue(undefined);
      mockUserService.clearPasswordResetToken.mockResolvedValue(undefined);
      mockSessionService.invalidateUserSessions.mockResolvedValue(2);
      mockJwtService.revokeAllUserTokens.mockResolvedValue(undefined);

      await authService.resetPassword(mockResetData);

      expect(mockUserService.updatePassword).toHaveBeenCalledWith('user-123', 'newpassword123');
      expect(mockUserService.clearPasswordResetToken).toHaveBeenCalledWith('user-123');
      expect(mockSessionService.invalidateUserSessions).toHaveBeenCalledWith('user-123');
      expect(mockJwtService.revokeAllUserTokens).toHaveBeenCalledWith('user-123');
    });

    it('should throw error for invalid token', async () => {
      mockJwtService.verifyPasswordResetToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.resetPassword(mockResetData))
        .rejects.toThrow('Invalid or expired reset token');
    });

    it('should throw error for mismatched token', async () => {
      const userWithDifferentToken = {
        ...mockUser,
        resetPasswordToken: 'different-token',
      };

      mockJwtService.verifyPasswordResetToken.mockReturnValue({ userId: 'user-123' });
      mockUserService.findById.mockResolvedValue(userWithDifferentToken as any);

      await expect(authService.resetPassword(mockResetData))
        .rejects.toThrow('Invalid or expired reset token');
    });
  });

  describe('requestMagicLink', () => {
    const mockEmail = 'test@example.com';
    const mockUser = {
      id: 'user-123',
      email: mockEmail,
      firstName: 'Test',
      lastName: 'User',
      isActive: true,
    };

    it('should send magic link for valid active user', async () => {
      const mockMagicToken = 'magic-token';
      
      mockUserService.findByEmail.mockResolvedValue(mockUser as any);
      mockJwtService.generateMagicLinkToken.mockResolvedValue(mockMagicToken);
      mockUserService.setMagicLinkToken.mockResolvedValue(undefined);
      mockEmailService.sendMagicLinkEmail.mockResolvedValue(undefined);

      await authService.requestMagicLink(mockEmail);

      expect(mockUserService.setMagicLinkToken).toHaveBeenCalledWith('user-123', mockMagicToken);
      expect(mockEmailService.sendMagicLinkEmail).toHaveBeenCalledWith(mockUser, mockMagicToken);
    });

    it('should not send magic link for inactive user', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      mockUserService.findByEmail.mockResolvedValue(inactiveUser as any);

      // Should not throw to prevent account enumeration
      await authService.requestMagicLink(mockEmail);

      expect(mockUserService.setMagicLinkToken).not.toHaveBeenCalled();
      expect(mockEmailService.sendMagicLinkEmail).not.toHaveBeenCalled();
    });
  });

  describe('verifyMagicLink', () => {
    const mockToken = 'magic-token';
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      magicLinkToken: mockToken,
      magicLinkExpires: new Date(Date.now() + 3600000),
      isActive: true,
    };

    const mockSession = {
      id: 'session-123',
      userId: 'user-123',
      sessionToken: 'session-token',
    };

    const mockTokens = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    };

    it('should verify magic link and login user', async () => {
      mockJwtService.verifyMagicLinkToken.mockReturnValue({ userId: 'user-123' });
      mockUserService.findById.mockResolvedValue(mockUser as any);
      mockUserService.clearMagicLinkToken.mockResolvedValue(undefined);
      mockSessionService.createSession.mockResolvedValue(mockSession as any);
      mockJwtService.generateTokenPair.mockReturnValue(mockTokens);

      const result = await authService.verifyMagicLink(mockToken, '127.0.0.1', 'Test Browser');

      expect(result).toEqual({
        user: expect.objectContaining({ id: 'user-123' }),
        tokens: mockTokens,
        sessionId: 'session-123',
      });
      expect(mockUserService.clearMagicLinkToken).toHaveBeenCalledWith('user-123');
    });

    it('should throw error for invalid token', async () => {
      mockJwtService.verifyMagicLinkToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.verifyMagicLink(mockToken, '127.0.0.1', 'Test Browser'))
        .rejects.toThrow('Invalid or expired magic link');
    });

    it('should throw error for mismatched token', async () => {
      const userWithDifferentToken = {
        ...mockUser,
        magicLinkToken: 'different-token',
      };

      mockJwtService.verifyMagicLinkToken.mockReturnValue({ userId: 'user-123' });
      mockUserService.findById.mockResolvedValue(userWithDifferentToken as any);

      await expect(authService.verifyMagicLink(mockToken, '127.0.0.1', 'Test Browser'))
        .rejects.toThrow('Invalid or expired magic link');
    });
  });
});