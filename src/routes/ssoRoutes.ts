import { Router } from 'express';
import { ssoController } from '../controllers/ssoController';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { body, query } from 'express-validator';

const router = Router();

// Validation schemas
const initiateValidation = [
  query('client_id')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('client_id is required'),
  query('redirect_uri')
    .isURL()
    .withMessage('redirect_uri must be a valid URL'),
  query('scope')
    .optional()
    .isString()
    .withMessage('scope must be a string'),
  query('state')
    .optional()
    .isString()
    .withMessage('state must be a string'),
  query('response_type')
    .optional()
    .isIn(['code', 'token'])
    .withMessage('response_type must be either code or token'),
];

const authorizeValidation = [
  body('state')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('state is required'),
  body('authorize')
    .isBoolean()
    .withMessage('authorize must be a boolean'),
];

const tokenExchangeValidation = [
  body('grant_type')
    .equals('authorization_code')
    .withMessage('grant_type must be authorization_code'),
  body('code')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('code is required'),
  body('redirect_uri')
    .isURL()
    .withMessage('redirect_uri must be a valid URL'),
  body('client_id')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('client_id is required'),
  body('client_secret')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('client_secret is required'),
];

const refreshTokenValidation = [
  body('grant_type')
    .equals('refresh_token')
    .withMessage('grant_type must be refresh_token'),
  body('refresh_token')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('refresh_token is required'),
  body('client_id')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('client_id is required'),
];

const revokeTokenValidation = [
  body('token')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('token is required'),
  body('client_id')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('client_id is required'),
];

const introspectTokenValidation = [
  body('token')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('token is required'),
  body('client_id')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('client_id is required'),
  body('token_type_hint')
    .optional()
    .isIn(['access_token', 'refresh_token'])
    .withMessage('token_type_hint must be either access_token or refresh_token'),
];

/**
 * @swagger
 * components:
 *   schemas:
 *     SSOInitiateResponse:
 *       type: object
 *       properties:
 *         authorizationUrl:
 *           type: string
 *           format: uri
 *         state:
 *           type: string
 *     
 *     SSOTokenResponse:
 *       type: object
 *       properties:
 *         access_token:
 *           type: string
 *         refresh_token:
 *           type: string
 *         token_type:
 *           type: string
 *           example: Bearer
 *         expires_in:
 *           type: integer
 *         scope:
 *           type: array
 *           items:
 *             type: string
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             email:
 *               type: string
 *             firstName:
 *               type: string
 *             lastName:
 *               type: string
 *             roles:
 *               type: array
 *               items:
 *                 type: string
 *     
 *     SSOUserInfo:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         email:
 *           type: string
 *         username:
 *           type: string
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *         roles:
 *           type: array
 *           items:
 *             type: object
 *         isActive:
 *           type: boolean
 *         isEmailVerified:
 *           type: boolean
 */

// SSO Discovery and Metadata
/**
 * @swagger
 * /sso/.well-known/openid_configuration:
 *   get:
 *     summary: Get SSO metadata and configuration
 *     tags: [SSO]
 *     responses:
 *       200:
 *         description: SSO metadata retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 issuer:
 *                   type: string
 *                 authorization_endpoint:
 *                   type: string
 *                 token_endpoint:
 *                   type: string
 *                 userinfo_endpoint:
 *                   type: string
 */
router.get('/.well-known/openid_configuration', ssoController.getMetadata);

/**
 * @swagger
 * /sso/jwks:
 *   get:
 *     summary: Get JSON Web Key Set (JWKS)
 *     tags: [SSO]
 *     responses:
 *       200:
 *         description: JWKS retrieved successfully
 */
router.get('/jwks', ssoController.getJWKS);

// SSO Flow Endpoints

/**
 * @swagger
 * /sso/initiate:
 *   get:
 *     summary: Initiate SSO login flow
 *     tags: [SSO]
 *     parameters:
 *       - in: query
 *         name: client_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application client ID
 *       - in: query
 *         name: redirect_uri
 *         required: true
 *         schema:
 *           type: string
 *           format: uri
 *         description: Redirect URI after authorization
 *       - in: query
 *         name: scope
 *         schema:
 *           type: string
 *         description: Space-separated scopes (e.g., "profile email")
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: State parameter for CSRF protection
 *       - in: query
 *         name: response_type
 *         schema:
 *           type: string
 *           enum: [code, token]
 *         description: OAuth2 response type
 *     responses:
 *       200:
 *         description: SSO login initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/SSOInitiateResponse'
 *       400:
 *         description: Invalid parameters
 */
router.get('/initiate', initiateValidation, validateRequest, ssoController.initiateSSO);

/**
 * @swagger
 * /sso/login:
 *   get:
 *     summary: SSO login page
 *     tags: [SSO]
 *     parameters:
 *       - in: query
 *         name: client_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: redirect_uri
 *         schema:
 *           type: string
 *       - in: query
 *         name: scope
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *       - in: query
 *         name: response_type
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Login page information
 */
router.get('/login', ssoController.loginPage);

/**
 * @swagger
 * /sso/authorize:
 *   get:
 *     summary: Get authorization page
 *     tags: [SSO]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: client_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: redirect_uri
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: scope
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *       - in: query
 *         name: response_type
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Authorization page data
 *       400:
 *         description: Invalid parameters
 */
