import { Application } from '@prisma/client';
import { prisma } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { NotFoundError, ValidationError, AuthenticationError } from '../utils/errors';
import { jwtService } from '../utils/jwt';
import { userService } from './userService';
import { applicationService } from './applicationService';
import { auditService } from './auditService';
import crypto from 'crypto';

export interface SSOLoginRequest {
  apiKey: string;
  redirectUri: string;
  state?: string;
  scope?: string[];
  responseType?: 'code' | 'token';
}

export interface SSOTokenRequest {
  apiKey: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  grantType: 'authorization_code';
}

export interface SSOTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string[];
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
  };
}

export interface SSOUserInfo {
  id: string;
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  avatar?: string;
  timezone?: string;
  language?: string;
  roles: Array<{
    id: string;
    name: string;
    displayName: string;
    permissions: Array<{
      id: string;
      name: string;
      resource: string;
      action: string;
    }>;
  }>;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
}

export interface SSOAuthorizationCode {
  code: string;
  applicationId: string;
  userId: string;
  redirectUri: string;
  scope: string[];
  state?: string;
  expiresAt: Date;
  used: boolean;
}

export class SSOService {
  private readonly CODE_TTL = 600; // 10 minutes
  private readonly TOKEN_TTL = 3600; // 1 hour
  private readonly REFRESH_TOKEN_TTL = 86400 * 30; // 30 days

  async initiateSSO(request: SSOLoginRequest, userAgent: string, ipAddress: string): Promise<{
    authorizationUrl: string;
    state: string;
  }> {
    try {
      // Validate API key and get application
      const application = await applicationService.validateApiKey(request.apiKey);
      if (!application.isActive) {
        throw new ValidationError('Application is not active');
      }

      // Validate redirect URI
      if (!application.redirectUris.includes(request.redirectUri)) {
        throw new ValidationError('Invalid redirect URI');
      }

      // Validate scope
      const requestedScopes = request.scope || ['profile'];
      const validScopes = ['profile', 'email', 'roles', 'permissions'];
      const invalidScopes = requestedScopes.filter(scope => !validScopes.includes(scope));
      if (invalidScopes.length > 0) {
        throw new ValidationError(`Invalid scopes: ${invalidScopes.join(', ')}`);
      }

      // Generate state if not provided
      const state = request.state || this.generateState();

      // Store SSO session data
      const sessionData = {
        applicationId: application.id,
        redirectUri: request.redirectUri,
        scope: requestedScopes,
        state,
        responseType: request.responseType || 'code',
        userAgent,
        ipAddress,
        createdAt: new Date(),
      };

      await this.storeSSOSession(state, sessionData);

      // Build authorization URL
      const authUrl = new URL('/sso/authorize', process.env.BASE_URL || 'http://localhost:3000');
      authUrl.searchParams.set('client_id', application.clientId);
      authUrl.searchParams.set('redirect_uri', request.redirectUri);
      authUrl.searchParams.set('scope', requestedScopes.join(' '));
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('response_type', request.responseType || 'code');

      // Log SSO initiation
      await auditService.log({
        action: 'sso_initiate',
        resource: 'sso',
        resourceId: application.id,
        details: {
          applicationName: application.name,
          redirectUri: request.redirectUri,
          scope: requestedScopes,
        },
        ipAddress,
        userAgent,
        success: true,
      });

      return {
        authorizationUrl: authUrl.toString(),
        state,
      };
    } catch (error) {
      logger.error('Failed to initiate SSO:', error);
      throw error;
    }
  }

