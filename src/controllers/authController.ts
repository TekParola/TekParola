import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { userService } from '../services/userService';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticationError, ValidationError } from '../utils/errors';

export class AuthController {
  register = asyncHandler(async (req: Request, res: Response) => {
    const { email, username, firstName, lastName, password, phoneNumber } = req.body;

    const user = await authService.register({
      email,
      username,
      firstName,
      lastName,
      password,
      phoneNumber,
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          isEmailVerified: user.isEmailVerified,
        },
      },
    });
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password, twoFactorCode, rememberMe } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    const result = await authService.login(
      { email, password, twoFactorCode, rememberMe },
      ipAddress,
      userAgent
    );

    if (result.requiresTwoFactor) {
      res.status(200).json({
        success: true,
        message: 'Two-factor authentication required',
        data: {
          requiresTwoFactor: true,
          user: {
            id: result.user.id,
            email: result.user.email,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
          },
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: result.user,
        tokens: result.tokens,
        sessionId: result.sessionId,
      },
    });
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.sessionId!;
    const userId = req.user!.id;

    await authService.logout(sessionId, userId);

    res.status(200).json({
      success: true,
      message: 'Logout successful',
    });
  });

  refreshToken = asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    const tokens = await authService.refreshToken(refreshToken);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: { tokens },
    });
  });

  requestPasswordReset = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    await authService.requestPasswordReset({ email });

    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent',
    });
  });

  confirmPasswordReset = asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;

    await authService.confirmPasswordReset({ token, newPassword });

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
    });
  });

  requestMagicLink = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    await authService.requestMagicLink({ email });

    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a magic login link has been sent',
    });
  });

  loginWithMagicLink = asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    const result = await authService.loginWithMagicLink(token, ipAddress, userAgent);

    res.status(200).json({
      success: true,
      message: 'Magic link login successful',
      data: {
        user: result.user,
        tokens: result.tokens,
        sessionId: result.sessionId,
      },
    });
  });

  getProfile = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const user = await userService.findById(userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          avatar: user.avatar,
          timezone: user.timezone,
          language: user.language,
          dateFormat: user.dateFormat,
          timeFormat: user.timeFormat,
          isEmailVerified: user.isEmailVerified,
          twoFactorEnabled: user.twoFactorEnabled,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          roles: req.user!.roles,
          permissions: req.user!.permissions,
        },
      },
    });
  });

  updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { firstName, lastName, phoneNumber, timezone, language, dateFormat, timeFormat } = req.body;

    const updatedUser = await userService.updateUser(userId, {
      firstName,
      lastName,
      phoneNumber,
      timezone,
      language,
      dateFormat,
      timeFormat,
      updatedBy: userId,
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          username: updatedUser.username,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          phoneNumber: updatedUser.phoneNumber,
          avatar: updatedUser.avatar,
          timezone: updatedUser.timezone,
          language: updatedUser.language,
          dateFormat: updatedUser.dateFormat,
          timeFormat: updatedUser.timeFormat,
        },
      },
    });
  });

  changePassword = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const user = await userService.findById(userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    const isCurrentPasswordValid = await userService.verifyPassword(user, currentPassword);
    if (!isCurrentPasswordValid) {
      throw new ValidationError('Current password is incorrect');
    }

    // Update password
    await userService.updatePassword(userId, newPassword, userId);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  });

  generate2FASecret = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const { secret, qrCode } = await authService.generateTwoFactorSecret(userId);

    res.status(200).json({
      success: true,
      message: '2FA secret generated successfully',
      data: {
        secret,
        qrCode,
      },
    });
  });

  enable2FA = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { code } = req.body;

    const result = await authService.enableTwoFactor(userId, code);

    res.status(200).json({
      success: true,
      message: 'Two-factor authentication enabled successfully',
      data: {
        backupCodes: result.backupCodes,
      },
    });
  });

  verify2FA = asyncHandler(async (req: Request, res: Response) => {
    const { email, code } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    const result = await authService.verifyTwoFactorForLogin(
      email,
      code,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      message: 'Two-factor authentication verified successfully',
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      },
    });
  });

  disable2FA = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { code } = req.body;

    await authService.disableTwoFactor(userId, code);

    res.status(200).json({
      success: true,
      message: 'Two-factor authentication disabled successfully',
    });
  });

  regenerateBackupCodes = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { code } = req.body;

    const backupCodes = await authService.regenerateBackupCodes(userId, code);

    res.status(200).json({
      success: true,
      message: 'Backup codes regenerated successfully',
      data: {
        backupCodes,
      },
    });
  });

  getBackupCodesInfo = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const info = await authService.getBackupCodesInfo(userId);

    res.status(200).json({
      success: true,
      message: 'Backup codes info retrieved successfully',
      data: info,
    });
  });

  verifyEmail = asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;

    // For now, just verify the token format
    // In a real implementation, you'd verify a signed token
    if (!token || token.length < 10) {
      throw new ValidationError('Invalid verification token');
    }

    // Extract user ID from token (implement proper token verification)
    // This is a simplified implementation
    const userId = req.user?.id;
    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }

    const user = await userService.verifyEmail(userId);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          isEmailVerified: user.isEmailVerified,
          emailVerifiedAt: user.emailVerifiedAt,
        },
      },
    });
  });

  checkEmailAvailability = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    const existingUser = await userService.findByEmail(email);
    const isAvailable = !existingUser;

    res.status(200).json({
      success: true,
      message: 'Email availability checked',
      data: {
        email,
        available: isAvailable,
      },
    });
  });

  checkUsernameAvailability = asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.body;

    const existingUser = await userService.findByUsername(username);
    const isAvailable = !existingUser;

    res.status(200).json({
      success: true,
      message: 'Username availability checked',
      data: {
        username,
        available: isAvailable,
      },
    });
  });
}

export const authController = new AuthController();