router.get('/authorize', optionalAuthenticate, ssoController.getAuthorizePage);

/**
 * @swagger
 * /sso/authorize:
 *   post:
 *     summary: Authorize user for SSO
 *     tags: [SSO]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - state
 *               - authorize
 *             properties:
 *               state:
 *                 type: string
 *                 description: State parameter from authorization request
 *               authorize:
 *                 type: boolean
 *                 description: Whether user authorizes the application
 *     responses:
 *       200:
 *         description: Authorization response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     redirectUrl:
 *                       type: string
 *       401:
 *         description: User not authenticated
 */
router.post('/authorize', authenticate, authorizeValidation, validateRequest, ssoController.authorizeUser);

/**
 * @swagger
 * /sso/token:
 *   post:
 *     summary: Exchange authorization code for tokens
 *     tags: [SSO]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - grant_type
 *               - code
 *               - redirect_uri
 *               - client_id
 *               - client_secret
 *             properties:
 *               grant_type:
 *                 type: string
 *                 enum: [authorization_code, refresh_token]
 *               code:
 *                 type: string
 *                 description: Authorization code (for authorization_code grant)
 *               redirect_uri:
 *                 type: string
 *                 format: uri
 *               client_id:
 *                 type: string
 *               client_secret:
 *                 type: string
 *               refresh_token:
 *                 type: string
 *                 description: Refresh token (for refresh_token grant)
 *     responses:
 *       200:
 *         description: Tokens exchanged successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/SSOTokenResponse'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Invalid credentials
 */
router.post('/token', (req, res, next) => {
  // Route to appropriate validation based on grant_type
  if (req.body.grant_type === 'authorization_code') {
    tokenExchangeValidation.forEach(validation => validation.run(req));
  } else if (req.body.grant_type === 'refresh_token') {
    refreshTokenValidation.forEach(validation => validation.run(req));
  }
  next();
}, validateRequest, (req, res, next) => {
  // Route to appropriate controller method
  if (req.body.grant_type === 'authorization_code') {
    return ssoController.exchangeToken(req, res, next);
  } else if (req.body.grant_type === 'refresh_token') {
    return ssoController.refreshToken(req, res, next);
  } else {
    return res.status(400).json({
      success: false,
      message: 'Unsupported grant_type',
    });
  }
});

/**
 * @swagger
 * /sso/userinfo:
 *   get:
 *     summary: Get user information
 *     tags: [SSO]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User info retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/SSOUserInfo'
 *       401:
 *         description: Invalid or missing access token
 */
router.get('/userinfo', ssoController.getUserInfo);

/**
 * @swagger
 * /sso/revoke:
 *   post:
 *     summary: Revoke access or refresh token
 *     tags: [SSO]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - client_id
 *             properties:
 *               token:
 *                 type: string
 *                 description: Access or refresh token to revoke
 *               client_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token revoked successfully
 *       400:
 *         description: Invalid request
 */
router.post('/revoke', revokeTokenValidation, validateRequest, ssoController.revokeToken);

/**
 * @swagger
 * /sso/introspect:
 *   post:
 *     summary: Introspect access or refresh token (OAuth2 RFC 7662)
 *     tags: [SSO]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - client_id
 *             properties:
 *               token:
 *                 type: string
 *                 description: Access or refresh token to introspect
 *               client_id:
 *                 type: string
 *                 description: Client ID of the requesting application
 *               token_type_hint:
 *                 type: string
 *                 enum: [access_token, refresh_token]
 *                 description: Hint about the type of token being introspected
 *     responses:
 *       200:
 *         description: Token introspection response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - active
 *               properties:
 *                 active:
 *                   type: boolean
 *                   description: Whether the token is active
 *                 scope:
 *                   type: string
 *                   description: Space-separated list of scopes
 *                 client_id:
 *                   type: string
 *                   description: Client ID the token was issued to
 *                 username:
 *                   type: string
 *                   description: Human-readable identifier for the user
 *                 token_type:
 *                   type: string
 *                   enum: [access_token, refresh_token]
 *                 exp:
 *                   type: integer
 *                   description: Token expiration timestamp
 *                 iat:
 *                   type: integer
 *                   description: Token issued at timestamp
 *                 sub:
 *                   type: string
 *                   description: Subject identifier (user ID)
 *                 aud:
 *                   type: string
 *                   description: Audience (client ID)
 *                 iss:
 *                   type: string
 *                   description: Issuer
 *                 jti:
 *                   type: string
 *                   description: JWT ID
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   enum: [invalid_request, invalid_client]
 *                 error_description:
 *                   type: string
 *       401:
 *         description: Unauthorized client
 */
router.post('/introspect', introspectTokenValidation, validateRequest, ssoController.introspectToken);

/**
 * @swagger
 * /sso/logout:
 *   get:
 *     summary: SSO logout
 *     tags: [SSO]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: post_logout_redirect_uri
 *         schema:
 *           type: string
 *           format: uri
 *         description: URI to redirect to after logout
 *       - in: query
 *         name: client_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Logout completed successfully
 */
router.get('/logout', optionalAuthenticate, ssoController.logout);

export default router;