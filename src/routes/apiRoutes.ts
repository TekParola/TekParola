import { Router } from 'express';
import { authenticateApiKey, apiRateLimit, requireApiPermission, requireApiScope, apiCors } from '../middleware/apiAuth';
import { validateRequest } from '../middleware/validation';
import { body, query } from 'express-validator';
import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { userService } from '../services/userService';

const router = Router();

// Apply CORS middleware to all API routes
router.use(apiCors);

// Apply API key authentication to all routes
router.use(authenticateApiKey);

// Apply rate limiting with default config
router.use(apiRateLimit({
  windowMs: 60000, // 1 minute
  maxRequests: 1000, // 1000 requests per minute default
}));

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     ApiKeyAuth:
 *       type: apiKey
 *       in: header
 *       name: X-API-Key
 *     ApiKeyBearer:
 *       type: http
 *       scheme: bearer
 *       description: API key as bearer token
 *   
 *   schemas:
 *     ApiResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 *         data:
 *           type: object
 */

/**
 * @swagger
 * /api/sso/validate-token:
 *   post:
 *     summary: Validate an access token
 *     tags: [API - SSO]
 *     security:
 *       - ApiKeyAuth: []
 *       - ApiKeyBearer: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - access_token
 *             properties:
 *               access_token:
 *                 type: string
 *                 description: The access token to validate
 *     responses:
 *       200:
 *         description: Token validation result
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         valid:
 *                           type: boolean
 *                         user:
 *                           $ref: '#/components/schemas/SSOUserInfo'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Invalid API key
 */
router.post('/sso/validate-token', 
  requireApiScope('sso'),
  requireApiPermission('validate', 'token'),
  [
    body('access_token')
      .isString()
      .trim()
      .isLength({ min: 1 })
      .withMessage('access_token is required'),
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { access_token: accessToken } = req.body;

    try {
      const { ssoService } = await import('../services/ssoService');
      const userInfo = await ssoService.getUserInfo(accessToken);
      
      res.status(200).json({
        success: true,
        message: 'Token is valid',
        data: {
          valid: true,
          user: userInfo,
        },
      });
    } catch (error) {
      res.status(200).json({
        success: true,
        message: 'Token is invalid',
        data: {
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  })
);

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get user profile by user ID
 *     tags: [API - Users]
 *     security:
 *       - ApiKeyAuth: []
 *       - ApiKeyBearer: []
 *     parameters:
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to fetch profile for
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user:
 *                           type: object
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Invalid API key
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 */
router.get('/users/profile',
  requireApiScope('users'),
  requireApiPermission('read', 'user'),
  [
    query('user_id')
      .isString()
      .trim()
      .isLength({ min: 1 })
      .withMessage('user_id is required'),
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { user_id: userId } = req.query;

    const user = await userService.findWithRoles(userId as string);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Return safe user data (exclude sensitive fields)
    return res.status(200).json({
      success: true,
      message: 'User profile retrieved successfully',
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
          isActive: user.isActive,
          isEmailVerified: user.isEmailVerified,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          roles: (user as any).roles?.map((ur: any) => ({
            id: ur.role.id,
            name: ur.role.name,
            displayName: ur.role.displayName,
            assignedAt: ur.assignedAt,
          })) || [],
        },
      },
    });
  })
);

/**
 * @swagger
 * /api/users/validate:
 *   post:
 *     summary: Validate user credentials
 *     tags: [API - Users]
 *     security:
 *       - ApiKeyAuth: []
 *       - ApiKeyBearer: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User validation result
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         valid:
 *                           type: boolean
 *                         user:
 *                           type: object
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Invalid API key
 *       403:
 *         description: Insufficient permissions
 */
router.post('/users/validate',
  requireApiScope('users'),
  requireApiPermission('validate', 'user'),
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .isString()
      .isLength({ min: 1 })
      .withMessage('Password is required'),
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    try {
      const { authService } = await import('../services/authService');
      const result = await authService.validateCredentials(email, password);
      
      if (result.valid && result.user) {
        res.status(200).json({
          success: true,
          message: 'Credentials are valid',
          data: {
            valid: true,
            user: {
              id: result.user.id,
              email: result.user.email,
              firstName: result.user.firstName,
              lastName: result.user.lastName,
              isActive: result.user.isActive,
              isEmailVerified: result.user.isEmailVerified,
            },
          },
        });
      } else {
        res.status(200).json({
          success: true,
          message: 'Credentials are invalid',
          data: {
            valid: false,
            reason: result.reason || 'Invalid credentials',
          },
        });
      }
    } catch (error) {
      res.status(200).json({
        success: true,
        message: 'Credentials are invalid',
        data: {
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  })
);

/**
 * @swagger
 * /api/applications/info:
 *   get:
 *     summary: Get current application information
 *     tags: [API - Applications]
 *     security:
 *       - ApiKeyAuth: []
 *       - ApiKeyBearer: []
 *     responses:
 *       200:
 *         description: Application information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         application:
 *                           type: object
 *                         apiKey:
 *                           type: object
 *       401:
 *         description: Invalid API key
 */
router.get('/applications/info',
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: 'Application information retrieved successfully',
      data: {
        application: {
          id: req.application!.id,
          name: req.application!.name,
          displayName: req.application!.displayName,
          clientId: req.application!.clientId,
          scopes: req.application!.scopes,
          tokenLifetime: req.application!.tokenLifetime,
          refreshTokenLifetime: req.application!.refreshTokenLifetime,
        },
        apiKey: {
          id: req.apiKey!.id,
          keyId: req.apiKey!.keyId,
          name: req.apiKey!.name,
          permissions: req.apiKey!.permissions,
          expiresAt: req.apiKey!.expiresAt,
          rateLimit: req.apiKey!.rateLimit,
          rateLimitWindow: req.apiKey!.rateLimitWindow,
        },
      },
    });
  })
);

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: API health check
 *     tags: [API - System]
 *     security:
 *       - ApiKeyAuth: []
 *       - ApiKeyBearer: []
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         timestamp:
 *                           type: string
 *                         version:
 *                           type: string
 *       401:
 *         description: Invalid API key
 */
router.get('/health',
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: 'API is healthy',
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        application: req.application!.name,
        rateLimit: {
          limit: res.get('X-RateLimit-Limit'),
          remaining: res.get('X-RateLimit-Remaining'),
          reset: res.get('X-RateLimit-Reset'),
        },
      },
    });
  })
);

export default router;