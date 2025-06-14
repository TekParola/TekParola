import { body, query } from 'express-validator';

// Import users validation
export const validateImportUsers = [
  body('csvContent')
    .notEmpty()
    .withMessage('CSV content is required')
    .isString()
    .withMessage('CSV content must be a string')
    .isLength({ min: 10, max: 5000000 }) // 5MB max
    .withMessage('CSV content must be between 10 characters and 5MB'),
  
  body('options')
    .optional()
    .isObject()
    .withMessage('Options must be an object'),
    
  body('options.skipDuplicates')
    .optional()
    .isBoolean()
    .withMessage('skipDuplicates must be a boolean'),
    
  body('options.generatePasswords')
    .optional()
    .isBoolean()
    .withMessage('generatePasswords must be a boolean'),
    
  body('options.sendWelcomeEmails')
    .optional()
    .isBoolean()
    .withMessage('sendWelcomeEmails must be a boolean'),
    
  body('options.defaultRoles')
    .optional()
    .isArray()
    .withMessage('defaultRoles must be an array')
    .custom((roles) => {
      if (roles && roles.length > 0) {
        for (const role of roles) {
          if (typeof role !== 'string' || role.length === 0) {
            throw new Error('Each role must be a non-empty string');
          }
        }
      }
      return true;
    }),
];

// Export users validation
export const validateExportUsers = [
  body('format')
    .optional()
    .isIn(['csv', 'json'])
    .withMessage('Format must be either "csv" or "json"'),
    
  body('includeInactive')
    .optional()
    .isBoolean()
    .withMessage('includeInactive must be a boolean'),
    
  body('includeRoles')
    .optional()
    .isBoolean()
    .withMessage('includeRoles must be a boolean'),
    
  body('filters')
    .optional()
    .isObject()
    .withMessage('Filters must be an object'),
    
  body('filters.createdAfter')
    .optional()
    .isISO8601()
    .withMessage('createdAfter must be a valid ISO 8601 date'),
    
  body('filters.createdBefore')
    .optional()
    .isISO8601()
    .withMessage('createdBefore must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      if (req.body.filters?.createdAfter && value) {
        const after = new Date(req.body.filters.createdAfter);
        const before = new Date(value);
        if (before <= after) {
          throw new Error('createdBefore must be after createdAfter');
        }
      }
      return true;
    }),
    
  body('filters.lastLoginAfter')
    .optional()
    .isISO8601()
    .withMessage('lastLoginAfter must be a valid ISO 8601 date'),
    
  body('filters.lastLoginBefore')
    .optional()
    .isISO8601()
    .withMessage('lastLoginBefore must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      if (req.body.filters?.lastLoginAfter && value) {
        const after = new Date(req.body.filters.lastLoginAfter);
        const before = new Date(value);
        if (before <= after) {
          throw new Error('lastLoginBefore must be after lastLoginAfter');
        }
      }
      return true;
    }),
    
  body('filters.emailVerified')
    .optional()
    .isBoolean()
    .withMessage('emailVerified filter must be a boolean'),
    
  body('filters.roles')
    .optional()
    .isArray()
    .withMessage('roles filter must be an array')
    .custom((roles) => {
      if (roles && roles.length > 0) {
        for (const role of roles) {
          if (typeof role !== 'string' || role.length === 0) {
            throw new Error('Each role must be a non-empty string');
          }
        }
        if (roles.length > 10) {
          throw new Error('Maximum 10 roles can be filtered at once');
        }
      }
      return true;
    }),
    
  body('fields')
    .optional()
    .isArray()
    .withMessage('Fields must be an array')
    .custom((fields) => {
      if (fields && fields.length > 0) {
        const validFields = [
          'id', 'email', 'username', 'firstName', 'lastName', 'phoneNumber',
          'avatar', 'timezone', 'language', 'isActive', 'isEmailVerified',
          'twoFactorEnabled', 'lastLoginAt', 'lastLoginIp', 'failedLoginAttempts',
          'lockedAt', 'lockedUntil', 'emailVerifiedAt', 'createdAt', 'updatedAt',
          'createdBy', 'updatedBy'
        ];
        
        for (const field of fields) {
          if (typeof field !== 'string' || !validFields.includes(field)) {
            throw new Error(`Invalid field: ${field}. Valid fields are: ${validFields.join(', ')}`);
          }
        }
        
        if (fields.length > 20) {
          throw new Error('Maximum 20 fields can be exported at once');
        }
      }
      return true;
    }),
];

// Bulk delete validation
export const validateBulkDeleteUsers = [
  body('userIds')
    .isArray({ min: 1, max: 100 })
    .withMessage('userIds must be an array with 1-100 user IDs')
    .custom((userIds) => {
      for (const userId of userIds) {
        if (typeof userId !== 'string' || userId.length === 0) {
          throw new Error('Each user ID must be a non-empty string');
        }
      }
      return true;
    }),
    
  body('options')
    .optional()
    .isObject()
    .withMessage('Options must be an object'),
    
  body('options.skipSystemUsers')
    .optional()
    .isBoolean()
    .withMessage('skipSystemUsers must be a boolean'),
    
  body('options.sendNotificationEmails')
    .optional()
    .isBoolean()
    .withMessage('sendNotificationEmails must be a boolean'),
];

// CSV validation
export const validateCSV = [
  body('csvContent')
    .notEmpty()
    .withMessage('CSV content is required')
    .isString()
    .withMessage('CSV content must be a string')
    .isLength({ min: 10, max: 5000000 }) // 5MB max
    .withMessage('CSV content must be between 10 characters and 5MB'),
];

// Import preview validation
export const validateImportPreview = [
  body('csvContent')
    .notEmpty()
    .withMessage('CSV content is required')
    .isString()
    .withMessage('CSV content must be a string')
    .isLength({ min: 10, max: 5000000 }) // 5MB max
    .withMessage('CSV content must be between 10 characters and 5MB'),
    
  body('previewCount')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('previewCount must be between 1 and 20'),
];

// Bulk operation history validation
export const validateBulkOperationHistory = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
    
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
];

// Bulk stats validation
export const validateBulkStats = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('startDate must be a valid ISO 8601 date'),
    
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('endDate must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      if (req.query?.startDate && value) {
        const start = new Date(req.query.startDate as string);
        const end = new Date(value);
        if (end <= start) {
          throw new Error('endDate must be after startDate');
        }
      }
      return true;
    }),
];