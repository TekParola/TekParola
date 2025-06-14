import { Request, Response } from 'express';
import { ssoService } from '../services/ssoService';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError, AuthenticationError } from '../utils/errors';
import { applicationService } from '../services/applicationService';

export class SSOController {
  // Initiate SSO login flow
  initiateSSO = asyncHandler(async (req: Request, res: Response) => {
    const {
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      response_type: responseType,
    } = req.query;

    if (!clientId || !redirectUri) {
      throw new ValidationError('client_id and redirect_uri are required');
    }

    // Get API key from client_id
    const application = await applicationService.findByClientId(clientId as string);
    if (!application) {
      throw new ValidationError('Invalid client_id');
    }

    const apiKey = application.apiKeys?.find(key => key.isActive)?.keyId;
    if (!apiKey) {
      throw new ValidationError('No active API key found for application');
    }

    const scopeArray = scope ? (scope as string).split(' ') : ['profile'];
    const userAgent = req.get('User-Agent') || 'Unknown';
    const ipAddress = req.ip || '0.0.0.0';

    const result = await ssoService.initiateSSO({
      apiKey,
      redirectUri: redirectUri as string,
      state: state as string,
      scope: scopeArray,
      responseType: (responseType as 'code' | 'token') || 'code',
    }, userAgent, ipAddress);

    res.status(200).json({
      success: true,
      message: 'SSO login initiated successfully',
      data: result,
    });
  });

  // Authorization page (GET)
  getAuthorizePage = asyncHandler(async (req: Request, res: Response) => {
    const {
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      response_type: responseType,
    } = req.query;

    if (!clientId || !redirectUri) {
      throw new ValidationError('client_id and redirect_uri are required');
    }

    // Get application details for display
    const application = await applicationService.findByClientId(clientId as string);
    if (!application) {
      throw new ValidationError('Invalid client_id');
    }

    // For demo purposes, returning JSON. In production, this would render an HTML page
    res.status(200).json({
      success: true,
      message: 'Authorization page',
      data: {
        application: {
          name: application.name,
          description: application.description,
          logo: application.logo,
          website: application.website,
        },
        authorization: {
          clientId,
          redirectUri,
          scope: scope ? (scope as string).split(' ') : ['profile'],
          state,
          responseType: responseType || 'code',
        },
        user: req.user ? {
          id: req.user.id,
          email: req.user.email,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
        } : null,
      },
    });
  });

  // User authorization (POST)
  authorizeUser = asyncHandler(async (req: Request, res: Response) => {
    const { state, authorize } = req.body;

    if (!state) {
      throw new ValidationError('state is required');
    }

    if (!req.user) {
      throw new AuthenticationError('User must be authenticated');
    }

    if (!authorize) {
      // User denied authorization
      return res.status(200).json({
        success: false,
        message: 'User denied authorization',
        data: {
          error: 'access_denied',
          state,
        },
      });
    }

    const userAgent = req.get('User-Agent') || 'Unknown';
    const ipAddress = req.ip || '0.0.0.0';

    const result = await ssoService.authorizeUser(
      state,
      req.user.id,
      userAgent,
      ipAddress
    );

    return res.status(200).json({
      success: true,
      message: 'User authorized successfully',
      data: result,
    });
  });

  // Token exchange endpoint
  exchangeToken = asyncHandler(async (req: Request, res: Response) => {
    const {
      grant_type: grantType,
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    } = req.body;

    if (grantType !== 'authorization_code') {
      throw new ValidationError('Only authorization_code grant type is supported');
    }

    if (!code || !redirectUri || !clientId || !clientSecret) {
      throw new ValidationError('code, redirect_uri, client_id, and client_secret are required');
    }

    // Get API key from client_id
    const application = await applicationService.findByClientId(clientId);
    if (!application) {
      throw new ValidationError('Invalid client_id');
    }

    const apiKey = application.apiKeys?.find(key => key.isActive)?.keyId;
    if (!apiKey) {
      throw new ValidationError('No active API key found for application');
    }

    const tokens = await ssoService.exchangeCodeForTokens({
      apiKey,
      clientSecret,
      code,
      redirectUri,
      grantType: 'authorization_code',
    });

    res.status(200).json({
      success: true,
      message: 'Tokens exchanged successfully',
      data: tokens,
    });
  });

