import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalServerError,
  DatabaseError,
  EmailError,
} from '../../src/utils/errors';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with all properties', () => {
      const error = new AppError('Test message', 400, 'TEST_CODE', true);

      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_CODE');
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('Error');
      expect(error.stack).toBeDefined();
    });

    it('should default isOperational to true', () => {
      const error = new AppError('Test message', 400, 'TEST_CODE');

      expect(error.isOperational).toBe(true);
    });

    it('should work without code parameter', () => {
      const error = new AppError('Test message', 400);

      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBeUndefined();
      expect(error.isOperational).toBe(true);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test message', 400);

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with field', () => {
      const error = new ValidationError('Invalid email', 'email');

      expect(error.message).toBe('Invalid email');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.field).toBe('email');
      expect(error.isOperational).toBe(true);
    });

    it('should create validation error without field', () => {
      const error = new ValidationError('Invalid data');

      expect(error.message).toBe('Invalid data');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.field).toBeUndefined();
      expect(error.isOperational).toBe(true);
    });

    it('should be instance of AppError', () => {
      const error = new ValidationError('Test');

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error with custom message', () => {
      const error = new AuthenticationError('Invalid credentials');

      expect(error.message).toBe('Invalid credentials');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create authentication error with default message', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication failed');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should be instance of AppError', () => {
      const error = new AuthenticationError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(AuthenticationError);
    });
  });

  describe('AuthorizationError', () => {
    it('should create authorization error with custom message', () => {
      const error = new AuthorizationError('Access denied');

      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create authorization error with default message', () => {
      const error = new AuthorizationError();

      expect(error.message).toBe('Insufficient permissions');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should be instance of AppError', () => {
      const error = new AuthorizationError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(AuthorizationError);
    });
  });

  describe('UnauthorizedError', () => {
    it('should create unauthorized error with custom message', () => {
      const error = new UnauthorizedError('Login required');

      expect(error.message).toBe('Login required');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create unauthorized error with default message', () => {
      const error = new UnauthorizedError();

      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should be instance of AppError', () => {
      const error = new UnauthorizedError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(UnauthorizedError);
    });
  });

  describe('ForbiddenError', () => {
    it('should create forbidden error with custom message', () => {
      const error = new ForbiddenError('Resource forbidden');

      expect(error.message).toBe('Resource forbidden');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create forbidden error with default message', () => {
      const error = new ForbiddenError();

      expect(error.message).toBe('Access forbidden');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should be instance of AppError', () => {
      const error = new ForbiddenError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ForbiddenError);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with custom message', () => {
      const error = new NotFoundError('User not found');

      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create not found error with default message', () => {
      const error = new NotFoundError();

      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should be instance of AppError', () => {
      const error = new NotFoundError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(NotFoundError);
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error with custom message', () => {
      const error = new ConflictError('Email already exists');

      expect(error.message).toBe('Email already exists');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create conflict error with default message', () => {
      const error = new ConflictError();

      expect(error.message).toBe('Resource conflict');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should be instance of AppError', () => {
      const error = new ConflictError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ConflictError);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with custom message', () => {
      const error = new RateLimitError('Rate limit exceeded');

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create rate limit error with default message', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('Too many requests');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should be instance of AppError', () => {
      const error = new RateLimitError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(RateLimitError);
    });
  });

  describe('InternalServerError', () => {
    it('should create internal server error with custom message', () => {
      const error = new InternalServerError('Server crashed');

      expect(error.message).toBe('Server crashed');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create internal server error with default message', () => {
      const error = new InternalServerError();

      expect(error.message).toBe('Internal server error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should be instance of AppError', () => {
      const error = new InternalServerError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(InternalServerError);
    });
  });

  describe('DatabaseError', () => {
    it('should create database error with custom message', () => {
      const error = new DatabaseError('Connection failed');

      expect(error.message).toBe('Connection failed');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create database error with default message', () => {
      const error = new DatabaseError();

      expect(error.message).toBe('Database operation failed');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should be instance of AppError', () => {
      const error = new DatabaseError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(DatabaseError);
    });
  });

  describe('EmailError', () => {
    it('should create email error with custom message', () => {
      const error = new EmailError('SMTP connection failed');

      expect(error.message).toBe('SMTP connection failed');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('EMAIL_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create email error with default message', () => {
      const error = new EmailError();

      expect(error.message).toBe('Email service error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('EMAIL_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should be instance of AppError', () => {
      const error = new EmailError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(EmailError);
    });
  });
});