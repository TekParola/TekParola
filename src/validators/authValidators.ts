import { body, param, query } from 'express-validator';

// Password validation rules
const passwordValidation = () => {
  return body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
    .custom((value) => {
      // Check for common weak passwords
      const commonPasswords = [
        'password', 'password123', '123456789', 'qwerty123', 'admin123',
        'welcome123', 'letmein123', 'monkey123', 'dragon123', 'master123'
      ];
      
      if (commonPasswords.some(common => value.toLowerCase().includes(common.toLowerCase()))) {
        throw new Error('Password contains common weak patterns');
      }
      
      // Check for repeated characters (more than 3 consecutive)
      if (/(.)\1{3,}/.test(value)) {
        throw new Error('Password cannot contain more than 3 consecutive identical characters');
      }
      
      // Check for sequential characters
      const sequences = ['123456', 'abcdef', 'qwerty', '654321', 'fedcba'];
      if (sequences.some(seq => value.toLowerCase().includes(seq))) {
        throw new Error('Password cannot contain sequential character patterns');
      }
      
      return true;
    });
};

// Email validation
const emailValidation = () => {
  return body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email must be less than 255 characters');
};

// Register validation
export const validateRegister = [
  emailValidation(),
  body('username')
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
  body('firstName')
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('First name must be between 1 and 100 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
  body('lastName')
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Last name must be between 1 and 100 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
  passwordValidation(),
  body('phoneNumber')
    .optional()
    .isMobilePhone('any')
    .withMessage('Please provide a valid phone number'),
];

// Login validation
export const validateLogin = [
  emailValidation(),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  body('twoFactorCode')
    .optional()
    .isLength({ min: 6, max: 6 })
    .withMessage('Two-factor code must be exactly 6 digits')
    .isNumeric()
    .withMessage('Two-factor code must contain only numbers'),
  body('rememberMe')
    .optional()
    .isBoolean()
    .withMessage('Remember me must be a boolean value'),
];

// Password reset request validation
export const validatePasswordResetRequest = [
  emailValidation(),
];

// Password reset confirmation validation
export const validatePasswordResetConfirm = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required')
    .isLength({ min: 10 })
    .withMessage('Invalid reset token format'),
  passwordValidation(),
];

// Magic link request validation
export const validateMagicLinkRequest = [
  emailValidation(),
];

// Magic link login validation
export const validateMagicLinkLogin = [
  body('token')
    .notEmpty()
    .withMessage('Magic link token is required')
    .isLength({ min: 10 })
    .withMessage('Invalid magic link token format'),
];

// Refresh token validation
export const validateRefreshToken = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
    .isJWT()
    .withMessage('Invalid refresh token format'),
];

// Two-factor setup validation
export const validateTwoFactorSetup = [
  body('code')
    .notEmpty()
    .withMessage('Verification code is required')
    .isLength({ min: 6, max: 8 })
    .withMessage('Verification code must be 6 digits or 8-character backup code')
    .custom((value) => {
      // Allow either 6-digit TOTP or 8-character backup code
      if (/^\d{6}$/.test(value)) {
        return true; // Valid TOTP code
      }
      if (/^[A-Z0-9]{8}$/.test(value.toUpperCase())) {
        return true; // Valid backup code format
      }
      throw new Error('Code must be either a 6-digit number or 8-character backup code');
    }),
];

// Backup code regeneration validation
export const validateBackupCodeRegeneration = [
  body('code')
    .notEmpty()
    .withMessage('Verification code is required')
    .isLength({ min: 6, max: 8 })
    .withMessage('Verification code must be 6 digits or 8-character backup code')
    .custom((value) => {
      // Allow either 6-digit TOTP or 8-character backup code
      if (/^\d{6}$/.test(value)) {
        return true; // Valid TOTP code
      }
      if (/^[A-Z0-9]{8}$/.test(value.toUpperCase())) {
        return true; // Valid backup code format
      }
      throw new Error('Code must be either a 6-digit number or 8-character backup code');
    }),
];

// Change password validation
export const validateChangePassword = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8, max: 128 })
    .withMessage('New password must be between 8 and 128 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
    .custom((value, { req }) => {
      // Check if new password is different from current password
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      
      // Apply same complexity rules as registration
      const commonPasswords = [
        'password', 'password123', '123456789', 'qwerty123', 'admin123',
        'welcome123', 'letmein123', 'monkey123', 'dragon123', 'master123'
      ];
      
      if (commonPasswords.some(common => value.toLowerCase().includes(common.toLowerCase()))) {
        throw new Error('Password contains common weak patterns');
      }
      
      if (/(.)\1{3,}/.test(value)) {
        throw new Error('Password cannot contain more than 3 consecutive identical characters');
      }
      
      const sequences = ['123456', 'abcdef', 'qwerty', '654321', 'fedcba'];
      if (sequences.some(seq => value.toLowerCase().includes(seq))) {
        throw new Error('Password cannot contain sequential character patterns');
      }
      
      return true;
    }),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password');
      }
      return true;
    }),
];

// Update profile validation
export const validateUpdateProfile = [
  body('firstName')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('First name must be between 1 and 100 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
  body('lastName')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Last name must be between 1 and 100 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
  body('phoneNumber')
    .optional()
    .isMobilePhone('any')
    .withMessage('Please provide a valid phone number'),
  body('timezone')
    .optional()
    .isString()
    .withMessage('Timezone must be a string'),
  body('language')
    .optional()
    .isLength({ min: 2, max: 5 })
    .withMessage('Language code must be between 2 and 5 characters'),
  body('dateFormat')
    .optional()
    .isString()
    .withMessage('Date format must be a string'),
  body('timeFormat')
    .optional()
    .isIn(['12', '24'])
    .withMessage('Time format must be either 12 or 24'),
];

// User ID parameter validation
export const validateUserId = [
  param('id')
    .notEmpty()
    .withMessage('User ID is required')
    .isString()
    .withMessage('User ID must be a string')
    .isLength({ min: 1 })
    .withMessage('User ID cannot be empty'),
];

// Session ID parameter validation
export const validateSessionId = [
  param('sessionId')
    .notEmpty()
    .withMessage('Session ID is required')
    .isString()
    .withMessage('Session ID must be a string')
    .isLength({ min: 1 })
    .withMessage('Session ID cannot be empty'),
];

// Search query validation
export const validateSearchQuery = [
  query('q')
    .optional()
    .isString()
    .withMessage('Search query must be a string')
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
];

// Pagination validation
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];