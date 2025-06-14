import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/database';
import { redis } from '../../src/config/redis';
import { emailService } from '../../src/services/emailService';

jest.mock('../../src/services/emailService');

const app = createApp();
const mockEmailService = emailService as jest.Mocked<typeof emailService>;

describe('Authentication E2E Tests', () => {
  beforeEach(async () => {
    // Clean database
    await prisma.session.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany();
    await redis.flushdb();
    jest.clearAllMocks();
  });

  describe('Complete Registration and Login Flow', () => {
    it('should register, verify email, and login successfully', async () => {
      let emailVerificationToken: string;

      // Mock email service to capture verification token
      mockEmailService.sendEmail.mockImplementation(async (data) => {
        const match = data.htmlContent?.match(/verify\?token=([a-zA-Z0-9-]+)/);
        if (match) {
          emailVerificationToken = match[1];
        }
        return Promise.resolve();
      });

      // 1. Register new user
      const registerResponse = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'e2e@test.com',
          firstName: 'E2E',
          lastName: 'Test',
          password: 'TestPass123!',
        })
        .expect(201);

      expect(registerResponse.body.success).toBe(true);
      expect(registerResponse.body.data.user.email).toBe('e2e@test.com');
      expect(registerResponse.body.data.user.isEmailVerified).toBe(false);
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'e2e@test.com',
          subject: expect.stringContaining('Verify'),
        })
      );

      // 2. Try to login without email verification
      const unverifiedLoginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'e2e@test.com',
          password: 'TestPass123!',
        })
        .expect(401);

      expect(unverifiedLoginResponse.body.message).toContain('email not verified');

      // 3. Verify email
      const verifyResponse = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: emailVerificationToken! })
        .expect(200);

      expect(verifyResponse.body.success).toBe(true);
      expect(verifyResponse.body.message).toContain('verified');

      // 4. Login with verified email
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'e2e@test.com',
          password: 'TestPass123!',
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.data.user.email).toBe('e2e@test.com');
      expect(loginResponse.body.data.user.isEmailVerified).toBe(true);
      expect(loginResponse.body.data.tokens.accessToken).toBeDefined();
      expect(loginResponse.body.data.tokens.refreshToken).toBeDefined();
      expect(loginResponse.body.data.sessionId).toBeDefined();

      // 5. Access protected route with token
      const profileResponse = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${loginResponse.body.data.tokens.accessToken}`)
        .expect(200);

      expect(profileResponse.body.data.user.email).toBe('e2e@test.com');
      expect(profileResponse.body.data.user.roles).toBeDefined();
      expect(profileResponse.body.data.user.permissions).toBeDefined();
    });
  });

  describe('Password Reset Flow', () => {
    let testUser: any;
    let resetToken: string;

    beforeEach(async () => {
      // Create verified user
      testUser = await prisma.user.create({
        data: {
          email: 'reset@test.com',
          firstName: 'Reset',
          lastName: 'Test',
          password: '$2b$10$YourHashedPasswordHere',
          isEmailVerified: true,
        },
      });

      // Mock email service to capture reset token
      mockEmailService.sendEmail.mockImplementation(async (data) => {
        const match = data.htmlContent?.match(/reset\?token=([a-zA-Z0-9-]+)/);
        if (match) {
          resetToken = match[1];
        }
        return Promise.resolve();
      });
    });

    it('should complete password reset flow', async () => {
      // 1. Request password reset
      const requestResetResponse = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'reset@test.com' })
        .expect(200);

      expect(requestResetResponse.body.success).toBe(true);
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'reset@test.com',
          subject: expect.stringContaining('Password Reset'),
        })
      );

      // 2. Reset password with token
      const resetResponse = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'NewPass123!',
        })
        .expect(200);

      expect(resetResponse.body.success).toBe(true);

      // 3. Login with new password
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'reset@test.com',
          password: 'NewPass123!',
        })
        .expect(200);

      expect(loginResponse.body.data.user.email).toBe('reset@test.com');

      // 4. Verify old password doesn't work
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'reset@test.com',
          password: 'OldPassword123!',
        })
        .expect(401);
    });

    it('should not allow reusing reset token', async () => {
      // Request reset
      await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'reset@test.com' })
        .expect(200);

      // Use token once
      await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'NewPass123!',
        })
        .expect(200);

      // Try to use token again
      const secondAttempt = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'AnotherPass123!',
        })
        .expect(400);

      expect(secondAttempt.body.success).toBe(false);
      expect(secondAttempt.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Session Management Flow', () => {
    let accessToken: string;
    let refreshToken: string;
    let sessionId: string;

    beforeEach(async () => {
      // Create user and login
      await prisma.user.create({
        data: {
          email: 'session@test.com',
          firstName: 'Session',
          lastName: 'Test',
          password: '$2b$10$YourHashedPasswordHere',
          isEmailVerified: true,
        },
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'session@test.com',
          password: 'TestPass123!',
        });

      accessToken = loginResponse.body.data.tokens.accessToken;
      refreshToken = loginResponse.body.data.tokens.refreshToken;
      sessionId = loginResponse.body.data.sessionId;
    });

    it('should manage multiple sessions', async () => {
      // 1. Create second session from different device
      const secondLoginResponse = await request(app)
        .post('/api/v1/auth/login')
        .set('User-Agent', 'Mobile Device')
        .send({
          email: 'session@test.com',
          password: 'TestPass123!',
        })
        .expect(200);

      const secondSessionId = secondLoginResponse.body.data.sessionId;

      // 2. Get all sessions
      const sessionsResponse = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(sessionsResponse.body.data).toHaveLength(2);
      expect(sessionsResponse.body.data.map((s: any) => s.id)).toContain(sessionId);
      expect(sessionsResponse.body.data.map((s: any) => s.id)).toContain(secondSessionId);

      // 3. Logout from specific session
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${secondLoginResponse.body.data.tokens.accessToken}`)
        .expect(200);

      // 4. Verify session was invalidated
      await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${secondLoginResponse.body.data.tokens.accessToken}`)
        .expect(401);

      // 5. First session should still work
      await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 6. Logout from all sessions
      await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 7. Verify all sessions invalidated
      await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });

    it('should refresh tokens correctly', async () => {
      // 1. Use refresh token
      const refreshResponse = await request(app)
        .post('/api/v1/auth/refresh-token')
        .send({ refreshToken })
        .expect(200);

      const newAccessToken = refreshResponse.body.data.tokens.accessToken;
      const newRefreshToken = refreshResponse.body.data.tokens.refreshToken;

      expect(newAccessToken).toBeDefined();
      expect(newRefreshToken).toBeDefined();
      expect(newAccessToken).not.toBe(accessToken);
      expect(newRefreshToken).not.toBe(refreshToken);

      // 2. Old access token should be invalid
      await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      // 3. New access token should work
      await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(200);

      // 4. Old refresh token should not work
      await request(app)
        .post('/api/v1/auth/refresh-token')
        .send({ refreshToken })
        .expect(400);

      // 5. New refresh token should work
      const secondRefreshResponse = await request(app)
        .post('/api/v1/auth/refresh-token')
        .send({ refreshToken: newRefreshToken })
        .expect(200);

      expect(secondRefreshResponse.body.data.tokens.accessToken).toBeDefined();
    });
  });

  describe('Account Security Flow', () => {
    let userAccessToken: string;

    beforeEach(async () => {
      // Create user and login
      await prisma.user.create({
        data: {
          email: 'security@test.com',
          firstName: 'Security',
          lastName: 'Test',
          password: '$2b$10$YourHashedPasswordHere',
          isEmailVerified: true,
        },
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'security@test.com',
          password: 'TestPass123!',
        });

      userAccessToken = loginResponse.body.data.tokens.accessToken;
    });

    it('should change password and invalidate sessions', async () => {
      // 1. Change password
      const changePasswordResponse = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({
          currentPassword: 'TestPass123!',
          newPassword: 'NewSecurePass123!',
        })
        .expect(200);

      expect(changePasswordResponse.body.success).toBe(true);

      // 2. Old token should be invalid
      await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .expect(401);

      // 3. Login with new password
      const newLoginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'security@test.com',
          password: 'NewSecurePass123!',
        })
        .expect(200);

      expect(newLoginResponse.body.data.user.email).toBe('security@test.com');
    });

    it('should handle account lockout after failed attempts', async () => {
      // Make multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'security@test.com',
            password: 'WrongPassword!',
          })
          .expect(401);
      }

      // Next attempt should indicate account is locked
      const lockedResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'security@test.com',
          password: 'TestPass123!', // Even with correct password
        })
        .expect(401);

      expect(lockedResponse.body.message).toContain('locked');
    });
  });

  describe('2FA Flow', () => {
    let userAccessToken: string;
    let userId: string;

    beforeEach(async () => {
      // Create user and login
      const user = await prisma.user.create({
        data: {
          email: '2fa@test.com',
          firstName: '2FA',
          lastName: 'Test',
          password: '$2b$10$YourHashedPasswordHere',
          isEmailVerified: true,
        },
      });

      userId = user.id;

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: '2fa@test.com',
          password: 'TestPass123!',
        });

      userAccessToken = loginResponse.body.data.tokens.accessToken;
    });

    it('should enable and use 2FA', async () => {
      // 1. Enable 2FA
      const enable2FAResponse = await request(app)
        .post('/api/v1/auth/2fa/enable')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .expect(200);

      const secret = enable2FAResponse.body.data.secret;
      const backupCodes = enable2FAResponse.body.data.backupCodes;

      expect(secret).toBeDefined();
      expect(backupCodes).toHaveLength(10);
      expect(enable2FAResponse.body.data.qrCode).toBeDefined();

      // 2. Confirm 2FA with valid code (mock)
      const mockTotp = '123456'; // In real test, generate from secret
      
      // Note: This would require mocking the TOTP verification
      // For now, we'll test the backup codes flow

      // 3. Logout
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .expect(200);

      // 4. Login requires 2FA
      const loginWith2FAResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: '2fa@test.com',
          password: 'TestPass123!',
        })
        .expect(200);

      expect(loginWith2FAResponse.body.data.requires2FA).toBe(true);
      expect(loginWith2FAResponse.body.data.tempToken).toBeDefined();

      // 5. Complete login with backup code
      const verifyResponse = await request(app)
        .post('/api/v1/auth/2fa/verify')
        .send({
          tempToken: loginWith2FAResponse.body.data.tempToken,
          code: backupCodes[0],
        })
        .expect(200);

      expect(verifyResponse.body.data.tokens.accessToken).toBeDefined();
      expect(verifyResponse.body.data.user.email).toBe('2fa@test.com');
    });
  });
});
