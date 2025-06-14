import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import {
  authLimiter,
  registrationLimiter,
  passwordResetLimiter,
  magicLinkLimiter,
  twoFactorLimiter,
} from '../middleware/rateLimiter';
import {
  validateRegister,
  validateLogin,
  validatePasswordResetRequest,
  validatePasswordResetConfirm,
  validateMagicLinkRequest,
  validateMagicLinkLogin,
  validateRefreshToken,
  validateTwoFactorSetup,
  validateBackupCodeRegeneration,
  validateChangePassword,
  validateUpdateProfile,
} from '../validators/authValidators';
import { csrfTokenEndpoint } from '../middleware/csrf';

const router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: Register a new user
 *     description: Create a new user account with email verification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 'User registered successfully'
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       429:
 *         description: Too many registration attempts
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/register',
  registrationLimiter,
  validateRegister,
  validateRequest,
  authController.register
);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: User login
 *     description: Authenticate user and return access/refresh tokens
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 'Login successful'
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 tokens:
 *                   $ref: '#/components/schemas/TokenPair'
 *                 requiresTwoFactor:
 *                   type: boolean
 *                   description: Whether 2FA verification is required
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         description: Too many login attempts
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/login',
  authLimiter,
  validateLogin,
  validateRequest,
  authController.login
);

/**
 * @openapi
 * /auth/refresh-token:
 *   post:
 *     tags: [Authentication]
 *     summary: Refresh access token
 *     description: Get a new access token using a valid refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Valid refresh token
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 tokens:
 *                   $ref: '#/components/schemas/TokenPair'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/refresh-token',
  authLimiter,
  validateRefreshToken,
  validateRequest,
  authController.refreshToken
);

router.post(
  '/password-reset/request',
  passwordResetLimiter,
  validatePasswordResetRequest,
  validateRequest,
  authController.requestPasswordReset
);

router.post(
  '/password-reset/confirm',
  passwordResetLimiter,
  validatePasswordResetConfirm,
  validateRequest,
  authController.confirmPasswordReset
);

router.post(
  '/magic-link/request',
  magicLinkLimiter,
  validateMagicLinkRequest,
  validateRequest,
  authController.requestMagicLink
);

router.post(
  '/magic-link/login',
  magicLinkLimiter,
  validateMagicLinkLogin,
  validateRequest,
  authController.loginWithMagicLink
);

// Check availability endpoints (optional auth for better UX)
router.post(
  '/check-email',
  optionalAuth,
  authController.checkEmailAvailability
);

router.post(
  '/check-username',
  optionalAuth,
  authController.checkUsernameAvailability
);

// Protected routes
router.post(
  '/logout',
  authenticate,
  authController.logout
);

router.get(
  '/profile',
  authenticate,
  authController.getProfile
);

router.put(
  '/profile',
  authenticate,
  validateUpdateProfile,
  validateRequest,
  authController.updateProfile
);

router.post(
  '/change-password',
  authenticate,
  validateChangePassword,
  validateRequest,
  authController.changePassword
);

// Two-factor authentication routes
router.post(
  '/2fa/generate',
  authenticate,
  authController.generate2FASecret
);

/**
 * @openapi
 * /auth/2fa/verify:
 *   post:
 *     tags: [Authentication]
 *     summary: Verify 2FA code during login
 *     description: Complete login by providing 2FA code after initial authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               code:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *     responses:
 *       200:
 *         description: 2FA verified successfully
 *       401:
 *         description: Invalid 2FA code
 */
router.post(
  '/2fa/verify',
  authLimiter,
  authController.verify2FA
);

router.post(
  '/2fa/enable',
  authenticate,
  twoFactorLimiter,
  validateTwoFactorSetup,
  validateRequest,
  authController.enable2FA
);

router.post(
  '/2fa/disable',
  authenticate,
  twoFactorLimiter,
  validateTwoFactorSetup,
  validateRequest,
  authController.disable2FA
);

// Backup codes routes
router.post(
  '/2fa/backup-codes/regenerate',
  authenticate,
  twoFactorLimiter,
  validateBackupCodeRegeneration,
  validateRequest,
  authController.regenerateBackupCodes
);

router.get(
  '/2fa/backup-codes/info',
  authenticate,
  authController.getBackupCodesInfo
);

// Email verification
router.get(
  '/verify-email/:token',
  authenticate,
  authController.verifyEmail
);

/**
 * @openapi
 * /auth/csrf-token:
 *   get:
 *     tags: [Authentication]
 *     summary: Get CSRF token
 *     description: Get a CSRF token for state-changing requests
 *     responses:
 *       200:
 *         description: CSRF token returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 csrfToken:
 *                   type: string
 *                   description: CSRF token to include in subsequent requests
 */
router.get('/csrf-token', csrfTokenEndpoint);

export default router;