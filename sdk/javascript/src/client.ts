import { HttpClient } from './http';
import { TekParolaAuth } from './auth';
import { TekParolaUser } from './user';
import { TekParolaApplication } from './application';
import { TekParolaConfig } from './types';
import { ValidationError } from './errors';

export class TekParolaClient {
  private http: HttpClient;
  public auth: TekParolaAuth;
  public user: TekParolaUser;
  public application: TekParolaApplication;

  constructor(config: TekParolaConfig) {
    this.validateConfig(config);

    this.http = new HttpClient(
      config.baseUrl,
      config.timeout || 30000,
      config.debug || false
    );

    // Set authentication method
    if (config.apiKey) {
      this.http.setApiKey(config.apiKey);
    }

    // Initialize modules
    this.auth = new TekParolaAuth(this.http, config);
    this.user = new TekParolaUser(this.http);
    this.application = new TekParolaApplication(this.http);
  }

  /**
   * Set the access token for authenticated requests
   */
  setAccessToken(token: string): void {
    this.http.setAccessToken(token);
  }

  /**
   * Clear the access token
   */
  clearAccessToken(): void {
    this.http.setAccessToken(undefined);
  }

  /**
   * Set the API key for API requests
   */
  setApiKey(key: string): void {
    this.http.setApiKey(key);
  }

  /**
   * Clear the API key
   */
  clearApiKey(): void {
    this.http.setApiKey(undefined);
  }

  /**
   * Get the current configuration
   */
  getConfig(): TekParolaConfig {
    return {
      baseUrl: this.http['axios'].defaults.baseURL || '',
      timeout: this.http['axios'].defaults.timeout,
      debug: this.http['debug']
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; timestamp: string; version: string }> {
    const response = await this.http.get('/health');
    return response;
  }

  /**
   * API Health check (requires API key)
   */
  async apiHealthCheck(): Promise<{
    status: string;
    timestamp: string;
    version: string;
    application: string;
    rateLimit: {
      limit: string;
      remaining: string;
      reset: string;
    };
  }> {
    const response = await this.http.get('/api/health');
    return response;
  }

  private validateConfig(config: TekParolaConfig): void {
    if (!config.baseUrl) {
      throw new ValidationError('baseUrl is required');
    }

    if (!config.baseUrl.startsWith('http://') && !config.baseUrl.startsWith('https://')) {
      throw new ValidationError('baseUrl must start with http:// or https://');
    }

    // Remove trailing slash from baseUrl
    if (config.baseUrl.endsWith('/')) {
      config.baseUrl = config.baseUrl.slice(0, -1);
    }
  }
}