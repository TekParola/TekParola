import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { circuitBreakerRegistry, CircuitBreakerOptions } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';

export interface ExternalApiConfig {
  baseURL: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  circuitBreakerOptions?: Partial<CircuitBreakerOptions>;
  headers?: Record<string, string>;
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
  success: boolean;
}

export class ExternalApiService {
  private axios: AxiosInstance;
  private serviceName: string;
  private retries: number;
  private retryDelay: number;

  constructor(serviceName: string, config: ExternalApiConfig) {
    this.serviceName = serviceName;
    this.retries = config.retries || 3;
    this.retryDelay = config.retryDelay || 1000;

    // Create axios instance
    this.axios = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `TekParola-SSO/${process.env.npm_package_version || '1.0.0'}`,
        ...config.headers,
      },
    });

    // Setup request interceptor for logging
    this.axios.interceptors.request.use(
      (request) => {
        logger.debug(`External API request: ${this.serviceName}`, {
          method: request.method?.toUpperCase(),
          url: request.url,
          baseURL: request.baseURL,
          timeout: request.timeout,
        });
        return request;
      },
      (error) => {
        logger.error(`External API request error: ${this.serviceName}`, error);
        return Promise.reject(error);
      }
    );

    // Setup response interceptor for logging
    this.axios.interceptors.response.use(
      (response) => {
        logger.debug(`External API response: ${this.serviceName}`, {
          status: response.status,
          statusText: response.statusText,
          url: response.config.url,
          duration: this.calculateDuration(response.config),
        });
        return response;
      },
      (error) => {
        logger.error(`External API response error: ${this.serviceName}`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message,
          url: error.config?.url,
        });
        return Promise.reject(error);
      }
    );

    // Register circuit breaker for this service
    circuitBreakerRegistry.getCircuitBreaker(serviceName, config.circuitBreakerOptions);
  }

  /**
   * Make a GET request with circuit breaker protection
   */
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.executeWithCircuitBreaker(async () => {
      const response = await this.axios.get<T>(url, config);
      return this.formatResponse(response);
    });
  }

  /**
   * Make a POST request with circuit breaker protection
   */
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.executeWithCircuitBreaker(async () => {
      const response = await this.axios.post<T>(url, data, config);
      return this.formatResponse(response);
    });
  }

  /**
   * Make a PUT request with circuit breaker protection
   */
  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.executeWithCircuitBreaker(async () => {
      const response = await this.axios.put<T>(url, data, config);
      return this.formatResponse(response);
    });
  }

  /**
   * Make a PATCH request with circuit breaker protection
   */
  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.executeWithCircuitBreaker(async () => {
      const response = await this.axios.patch<T>(url, data, config);
      return this.formatResponse(response);
    });
  }

  /**
   * Make a DELETE request with circuit breaker protection
   */
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.executeWithCircuitBreaker(async () => {
      const response = await this.axios.delete<T>(url, config);
      return this.formatResponse(response);
    });
  }

  /**
   * Execute request with circuit breaker and retry logic
   */
  private async executeWithCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
    const circuitBreaker = circuitBreakerRegistry.getCircuitBreaker(this.serviceName);
    
    return await circuitBreaker.execute(async () => {
      return await this.executeWithRetry(fn);
    });
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === this.retries) {
          throw error;
        }

        // Don't retry on 4xx errors (client errors)
        if (axios.isAxiosError(error) && error.response?.status && 
            error.response.status >= 400 && error.response.status < 500) {
          throw error;
        }

        const delay = this.calculateRetryDelay(attempt);
        logger.warn(`External API retry attempt ${attempt} for ${this.serviceName} in ${delay}ms`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Format axios response to standard format
   */
  private formatResponse<T>(response: AxiosResponse<T>): ApiResponse<T> {
    return {
      data: response.data,
      status: response.status,
      headers: response.headers as Record<string, string>,
      success: response.status >= 200 && response.status < 300,
    };
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const exponentialDelay = this.retryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // Add random jitter to prevent thundering herd
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  /**
   * Calculate request duration
   */
  private calculateDuration(config: any): number {
    const startTime = config._startTime;
    return startTime ? Date.now() - startTime : 0;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    const circuitBreaker = circuitBreakerRegistry.getCircuitBreaker(this.serviceName);
    return {
      serviceName: this.serviceName,
      ...circuitBreaker.getStats(),
      healthy: circuitBreaker.isHealthy(),
      failureRate: circuitBreaker.getFailureRate(),
      successRate: circuitBreaker.getSuccessRate(),
    };
  }

  /**
   * Reset circuit breaker for this service
   */
  resetCircuitBreaker(): void {
    const circuitBreaker = circuitBreakerRegistry.getCircuitBreaker(this.serviceName);
    circuitBreaker.forceReset();
  }

  /**
   * Test connectivity to the external service
   */
  async testConnectivity(): Promise<{
    healthy: boolean;
    responseTime: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      // Try a simple GET request to the base URL or health endpoint
      await this.axios.get('/health', { timeout: 5000 });
      
      return {
        healthy: true,
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Factory for creating external API services
 */
export class ExternalApiFactory {
  private static services = new Map<string, ExternalApiService>();

  /**
   * Create or get an external API service
   */
  static createService(serviceName: string, config: ExternalApiConfig): ExternalApiService {
    if (!this.services.has(serviceName)) {
      const service = new ExternalApiService(serviceName, config);
      this.services.set(serviceName, service);
    }
    return this.services.get(serviceName)!;
  }

  /**
   * Get all registered services
   */
  static getAllServices(): Map<string, ExternalApiService> {
    return new Map(this.services);
  }

  /**
   * Get health status of all services
   */
  static getHealthStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [serviceName, service] of this.services) {
      status[serviceName] = service.getHealthStatus();
    }
    
    return status;
  }

  /**
   * Reset all circuit breakers
   */
  static resetAllCircuitBreakers(): void {
    circuitBreakerRegistry.resetAll();
  }

  /**
   * Test connectivity for all services
   */
  static async testAllConnectivity(): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    
    const tests = Array.from(this.services.entries()).map(async ([serviceName, service]) => {
      try {
        const result = await service.testConnectivity();
        results[serviceName] = result;
      } catch (error) {
        results[serviceName] = {
          healthy: false,
          responseTime: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    await Promise.all(tests);
    return results;
  }
}

/**
 * Pre-configured external services
 */
export const externalServices = {
  // Example: Email service API
  emailProvider: ExternalApiFactory.createService('email_provider', {
    baseURL: 'https://api.emailprovider.com',
    timeout: 10000,
    retries: 3,
    retryDelay: 1000,
    circuitBreakerOptions: {
      failureThreshold: 5,
      timeout: 60000,
    },
    headers: {
      'Authorization': `Bearer ${process.env.EMAIL_API_KEY || ''}`,
    },
  }),

  // Example: SMS service API
  smsProvider: ExternalApiFactory.createService('sms_provider', {
    baseURL: 'https://api.smsprovider.com',
    timeout: 15000,
    retries: 2,
    retryDelay: 2000,
    circuitBreakerOptions: {
      failureThreshold: 3,
      timeout: 120000,
    },
  }),

  // Example: User verification service
  verificationService: ExternalApiFactory.createService('verification_service', {
    baseURL: 'https://api.verification.com',
    timeout: 20000,
    retries: 2,
    retryDelay: 1500,
    circuitBreakerOptions: {
      failureThreshold: 4,
      timeout: 90000,
    },
  }),

  // Example: Analytics/metrics service
  analyticsService: ExternalApiFactory.createService('analytics_service', {
    baseURL: 'https://api.analytics.com',
    timeout: 5000,
    retries: 1,
    retryDelay: 1000,
    circuitBreakerOptions: {
      failureThreshold: 10, // Higher threshold as analytics is less critical
      timeout: 30000,
    },
  }),
};

export default ExternalApiFactory;