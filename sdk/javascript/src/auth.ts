import { HttpClient } from './http';
import { 
  TekParolaConfig,
  AuthTokens,
  LoginCredentials,
  TwoFactorCredentials,
  MagicLinkRequest,
  UserProfile,
  SSOInitRequest,
  SSOAuthorizationResponse,
  SSOTokenExchangeRequest,
  UserInfo
} from './types';
import { ValidationError } from './errors';

export class TekParolaAuth {
  private http: HttpClient;
  private config: TekParolaConfig;

  constructor(http: HttpClient, config: TekParolaConfig) {
    this.http = http;
    this.config = config;
  }

  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<{
    tokens: AuthTokens;
    user: UserProfile;
    requiresTwoFactor?: boolean;
    tempToken?: string;
  }> {
    const response = await this.http.post('/auth/login', credentials);
    
    if (response.requiresTwoFactor) {
      return {
        tokens: {} as AuthTokens,
        user: {} as UserProfile,
        requiresTwoFactor: true,
        tempToken: response.tempToken
      };
    }

    // Set the access token for future requests
    this.http.setAccessToken(response.tokens.accessToken);

    return response;
  }

  /**
   * Complete two-factor authentication
   */
  async verifyTwoFactor(credentials: TwoFactorCredentials): Promise<{
    tokens: AuthTokens;
    user: UserProfile;
  }> {
    const response = await this.http.post('/auth/two-factor/verify', credentials);
    
    // Set the access token for future requests
    this.http.setAccessToken(response.tokens.accessToken);

    return response;
  }

  /**
   * Request a magic link
   */
  async requestMagicLink(request: MagicLinkRequest): Promise<{
    message: string;
    expiresIn: number;
  }> {
    return await this.http.post('/auth/magic-link/request', request);
  }

  /**
   * Verify a magic link token
   */
  async verifyMagicLink(token: string): Promise<{
    tokens: AuthTokens;
    user: UserProfile;
  }> {
    const response = await this.http.post('/auth/magic-link/verify', { token });
    
    // Set the access token for future requests
    this.http.setAccessToken(response.tokens.accessToken);

    return response;
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const response = await this.http.post('/auth/refresh', { refreshToken });
    
    // Set the new access token for future requests
    this.http.setAccessToken(response.accessToken);

    return response;
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    try {
      await this.http.post('/auth/logout');
    } finally {
      // Clear the access token
      this.http.setAccessToken(undefined);
    }
  }

  /**
   * Register a new user
   */
  async register(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
  }): Promise<{
    user: UserProfile;
    requiresEmailVerification: boolean;
  }> {
    return await this.http.post('/auth/register', userData);
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<{
    message: string;
    expiresIn: number;
  }> {
    return await this.http.post('/auth/password/reset-request', { email });
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<{
    message: string;
  }> {
    return await this.http.post('/auth/password/reset', {
      token,
      newPassword
    });
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<{
    message: string;
    user: UserProfile;
  }> {
    return await this.http.post('/auth/email/verify', { token });
  }

  /**
   * Resend email verification
   */
  async resendEmailVerification(email: string): Promise<{
    message: string;
    expiresIn: number;
  }> {
    return await this.http.post('/auth/email/resend-verification', { email });
  }

  /**
   * Initialize SSO flow
   */
  async initSSO(request: SSOInitRequest): Promise<SSOAuthorizationResponse> {
    if (!this.config.clientId) {
      throw new ValidationError('clientId is required for SSO operations');
    }

    return await this.http.post('/sso/authorize', {
      ...request,
      clientId: this.config.clientId
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(request: SSOTokenExchangeRequest): Promise<AuthTokens> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new ValidationError('clientId and clientSecret are required for token exchange');
    }

    const response = await this.http.post('/sso/token', {
      ...request,
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      grantType: 'authorization_code'
    });

    // Set the access token for future requests
    this.http.setAccessToken(response.accessToken);

    return response;
  }

  /**
   * Get user info from access token
   */
  async getUserInfo(accessToken?: string): Promise<UserInfo> {
    const token = accessToken || this.http['accessToken'];
    if (!token) {
      throw new ValidationError('Access token is required');
    }

    const originalToken = this.http['accessToken'];
    if (accessToken) {
      this.http.setAccessToken(accessToken);
    }

    try {
      return await this.http.get('/sso/userinfo');
    } finally {
      if (accessToken) {
        this.http.setAccessToken(originalToken);
      }
    }
  }

  /**
   * Validate an access token (API endpoint)
   */
  async validateToken(accessToken: string): Promise<{
    valid: boolean;
    user?: UserInfo;
    error?: string;
  }> {
    return await this.http.post('/api/sso/validate-token', {
      access_token: accessToken
    });
  }

  /**
   * Enable two-factor authentication
   */
  async enableTwoFactor(): Promise<{
    secret: string;
    qrCode: string;
    backupCodes: string[];
  }> {
    return await this.http.post('/auth/two-factor/enable');
  }

  /**
   * Disable two-factor authentication
   */
  async disableTwoFactor(code: string): Promise<{
    message: string;
  }> {
    return await this.http.post('/auth/two-factor/disable', { code });
  }

  /**
   * Generate new backup codes
   */
  async regenerateBackupCodes(code: string): Promise<{
    backupCodes: string[];
  }> {
    return await this.http.post('/auth/two-factor/regenerate-backup-codes', { code });
  }
}