import { body, param, query } from 'express-validator';

// Application ID validation
export const validateApplicationId = [
  param('id')
    .notEmpty()
    .withMessage('Application ID is required')
    .isString()
    .withMessage('Application ID must be a string'),
];

// Create application validation
export const validateCreateApplication = [
  body('name')
    .notEmpty()
    .withMessage('Application name is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Application name must be between 3 and 50 characters')
    .matches(/^[a-z][a-z0-9_-]*$/)
    .withMessage('Application name must start with a letter and contain only lowercase letters, numbers, underscores, and hyphens'),
  body('displayName')
    .notEmpty()
    .withMessage('Display name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Display name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('redirectUris')
    .optional()
    .isArray()
    .withMessage('Redirect URIs must be an array')
    .custom((uris) => {
      if (uris && uris.length > 0) {
        for (const uri of uris) {
          if (typeof uri !== 'string' || !uri.match(/^https?:\/\/.+/)) {
            throw new Error('Each redirect URI must be a valid HTTP or HTTPS URL');
          }
        }
      }
      return true;
    }),
  body('scopes')
    .optional()
    .isArray()
    .withMessage('Scopes must be an array')
    .custom((scopes) => {
      if (scopes && scopes.length > 0) {
        const validScopes = ['read', 'write', 'admin', 'openid', 'profile', 'email'];
        for (const scope of scopes) {
          if (typeof scope !== 'string' || !validScopes.includes(scope)) {
            throw new Error(`Invalid scope: ${scope}. Valid scopes are: ${validScopes.join(', ')}`);
          }
        }
      }
      return true;
    }),
  body('website')
    .optional()
    .isURL()
    .withMessage('Website must be a valid URL'),
  body('contactEmail')
    .optional()
    .isEmail()
    .withMessage('Contact email must be a valid email address'),
  body('isFirstParty')
    .optional()
    .isBoolean()
    .withMessage('First party flag must be a boolean'),
  body('allowedOrigins')
    .optional()
    .isArray()
    .withMessage('Allowed origins must be an array')
    .custom((origins) => {
      if (origins && origins.length > 0) {
        for (const origin of origins) {
          if (typeof origin !== 'string' || !origin.match(/^https?:\/\/.+/)) {
            throw new Error('Each allowed origin must be a valid HTTP or HTTPS URL');
          }
        }
      }
      return true;
    }),
  body('tokenLifetime')
    .optional()
    .isInt({ min: 300, max: 86400 })
    .withMessage('Token lifetime must be between 300 seconds (5 minutes) and 86400 seconds (24 hours)'),
  body('refreshTokenLifetime')
    .optional()
    .isInt({ min: 3600, max: 2592000 })
    .withMessage('Refresh token lifetime must be between 3600 seconds (1 hour) and 2592000 seconds (30 days)'),
];

// Update application validation
export const validateUpdateApplication = [
  body('displayName')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Display name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('redirectUris')
    .optional()
    .isArray()
    .withMessage('Redirect URIs must be an array')
    .custom((uris) => {
      if (uris && uris.length > 0) {
        for (const uri of uris) {
          if (typeof uri !== 'string' || !uri.match(/^https?:\/\/.+/)) {
            throw new Error('Each redirect URI must be a valid HTTP or HTTPS URL');
          }
        }
      }
      return true;
    }),
  body('scopes')
    .optional()
    .isArray()
    .withMessage('Scopes must be an array'),
  body('website')
    .optional()
    .isURL()
    .withMessage('Website must be a valid URL'),
  body('contactEmail')
    .optional()
    .isEmail()
    .withMessage('Contact email must be a valid email address'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('Active status must be a boolean'),
  body('allowedOrigins')
    .optional()
    .isArray()
    .withMessage('Allowed origins must be an array'),
  body('tokenLifetime')
    .optional()
    .isInt({ min: 300, max: 86400 })
    .withMessage('Token lifetime must be between 300 seconds (5 minutes) and 86400 seconds (24 hours)'),
  body('refreshTokenLifetime')
    .optional()
    .isInt({ min: 3600, max: 2592000 })
    .withMessage('Refresh token lifetime must be between 3600 seconds (1 hour) and 2592000 seconds (30 days)'),
];

// Application search validation
export const validateApplicationSearch = [
  query('q')
    .notEmpty()
    .withMessage('Search query is required')
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

// Create API key validation
export const validateCreateApiKey = [
  body('name')
    .notEmpty()
    .withMessage('API key name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('API key name must be between 1 and 100 characters'),
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Permissions must be an array')
    .custom((permissions) => {
      if (permissions && permissions.length > 0) {
        for (const permission of permissions) {
          if (typeof permission !== 'string') {
            throw new Error('Each permission must be a string');
          }
        }
      }
      return true;
    }),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Expiration date must be a valid ISO 8601 date')
    .custom((expiresAt) => {
      if (expiresAt && new Date(expiresAt) <= new Date()) {
        throw new Error('Expiration date must be in the future');
      }
      return true;
    }),
  body('rateLimit')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Rate limit must be between 1 and 10000 requests'),
  body('rateLimitWindow')
    .optional()
    .isInt({ min: 60, max: 86400 })
    .withMessage('Rate limit window must be between 60 seconds (1 minute) and 86400 seconds (24 hours)'),
];

// Update API key validation
export const validateUpdateApiKey = [
  body('name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('API key name must be between 1 and 100 characters'),
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Permissions must be an array'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('Active status must be a boolean'),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Expiration date must be a valid ISO 8601 date'),
  body('rateLimit')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Rate limit must be between 1 and 10000 requests'),
  body('rateLimitWindow')
    .optional()
    .isInt({ min: 60, max: 86400 })
    .withMessage('Rate limit window must be between 60 seconds (1 minute) and 86400 seconds (24 hours)'),
];

// API key ID validation
export const validateApiKeyId = [
  param('keyId')
    .notEmpty()
    .withMessage('API key ID is required')
    .isString()
    .withMessage('API key ID must be a string'),
];

// Verify API key validation
export const validateVerifyApiKey = [
  body('keyId')
    .notEmpty()
    .withMessage('Key ID is required')
    .isString()
    .withMessage('Key ID must be a string'),
  body('keySecret')
    .notEmpty()
    .withMessage('Key secret is required')
    .isString()
    .withMessage('Key secret must be a string'),
];

// Schedule API key rotation validation
export const validateScheduleRotation = [
  body('rotationDate')
    .notEmpty()
    .withMessage('Rotation date is required')
    .isISO8601()
    .withMessage('Rotation date must be a valid ISO 8601 date')
    .custom((rotationDate) => {
      const date = new Date(rotationDate);
      const now = new Date();
      const maxFuture = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
      
      if (date <= now) {
        throw new Error('Rotation date must be in the future');
      }
      
      if (date > maxFuture) {
        throw new Error('Rotation date cannot be more than 1 year in the future');
      }
      
      return true;
    }),
];

// Enable auto rotation validation
export const validateAutoRotation = [
  body('rotateAfterDays')
    .notEmpty()
    .withMessage('Rotation period is required')
    .isInt({ min: 1, max: 365 })
    .withMessage('Rotation period must be between 1 and 365 days'),
];

// Rotation history query validation
export const validateRotationHistory = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];