  async authorizeUser(
    state: string,
    userId: string,
    userAgent: string,
    ipAddress: string
  ): Promise<{ redirectUrl: string }> {
    try {
      // Get SSO session data
      const sessionData = await this.getSSOSession(state);
      if (!sessionData) {
        throw new ValidationError('Invalid or expired SSO session');
      }

      // Validate user
      const user = await userService.findById(userId);
      if (!user || !user.isActive) {
        throw new AuthenticationError('User not found or inactive');
      }

      // Get application
      const application = await applicationService.findById(sessionData.applicationId);
      if (!application) {
        throw new NotFoundError('Application not found');
      }

      // Check if user has permission to access this application
      const hasAccess = await this.checkUserApplicationAccess(userId, application.id);
      if (!hasAccess) {
        throw new ValidationError('User does not have access to this application');
      }

      let redirectUrl: string;

      if (sessionData.responseType === 'token') {
        // Implicit flow - return access token directly
        const tokens = await this.generateTokens(user, application, sessionData.scope);
        
        const urlWithToken = new URL(sessionData.redirectUri);
        urlWithToken.hash = `access_token=${tokens.accessToken}&token_type=Bearer&expires_in=${tokens.expiresIn}&scope=${sessionData.scope.join(' ')}&state=${state}`;
        redirectUrl = urlWithToken.toString();
      } else {
        // Authorization code flow
        const authCode = await this.generateAuthorizationCode(
          userId,
          application.id,
          sessionData.redirectUri,
          sessionData.scope,
          state
        );

        const urlWithCode = new URL(sessionData.redirectUri);
        urlWithCode.searchParams.set('code', authCode);
        urlWithCode.searchParams.set('state', state);
        redirectUrl = urlWithCode.toString();
      }

      // Clean up SSO session
      await this.deleteSSOSession(state);

      // Log successful authorization
      await auditService.log({
        userId,
        action: 'sso_authorize',
        resource: 'sso',
        resourceId: application.id,
        details: {
          applicationName: application.name,
          responseType: sessionData.responseType,
          scope: sessionData.scope,
        },
        ipAddress,
        userAgent,
        success: true,
      });

      return { redirectUrl };
    } catch (error) {
      logger.error('Failed to authorize SSO user:', error);
      throw error;
    }
  }

  async exchangeCodeForTokens(request: SSOTokenRequest): Promise<SSOTokenResponse> {
    try {
      // Validate API key and client secret
      const application = await applicationService.validateApiKey(request.apiKey);
      if (!application.isActive) {
        throw new ValidationError('Application is not active');
      }

      if (!await applicationService.validateClientSecret(application.id, request.clientSecret)) {
        throw new AuthenticationError('Invalid client secret');
      }

      // Get and validate authorization code
      const authCode = await this.getAuthorizationCode(request.code);
      if (!authCode) {
        throw new ValidationError('Invalid or expired authorization code');
      }

      if (authCode.applicationId !== application.id) {
        throw new ValidationError('Authorization code belongs to different application');
      }

      if (authCode.redirectUri !== request.redirectUri) {
        throw new ValidationError('Redirect URI mismatch');
      }

      if (authCode.used) {
        throw new ValidationError('Authorization code has already been used');
      }

      if (new Date() > authCode.expiresAt) {
        throw new ValidationError('Authorization code has expired');
      }

      // Mark code as used
      await this.markAuthorizationCodeAsUsed(request.code);

      // Get user
      const user = await userService.findWithRoles(authCode.userId);
      if (!user || !user.isActive) {
        throw new AuthenticationError('User not found or inactive');
      }

      // Generate tokens
      const tokens = await this.generateTokens(user, application, authCode.scope);

      // Log successful token exchange
      await auditService.log({
        userId: user.id,
        applicationId: application.id,
        action: 'sso_token_exchange',
        resource: 'sso',
        resourceId: application.id,
        details: {
          applicationName: application.name,
          scope: authCode.scope,
        },
        success: true,
      });

      return tokens;
    } catch (error) {
      logger.error('Failed to exchange code for tokens:', error);
      throw error;
    }
  }

  async getUserInfo(accessToken: string): Promise<SSOUserInfo> {
    try {
      // Verify and decode token
      const decoded = jwtService.verifyAccessToken(accessToken);
      
      // Get user with roles and permissions
      const user = await userService.findWithRoles(decoded.userId);
      if (!user || !user.isActive) {
        throw new AuthenticationError('User not found or inactive');
      }

      // Format user info
      const userInfo: SSOUserInfo = {
        id: user.id,
        email: user.email,
        username: user.username ?? undefined,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber ?? undefined,
        avatar: user.avatar ?? undefined,
        timezone: user.timezone,
        language: user.language,
        roles: (user as any).roles?.map((ur: any) => ({
          id: ur.role.id,
          name: ur.role.name,
          displayName: ur.role.displayName,
          permissions: ur.role.permissions?.map((rp: any) => ({
            id: rp.permission.id,
            name: rp.permission.name,
            resource: rp.permission.resource,
            action: rp.permission.action,
          })) || [],
        })) || [],
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        lastLoginAt: user.lastLoginAt ?? undefined,
        createdAt: user.createdAt,
      };

      return userInfo;
    } catch (error) {
      logger.error('Failed to get user info:', error);
      throw new AuthenticationError('Invalid access token');
    }
  }

