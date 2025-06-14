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
} from '../src/errors';

describe('Error Classes', () => {
  describe('TekParolaError', () => {
    it('should create error with message', () => {
      const error = new TekParolaError('Test error');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TekParolaError);
      expect(error.name).toBe('TekParolaError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBeUndefined();
      expect(error.statusCode).toBeUndefined();
      expect(error.details).toBeUndefined();
    });

    it('should create error with all properties', () => {
      const details = { field: 'email', reason: 'invalid' };
      const error = new TekParolaError('Test error', 'TEST_CODE', 400, details);
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual(details);
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error', () => {
      const error = new AuthenticationError('Invalid credentials');
      
      expect(error).toBeInstanceOf(TekParolaError);
      expect(error.name).toBe('AuthenticationError');
      expect(error.message).toBe('Invalid credentials');
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.statusCode).toBe(401);
    });

    it('should accept custom code', () => {
      const error = new AuthenticationError('Invalid token', 'INVALID_TOKEN');
      
      expect(error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('AuthorizationError', () => {
    it('should create authorization error', () => {
      const error = new AuthorizationError('Insufficient permissions');
      
      expect(error).toBeInstanceOf(TekParolaError);
      expect(error.name).toBe('AuthorizationError');
      expect(error.message).toBe('Insufficient permissions');
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid email format');
      
      expect(error).toBeInstanceOf(TekParolaError);
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Invalid email format');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should include validation details', () => {
      const details = {
        fields: {
          email: 'Invalid format',
          password: 'Too short'
        }
      };
      const error = new ValidationError('Validation failed', 'INVALID_INPUT', details);
      
      expect(error.details).toEqual(details);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error', () => {
      const error = new NotFoundError('User not found');
      
      expect(error).toBeInstanceOf(TekParolaError);
      expect(error.name).toBe('NotFoundError');
      expect(error.message).toBe('User not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error', () => {
      const error = new RateLimitError('Too many requests');
      
      expect(error).toBeInstanceOf(TekParolaError);
      expect(error.name).toBe('RateLimitError');
      expect(error.message).toBe('Too many requests');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBeUndefined();
    });

    it('should include retry after value', () => {
      const error = new RateLimitError('Too many requests', 60);
      
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('NetworkError', () => {
    it('should create network error', () => {
      const error = new NetworkError('Connection failed');
      
      expect(error).toBeInstanceOf(TekParolaError);
      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.statusCode).toBeUndefined();
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error', () => {
      const error = new TimeoutError('Request timed out');
      
      expect(error).toBeInstanceOf(TekParolaError);
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('Request timed out');
      expect(error.code).toBe('TIMEOUT');
      expect(error.statusCode).toBeUndefined();
    });
  });

  describe('ServerError', () => {
    it('should create server error with default status', () => {
      const error = new ServerError('Internal server error');
      
      expect(error).toBeInstanceOf(TekParolaError);
      expect(error.name).toBe('ServerError');
      expect(error.message).toBe('Internal server error');
      expect(error.code).toBe('SERVER_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('should accept custom status code', () => {
      const error = new ServerError('Bad gateway', 502);
      
      expect(error.statusCode).toBe(502);
    });
  });
});