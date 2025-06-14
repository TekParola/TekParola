import { HttpClient } from './http';
import { UserProfile, SessionInfo, PaginatedResponse } from './types';

export class TekParolaUser {
  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Get current user profile
   */
  async getProfile(): Promise<UserProfile> {
    return await this.http.get('/users/me');
  }

  /**
   * Update current user profile
   */
  async updateProfile(data: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    avatar?: string;
    timezone?: string;
    language?: string;
    dateFormat?: string;
    timeFormat?: string;
  }): Promise<UserProfile> {
    return await this.http.put('/users/me', data);
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<{
    message: string;
  }> {
    return await this.http.post('/users/me/password', {
      currentPassword,
      newPassword
    });
  }

  /**
   * Get active sessions
   */
  async getSessions(): Promise<SessionInfo[]> {
    return await this.http.get('/users/me/sessions');
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(sessionId: string): Promise<{
    message: string;
  }> {
    return await this.http.delete(`/users/me/sessions/${sessionId}`);
  }

  /**
   * Revoke all sessions (except current)
   */
  async revokeAllSessions(): Promise<{
    message: string;
    revokedCount: number;
  }> {
    return await this.http.post('/users/me/sessions/revoke-all');
  }

  /**
   * Get user applications
   */
  async getApplications(): Promise<PaginatedResponse<{
    id: string;
    name: string;
    displayName: string;
    lastAccessedAt: Date;
    permissions: string[];
  }>> {
    return await this.http.get('/users/me/applications');
  }

  /**
   * Revoke application access
   */
  async revokeApplicationAccess(applicationId: string): Promise<{
    message: string;
  }> {
    return await this.http.delete(`/users/me/applications/${applicationId}`);
  }

  /**
   * Get audit logs for current user
   */
  async getAuditLogs(params?: {
    limit?: number;
    offset?: number;
    action?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<PaginatedResponse<{
    id: string;
    action: string;
    resource?: string;
    resourceId?: string;
    ipAddress: string;
    userAgent: string;
    success: boolean;
    errorMessage?: string;
    createdAt: Date;
  }>> {
    const queryParams = new URLSearchParams();
    
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.action) queryParams.append('action', params.action);
    if (params?.startDate) queryParams.append('startDate', params.startDate.toISOString());
    if (params?.endDate) queryParams.append('endDate', params.endDate.toISOString());

    const query = queryParams.toString();
    return await this.http.get(`/users/me/audit-logs${query ? `?${query}` : ''}`);
  }

  /**
   * Get user preferences
   */
  async getPreferences(): Promise<{
    notifications: {
      email: boolean;
      sms: boolean;
      push: boolean;
    };
    security: {
      twoFactorEnabled: boolean;
      sessionTimeout: number;
    };
    privacy: {
      showProfile: boolean;
      showActivity: boolean;
    };
  }> {
    return await this.http.get('/users/me/preferences');
  }

  /**
   * Update user preferences
   */
  async updatePreferences(preferences: {
    notifications?: {
      email?: boolean;
      sms?: boolean;
      push?: boolean;
    };
    security?: {
      sessionTimeout?: number;
    };
    privacy?: {
      showProfile?: boolean;
      showActivity?: boolean;
    };
  }): Promise<{
    message: string;
    preferences: any;
  }> {
    return await this.http.put('/users/me/preferences', preferences);
  }

  /**
   * Delete user account
   */
  async deleteAccount(password: string): Promise<{
    message: string;
  }> {
    return await this.http.post('/users/me/delete', { password });
  }

  /**
   * Export user data
   */
  async exportData(format: 'json' | 'csv' = 'json'): Promise<{
    downloadUrl: string;
    expiresAt: Date;
  }> {
    return await this.http.post('/users/me/export', { format });
  }

  /**
   * Get user by ID (API endpoint - requires appropriate permissions)
   */
  async getUserById(userId: string): Promise<UserProfile> {
    return await this.http.get(`/api/users/profile?user_id=${userId}`);
  }

  /**
   * Validate user credentials (API endpoint)
   */
  async validateCredentials(email: string, password: string): Promise<{
    valid: boolean;
    user?: UserProfile;
    reason?: string;
  }> {
    return await this.http.post('/api/users/validate', {
      email,
      password
    });
  }
}