export class TekParolaError extends Error {
  public code?: string;
  public statusCode?: number;
  public details?: any;

  constructor(message: string, code?: string, statusCode?: number, details?: any) {
    super(message);
    this.name = 'TekParolaError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class AuthenticationError extends TekParolaError {
  constructor(message: string, code?: string, details?: any) {
    super(message, code || 'AUTHENTICATION_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends TekParolaError {
  constructor(message: string, code?: string, details?: any) {
    super(message, code || 'AUTHORIZATION_ERROR', 403, details);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends TekParolaError {
  constructor(message: string, code?: string, details?: any) {
    super(message, code || 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends TekParolaError {
  constructor(message: string, code?: string, details?: any) {
    super(message, code || 'NOT_FOUND', 404, details);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends TekParolaError {
  public retryAfter?: number;

  constructor(message: string, retryAfter?: number, details?: any) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, details);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class NetworkError extends TekParolaError {
  constructor(message: string, code?: string, details?: any) {
    super(message, code || 'NETWORK_ERROR', undefined, details);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends TekParolaError {
  constructor(message: string, details?: any) {
    super(message, 'TIMEOUT', undefined, details);
    this.name = 'TimeoutError';
  }
}

export class ServerError extends TekParolaError {
  constructor(message: string, statusCode = 500, details?: any) {
    super(message, 'SERVER_ERROR', statusCode, details);
    this.name = 'ServerError';
  }
}