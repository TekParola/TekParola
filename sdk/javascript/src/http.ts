import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { 
  TekParolaError, 
  AuthenticationError, 
  AuthorizationError, 
  ValidationError, 
  NotFoundError, 
  RateLimitError, 
  NetworkError, 
  TimeoutError,
  ServerError 
} from './errors';
import { ApiResponse, ErrorResponse, RequestOptions } from './types';

export class HttpClient {
  private axios: AxiosInstance;
  private accessToken?: string;
  private apiKey?: string;
  private debug: boolean;

  constructor(baseUrl: string, timeout = 30000, debug = false) {
    this.debug = debug;
    this.axios = axios.create({
      baseURL: baseUrl,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'TekParola-SDK/1.0.0 (Node.js)'
      }
    });

    // Request interceptor
    this.axios.interceptors.request.use(
      (config) => {
        if (this.debug) {
          console.log(`[TekParola SDK] ${config.method?.toUpperCase()} ${config.url}`);
        }

        // Add authentication headers
        if (this.accessToken) {
          config.headers['Authorization'] = `Bearer ${this.accessToken}`;
        } else if (this.apiKey) {
          config.headers['X-API-Key'] = this.apiKey;
        }

        return config;
      },
      (error) => {
        if (this.debug) {
          console.error('[TekParola SDK] Request error:', error);
        }
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axios.interceptors.response.use(
      (response) => {
        if (this.debug) {
          console.log(`[TekParola SDK] Response ${response.status} from ${response.config.url}`);
        }
        return response;
      },
      (error: AxiosError<ErrorResponse>) => {
        if (this.debug) {
          console.error('[TekParola SDK] Response error:', error);
        }
        return Promise.reject(this.handleError(error));
      }
    );
  }

  setAccessToken(token: string | undefined): void {
    this.accessToken = token;
  }

  setApiKey(key: string | undefined): void {
    this.apiKey = key;
  }

  async request<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    data?: any,
    options?: RequestOptions
  ): Promise<T> {
    try {
      const config: AxiosRequestConfig = {
        method,
        url: path,
        data,
        headers: {
          ...options?.headers
        },
        timeout: options?.timeout,
        signal: options?.signal
      };

      const response = await this.axios.request<ApiResponse<T>>(config);
      
      if (response.data.success === false) {
        throw new TekParolaError(
          response.data.message || 'Request failed',
          response.data.code,
          response.status
        );
      }

      return response.data.data as T;
    } catch (error) {
      if (error instanceof TekParolaError) {
        throw error;
      }
      throw this.handleError(error as AxiosError<ErrorResponse>);
    }
  }

  async get<T = any>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T = any>(path: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, data, options);
  }

  async put<T = any>(path: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, data, options);
  }

  async delete<T = any>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  async patch<T = any>(path: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, data, options);
  }

  private handleError(error: AxiosError<ErrorResponse>): TekParolaError {
    if (error.code === 'ECONNABORTED') {
      return new TimeoutError('Request timeout', { url: error.config?.url });
    }

    if (!error.response) {
      return new NetworkError(
        error.message || 'Network error occurred',
        error.code,
        { url: error.config?.url }
      );
    }

    const { status, data } = error.response;
    const message = data?.message || error.message || 'Unknown error occurred';
    const code = data?.code;
    const details = data?.details;

    switch (status) {
      case 400:
        return new ValidationError(message, code, details);
      case 401:
        return new AuthenticationError(message, code, details);
      case 403:
        return new AuthorizationError(message, code, details);
      case 404:
        return new NotFoundError(message, code, details);
      case 429:
        const retryAfter = error.response.headers['retry-after'];
        return new RateLimitError(message, retryAfter ? parseInt(retryAfter) : undefined, details);
      default:
        if (status >= 500) {
          return new ServerError(message, status, details);
        }
        return new TekParolaError(message, code, status, details);
    }
  }
}