import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import {
  validateRegister,
  validateLogin,
  validatePasswordReset,
  validatePasswordResetConfirm,
  validateMagicLink,
  validateTwoFactorVerify,
  validateTwoFactorEnable,
} from '../../src/validators/authValidators';

// Mock express-validator
jest.mock('express-validator', () => ({
  body: jest.fn(() => ({
    notEmpty: jest.fn(() => ({ withMessage: jest.fn(() => ({})) })),
    isEmail: jest.fn(() => ({ withMessage: jest.fn(() => ({})) })),
    isLength: jest.fn(() => ({ withMessage: jest.fn(() => ({})) })),
    matches: jest.fn(() => ({ withMessage: jest.fn(() => ({})) })),
    isAlphanumeric: jest.fn(() => ({ withMessage: jest.fn(() => ({})) })),
    isBoolean: jest.fn(() => ({ withMessage: jest.fn(() => ({})) })),
    optional: jest.fn(() => ({
      isBoolean: jest.fn(() => ({ withMessage: jest.fn(() => ({})) })),
      isLength: jest.fn(() => ({ withMessage: jest.fn(() => ({})) })),
      isAlphanumeric: jest.fn(() => ({ withMessage: jest.fn(() => ({})) })),
    })),
  })),
  validationResult: jest.fn(),
}));

const mockValidationResult = validationResult as jest.MockedFunction<typeof validationResult>;

describe('Auth Validators', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      body: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('validateRegister', () => {
    it('should exist and be an array', () => {
      expect(validateRegister).toBeDefined();
      expect(Array.isArray(validateRegister)).toBe(true);
    });

    it('should have validation rules', () => {
      expect(validateRegister.length).toBeGreaterThan(0);
    });
  });

  describe('validateLogin', () => {
    it('should exist and be an array', () => {
      expect(validateLogin).toBeDefined();
      expect(Array.isArray(validateLogin)).toBe(true);
    });

    it('should have validation rules', () => {
      expect(validateLogin.length).toBeGreaterThan(0);
    });
  });

  describe('validatePasswordReset', () => {
    it('should exist and be an array', () => {
      expect(validatePasswordReset).toBeDefined();
      expect(Array.isArray(validatePasswordReset)).toBe(true);
    });

    it('should have validation rules', () => {
      expect(validatePasswordReset.length).toBeGreaterThan(0);
    });
  });

  describe('validatePasswordResetConfirm', () => {
    it('should exist and be an array', () => {
      expect(validatePasswordResetConfirm).toBeDefined();
      expect(Array.isArray(validatePasswordResetConfirm)).toBe(true);
    });

    it('should have validation rules', () => {
      expect(validatePasswordResetConfirm.length).toBeGreaterThan(0);
    });
  });

  describe('validateMagicLink', () => {
    it('should exist and be an array', () => {
      expect(validateMagicLink).toBeDefined();
      expect(Array.isArray(validateMagicLink)).toBe(true);
    });

    it('should have validation rules', () => {
      expect(validateMagicLink.length).toBeGreaterThan(0);
    });
  });

  describe('validateTwoFactorVerify', () => {
    it('should exist and be an array', () => {
      expect(validateTwoFactorVerify).toBeDefined();
      expect(Array.isArray(validateTwoFactorVerify)).toBe(true);
    });

    it('should have validation rules', () => {
      expect(validateTwoFactorVerify.length).toBeGreaterThan(0);
    });
  });

  describe('validateTwoFactorEnable', () => {
    it('should exist and be an array', () => {
      expect(validateTwoFactorEnable).toBeDefined();
      expect(Array.isArray(validateTwoFactorEnable)).toBe(true);
    });

    it('should have validation rules', () => {
      expect(validateTwoFactorEnable.length).toBeGreaterThan(0);
    });
  });
});