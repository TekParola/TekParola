export interface TekParolaConfig {
  baseUrl: string;
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  timeout?: number;
  retryAttempts?: number;
  debug?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface TwoFactorCredentials {
  tempToken: string;
  code: string;
}

export interface MagicLinkRequest {
  email: string;
  redirectUrl?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  avatar?: string;
  timezone?: string;
  language?: string;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  roles?: UserRole[];
}

export interface UserRole {
  id: string;
  name: string;
  displayName: string;
  assignedAt: Date;
}

export interface Application {
  id: string;
  name: string;
  displayName: string;
  clientId: string;
  scopes: string[];
  redirectUris: string[];
  tokenLifetime: number;
  refreshTokenLifetime: number;
}

export interface ApiKey {
  id: string;
  keyId: string;
  name: string;
  permissions: string[];
  expiresAt?: Date;
  rateLimit?: number;
  rateLimitWindow?: number;
}

export interface SSOInitRequest {
  applicationId: string;
  redirectUri: string;
  state?: string;
  scope?: string;
  prompt?: 'none' | 'login' | 'consent';
}

export interface SSOAuthorizationResponse {
  authorizationUrl: string;
  state: string;
}

export interface SSOTokenExchangeRequest {
  code: string;
  state?: string;
  verifier?: string;
}

export interface UserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  given_name: string;
  family_name: string;
  phone_number?: string;
  picture?: string;
  locale?: string;
  zoneinfo?: string;
  updated_at: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ErrorResponse {
  success: false;
  message: string;
  error?: string;
  code?: string;
  details?: any;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
}

export interface SessionInfo {
  id: string;
  ipAddress: string;
  userAgent: string;
  country?: string;
  city?: string;
  device?: string;
  browser?: string;
  os?: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
}