  async refreshAccessToken(refreshToken: string, apiKey: string): Promise<SSOTokenResponse> {
    try {
      // Validate API key
      const application = await applicationService.validateApiKey(apiKey);
      if (!application.isActive) {
        throw new ValidationError('Application is not active');
      }

      // Verify refresh token
      const decoded = jwtService.verifyRefreshToken(refreshToken);
      
      // Get user session
      const session = await prisma.userSession.findUnique({
        where: { sessionToken: decoded.sessionId },
        include: { user: true },
      });

      if (!session || !session.isActive || session.applicationId !== application.id) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Generate new access token
      const accessTokenPair = jwtService.generateTokenPair(
        session.userId,
        session.user.email,
        session.sessionToken
      );

      const response: SSOTokenResponse = {
        accessToken: accessTokenPair.accessToken,
        refreshToken: refreshToken, // Keep the same refresh token
        tokenType: 'Bearer',
        expiresIn: this.TOKEN_TTL,
        scope: ['profile'], // Default scope for refresh
      };

      // Log token refresh
      await auditService.log({
        userId: session.userId,
        applicationId: application.id,
        action: 'sso_token_refresh',
        resource: 'sso',
        resourceId: application.id,
        details: {
          applicationName: application.name,
        },
        success: true,
      });

      return response;
    } catch (error) {
      logger.error('Failed to refresh access token:', error);
      throw new AuthenticationError('Invalid refresh token');
    }
  }

  async revokeToken(token: string, apiKey: string): Promise<void> {
    try {
      // Validate API key
      const application = await applicationService.validateApiKey(apiKey);
      
      // Verify token
      const decoded = jwtService.verifyAccessToken(token);
      
      // Revoke session if it belongs to this application
      const session = await prisma.userSession.findUnique({
        where: { sessionToken: decoded.sessionId },
      });

      if (session && session.applicationId === application.id) {
        await userService.revokeUserSession(session.userId, session.sessionToken);
      }

      // Add token to blacklist
      await redisClient.setEx(`blacklist:${token}`, this.TOKEN_TTL, 'revoked');

      logger.info(`Token revoked for application: ${application.name}`);
    } catch (error) {
      logger.error('Failed to revoke token:', error);
      throw error;
    }
  }

  async introspectToken(token: string, apiKey: string, tokenTypeHint?: string): Promise<{
    active: boolean;
    scope?: string;
    client_id?: string;
    username?: string;
    token_type?: string;
    exp?: number;
    iat?: number;
    sub?: string;
    aud?: string;
    iss?: string;
    jti?: string;
  }> {
    try {
      // Validate API key
      const application = await applicationService.validateApiKey(apiKey);
      
      // Check if token is blacklisted
      const isBlacklisted = await redisClient.get(`blacklist:${token}`);
      if (isBlacklisted) {
        return { active: false };
      }

      let decoded: any;
      let tokenType: 'access_token' | 'refresh_token' = 'access_token';

      // Try to verify token based on hint or try both types
      try {
        if (tokenTypeHint === 'refresh_token') {
          decoded = jwtService.verifyRefreshToken(token);
          tokenType = 'refresh_token';
        } else {
          // Default to access token or try access token first
          try {
            decoded = jwtService.verifyAccessToken(token);
            tokenType = 'access_token';
          } catch (accessTokenError) {
            // If access token verification fails, try refresh token
            decoded = jwtService.verifyRefreshToken(token);
            tokenType = 'refresh_token';
          }
        }
      } catch (verifyError) {
        // Token is invalid or expired
        return { active: false };
      }

      // Check if the session is still active
      const session = await prisma.userSession.findUnique({
        where: { 
          sessionToken: decoded.sessionId,
          isActive: true,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              isActive: true,
              roles: {
                include: {
                  role: {
                    select: { name: true }
                  }
                }
              }
            }
          }
        }
      });

      if (!session || !session.user?.isActive) {
        return { active: false };
      }

      // For refresh tokens, check if they belong to the requesting application
      if (tokenType === 'refresh_token' && session.applicationId !== application.id) {
        return { active: false };
      }