  // Get user info
  getUserInfo = asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Bearer token required');
    }

    const accessToken = authHeader.substring(7);
    const userInfo = await ssoService.getUserInfo(accessToken);

    res.status(200).json({
      success: true,
      message: 'User info retrieved successfully',
      data: userInfo,
    });
  });

  // Refresh access token
  refreshToken = asyncHandler(async (req: Request, res: Response) => {
    const {
      grant_type: grantType,
      refresh_token: refreshToken,
      client_id: clientId,
    } = req.body;

    if (grantType !== 'refresh_token') {
      throw new ValidationError('Only refresh_token grant type is supported');
    }

    if (!refreshToken || !clientId) {
      throw new ValidationError('refresh_token and client_id are required');
    }

    // Get API key from client_id
    const application = await applicationService.findByClientId(clientId);
    if (!application) {
      throw new ValidationError('Invalid client_id');
    }

    const apiKey = application.apiKeys?.find(key => key.isActive)?.keyId;
    if (!apiKey) {
      throw new ValidationError('No active API key found for application');
    }

    const tokens = await ssoService.refreshAccessToken(refreshToken, apiKey);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: tokens,
    });
  });

  // Revoke token
  revokeToken = asyncHandler(async (req: Request, res: Response) => {
    const { token, client_id: clientId } = req.body;

    if (!token || !clientId) {
      throw new ValidationError('token and client_id are required');
    }

    // Get API key from client_id
    const application = await applicationService.findByClientId(clientId);
    if (!application) {
      throw new ValidationError('Invalid client_id');
    }

    const apiKey = application.apiKeys?.find(key => key.isActive)?.keyId;
    if (!apiKey) {
      throw new ValidationError('No active API key found for application');
    }

    await ssoService.revokeToken(token, apiKey);

    res.status(200).json({
      success: true,
      message: 'Token revoked successfully',
    });
  });

  // Get SSO metadata/configuration (OAuth2/OpenID Connect Discovery)
  getMetadata = asyncHandler(async (req: Request, res: Response) => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    
    // Return standard OAuth2/OpenID Connect discovery document
    const metadata = {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/sso/authorize`,
      token_endpoint: `${baseUrl}/sso/token`,
      userinfo_endpoint: `${baseUrl}/sso/userinfo`,
      revocation_endpoint: `${baseUrl}/sso/revoke`,
      introspection_endpoint: `${baseUrl}/sso/introspect`,
      jwks_uri: `${baseUrl}/sso/jwks`,
      end_session_endpoint: `${baseUrl}/sso/logout`,
      response_types_supported: ['code', 'token', 'id_token', 'code id_token', 'code token', 'id_token token', 'code id_token token'],
      response_modes_supported: ['query', 'fragment', 'form_post'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      introspection_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      revocation_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      scopes_supported: ['openid', 'profile', 'email', 'roles', 'permissions', 'admin', 'offline_access'],
      claims_supported: [
        'sub',
        'iss',
        'aud',
        'exp',
        'iat',
        'auth_time',
        'nonce',
        'email',
        'email_verified',
        'name',
        'given_name',
        'family_name',
        'phone_number',
        'phone_number_verified',
        'picture',
        'locale',
        'zoneinfo',
        'updated_at',
        'preferred_username',
        'roles',
        'permissions',
        'groups',
      ],
      claim_types_supported: ['normal'],
      claims_parameter_supported: false,
      request_parameter_supported: false,
      request_uri_parameter_supported: false,
      require_request_uri_registration: false,
      code_challenge_methods_supported: ['S256', 'plain'],
      userinfo_signing_alg_values_supported: ['none'],
      display_values_supported: ['page'],
      ui_locales_supported: ['en-US', 'en'],
      service_documentation: `${baseUrl}/api/docs`,
      op_policy_uri: `${baseUrl}/privacy`,
      op_tos_uri: `${baseUrl}/terms`,
    };

    // Set proper content type for discovery document
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    // Return discovery document directly (not wrapped in success/data structure)
    res.status(200).json(metadata);
  });

  // JWKS endpoint for public keys
  getJWKS = asyncHandler(async (req: Request, res: Response) => {
    // In a production environment, you would return your actual public keys
    // For now, returning a placeholder structure
    const jwks = {
      keys: [
        {
          kty: 'RSA',
          use: 'sig',
          kid: 'tekparola-sso-key',
          alg: 'RS256',
          // In production, include actual public key components (n, e)
          n: 'placeholder_modulus',
          e: 'AQAB',
        },
      ],
    };

    res.status(200).json(jwks);
  });

  // SSO login page (for direct access)
  loginPage = asyncHandler(async (req: Request, res: Response) => {
    const {
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      response_type: responseType,
    } = req.query;

    // For demo purposes, returning instructions
    // In production, this would render an HTML login page
    res.status(200).json({
      success: true,
      message: 'SSO Login Page',
      data: {
        instructions: 'This endpoint would typically render an HTML login page',
        parameters: {
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: scope || 'profile',
          state,
          response_type: responseType || 'code',
        },
        flow: [
          '1. User logs in with username/password',
          '2. System authenticates user',
          '3. User is redirected to authorization page',
          '4. User approves/denies access',
          '5. System redirects back to client application',
        ],
      },
    });
  });

  // Token introspection endpoint (OAuth2 RFC 7662)
  introspectToken = asyncHandler(async (req: Request, res: Response) => {
    const { token, token_type_hint, client_id: clientId } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing token parameter',
      });
    }

    if (!clientId) {
      return res.status(400).json({
        error: 'invalid_client',
        error_description: 'Missing client_id parameter',
      });
    }

    try {
      // Get application to verify client credentials
      const application = await applicationService.findByClientId(clientId);
      if (!application) {
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'Invalid client credentials',
        });
      }

      const apiKey = application.apiKeys?.find(key => key.isActive)?.keyId;
      if (!apiKey) {
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'No active API key found for client',
        });
      }

      // Introspect the token
      const introspectionResult = await ssoService.introspectToken(token, apiKey, token_type_hint);

      // Return standard OAuth2 introspection response
      return res.status(200).json(introspectionResult);
    } catch (error) {
      logger.error('Token introspection failed:', error);
      
      // Return inactive token response for any error
      return res.status(200).json({
        active: false,
      });
    }
  });

  // Logout endpoint
  logout = asyncHandler(async (req: Request, res: Response) => {
    const { 
      post_logout_redirect_uri: postLogoutRedirectUri,
      client_id: _clientId,
      state,
    } = req.query;

    // If user is authenticated, log them out
    if (req.user && req.sessionId) {
      try {
        const { userService } = await import('../services/userService');
        await userService.revokeUserSession(req.user.id, req.sessionId);
      } catch (error) {
        logger.warn('Failed to revoke session during SSO logout:', error);
      }
    }

    const logoutData: any = {
      message: 'Logged out successfully',
      state,
    };

    if (postLogoutRedirectUri) {
      logoutData.redirectUri = postLogoutRedirectUri;
    }

    res.status(200).json({
      success: true,
      message: 'SSO logout completed',
      data: logoutData,
    });
  });
}

export const ssoController = new SSOController();