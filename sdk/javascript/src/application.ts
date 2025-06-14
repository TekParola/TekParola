import { HttpClient } from './http';
import { Application, ApiKey, PaginatedResponse } from './types';

export class TekParolaApplication {
  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Get current application info (API endpoint)
   */
  async getCurrentInfo(): Promise<{
    application: Application;
    apiKey: ApiKey;
  }> {
    return await this.http.get('/api/applications/info');
  }

  /**
   * List all applications (admin endpoint)
   */
  async list(params?: {
    limit?: number;
    offset?: number;
    search?: string;
    isActive?: boolean;
  }): Promise<PaginatedResponse<Application>> {
    const queryParams = new URLSearchParams();
    
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());

    const query = queryParams.toString();
    return await this.http.get(`/applications${query ? `?${query}` : ''}`);
  }

  /**
   * Get application by ID (admin endpoint)
   */
  async getById(applicationId: string): Promise<Application> {
    return await this.http.get(`/applications/${applicationId}`);
  }

  /**
   * Create new application (admin endpoint)
   */
  async create(data: {
    name: string;
    displayName: string;
    description?: string;
    websiteUrl?: string;
    redirectUris: string[];
    scopes?: string[];
    tokenLifetime?: number;
    refreshTokenLifetime?: number;
  }): Promise<{
    application: Application;
    clientSecret: string;
  }> {
    return await this.http.post('/applications', data);
  }

  /**
   * Update application (admin endpoint)
   */
  async update(applicationId: string, data: {
    displayName?: string;
    description?: string;
    websiteUrl?: string;
    redirectUris?: string[];
    scopes?: string[];
    tokenLifetime?: number;
    refreshTokenLifetime?: number;
    isActive?: boolean;
  }): Promise<Application> {
    return await this.http.put(`/applications/${applicationId}`, data);
  }

  /**
   * Delete application (admin endpoint)
   */
  async delete(applicationId: string): Promise<{
    message: string;
  }> {
    return await this.http.delete(`/applications/${applicationId}`);
  }

  /**
   * Regenerate client secret (admin endpoint)
   */
  async regenerateSecret(applicationId: string): Promise<{
    clientSecret: string;
    message: string;
  }> {
    return await this.http.post(`/applications/${applicationId}/regenerate-secret`);
  }

  /**
   * List API keys for application (admin endpoint)
   */
  async listApiKeys(applicationId: string): Promise<ApiKey[]> {
    return await this.http.get(`/applications/${applicationId}/api-keys`);
  }

  /**
   * Create API key for application (admin endpoint)
   */
  async createApiKey(applicationId: string, data: {
    name: string;
    permissions: string[];
    expiresAt?: Date;
    rateLimit?: number;
    rateLimitWindow?: number;
  }): Promise<{
    apiKey: ApiKey;
    key: string;
  }> {
    return await this.http.post(`/applications/${applicationId}/api-keys`, data);
  }

  /**
   * Revoke API key (admin endpoint)
   */
  async revokeApiKey(applicationId: string, apiKeyId: string): Promise<{
    message: string;
  }> {
    return await this.http.delete(`/applications/${applicationId}/api-keys/${apiKeyId}`);
  }

  /**
   * Get application statistics (admin endpoint)
   */
  async getStatistics(applicationId: string, params?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    users: {
      total: number;
      active: number;
      new: number;
    };
    sessions: {
      total: number;
      active: number;
    };
    apiCalls: {
      total: number;
      successful: number;
      failed: number;
    };
    topEndpoints: Array<{
      endpoint: string;
      count: number;
    }>;
  }> {
    const queryParams = new URLSearchParams();
    
    if (params?.startDate) queryParams.append('startDate', params.startDate.toISOString());
    if (params?.endDate) queryParams.append('endDate', params.endDate.toISOString());

    const query = queryParams.toString();
    return await this.http.get(`/applications/${applicationId}/statistics${query ? `?${query}` : ''}`);
  }

  /**
   * Get application audit logs (admin endpoint)
   */
  async getAuditLogs(applicationId: string, params?: {
    limit?: number;
    offset?: number;
    action?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<PaginatedResponse<{
    id: string;
    userId?: string;
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
    return await this.http.get(`/applications/${applicationId}/audit-logs${query ? `?${query}` : ''}`);
  }
}