      // Get user scopes based on their roles and permissions
      const userRoles = session.user.roles?.map(ur => ur.role.name) || [];
      const scopes = ['profile']; // Base scope
      
      if (userRoles.includes('admin') || userRoles.includes('super_admin')) {
        scopes.push('admin');
      }
      
      if (session.user.email) {
        scopes.push('email');
      }
      
      scopes.push('roles', 'permissions');

      // Construct introspection response according to RFC 7662
      const introspectionResponse = {
        active: true,
        scope: scopes.join(' '),
        client_id: application.clientId,
        username: session.user.username || session.user.email,
        token_type: tokenType,
        exp: decoded.exp,
        iat: decoded.iat,
        sub: session.user.id,
        aud: application.clientId,
        iss: process.env.BASE_URL || 'http://localhost:3000',
        jti: decoded.jti,
      };

      // Log introspection for audit
      await auditService.log({
        userId: session.user.id,
        action: 'token_introspect',
        resource: 'token',
        resourceId: tokenType,
        details: {
          clientId: application.clientId,
          tokenType,
          active: true,
        },
        ipAddress: '0.0.0.0', // This should be passed from the request
        userAgent: 'OAuth2 Client',
      });

      return introspectionResponse;
    } catch (error) {
      logger.error('Token introspection failed:', error);
      
      // Always return inactive for any error to avoid information leakage
      return { active: false };
    }
  }

  private async generateTokens(
    user: any,
    application: Application,
    scope: string[]
  ): Promise<SSOTokenResponse> {
    // Create user session for this application
    const session = await userService.createSession({
      userId: user.id,
      applicationId: application.id,
      ipAddress: '0.0.0.0', // Will be updated by the calling function
      userAgent: 'SSO Client',
      expiresAt: new Date(Date.now() + this.REFRESH_TOKEN_TTL * 1000),
    });

    // Generate JWT tokens
    const tokens = jwtService.generateTokenPair(user.id, user.email, session.sessionToken);

    const response: SSOTokenResponse = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.TOKEN_TTL,
      scope,
    };

    // Include user info if profile scope is requested
    if (scope.includes('profile')) {
      response.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: (user as any).roles?.map((ur: any) => ur.role.name) || [],
      };
    }

    return response;
  }

  private async generateAuthorizationCode(
    userId: string,
    applicationId: string,
    redirectUri: string,
    scope: string[],
    state?: string
  ): Promise<string> {
    const code = this.generateRandomCode();
    const expiresAt = new Date(Date.now() + this.CODE_TTL * 1000);

    const authCodeData: SSOAuthorizationCode = {
      code,
      applicationId,
      userId,
      redirectUri,
      scope,
      state,
      expiresAt,
      used: false,
    };

    await redisClient.setEx(
      `auth_code:${code}`,
      this.CODE_TTL,
      JSON.stringify(authCodeData)
    );

    return code;
  }

  private async getAuthorizationCode(code: string): Promise<SSOAuthorizationCode | null> {
    try {
      const data = await redisClient.get(`auth_code:${code}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get authorization code:', error);
      return null;
    }
  }

  private async markAuthorizationCodeAsUsed(code: string): Promise<void> {
    const authCode = await this.getAuthorizationCode(code);
    if (authCode) {
      authCode.used = true;
      await redisClient.setEx(
        `auth_code:${code}`,
        this.CODE_TTL,
        JSON.stringify(authCode)
      );
    }
  }

  private async storeSSOSession(state: string, data: any): Promise<void> {
    await redisClient.setEx(`sso_session:${state}`, 1800, JSON.stringify(data)); // 30 minutes
  }

  private async getSSOSession(state: string): Promise<any | null> {
    try {
      const data = await redisClient.get(`sso_session:${state}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get SSO session:', error);
      return null;
    }
  }

  private async deleteSSOSession(state: string): Promise<void> {
    await redisClient.del(`sso_session:${state}`);
  }

  private async checkUserApplicationAccess(userId: string, _applicationId: string): Promise<boolean> {
    // Check if user has specific access to this application
    // This can be extended based on business requirements
    const user = await userService.findById(userId);
    return user?.isActive || false;
  }

  private generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private generateRandomCode(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

export const ssoService = new SSOService();