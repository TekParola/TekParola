import { Request, Response } from 'express';
import { userBulkService } from '../services/userBulkService';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../utils/errors';
import { ApiResponse } from '../types';

export class UserBulkController {
  // Import users from CSV
  importUsers = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { csvContent, options = {} } = req.body;
    const adminUserId = req.user!.id;

    if (!csvContent) {
      throw new ValidationError('CSV content is required');
    }

    const result = await userBulkService.importFromCSV(csvContent, adminUserId, {
      skipDuplicates: options.skipDuplicates || false,
      generatePasswords: options.generatePasswords || false,
      sendWelcomeEmails: options.sendWelcomeEmails || false,
      defaultRoles: options.defaultRoles || [],
    });

    res.status(200).json({
      success: true,
      message: `Import completed: ${result.successful}/${result.total} users imported successfully`,
      data: result,
    });
  });

  // Import users from CSV file upload
  importUsersFromFile = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { csvContent, originalFilename, fileSize } = req.body;
    const { skipDuplicates, generatePasswords, sendWelcomeEmails, defaultRoles } = req.body;
    const adminUserId = req.user!.id;

    if (!csvContent) {
      throw new ValidationError('CSV file is required');
    }

    // Parse defaultRoles from string to array if provided
    const parsedDefaultRoles = defaultRoles ? 
      defaultRoles.split(',').map((role: string) => role.trim()).filter((role: string) => role.length > 0) : 
      [];

    const result = await userBulkService.importFromCSV(csvContent, adminUserId, {
      skipDuplicates: skipDuplicates === 'true' || skipDuplicates === true,
      generatePasswords: generatePasswords === 'true' || generatePasswords === true,
      sendWelcomeEmails: sendWelcomeEmails === 'true' || sendWelcomeEmails === true,
      defaultRoles: parsedDefaultRoles,
    });

    res.status(200).json({
      success: true,
      message: `Import completed: ${result.successful}/${result.total} users imported successfully`,
      data: {
        ...result,
        uploadInfo: {
          originalFilename,
          fileSize,
        },
      },
    });
  });

  // Export users to CSV or JSON
  exportUsers = asyncHandler(async (req: Request, res: Response) => {
    const {
      format = 'csv',
      includeInactive = false,
      includeRoles = false,
      filters = {},
      fields = [],
    } = req.body;

    const adminUserId = req.user!.id;

    // Validate format
    if (!['csv', 'json'].includes(format)) {
      throw new ValidationError('Format must be either "csv" or "json"');
    }

    // Parse date filters
    const processedFilters = {
      ...filters,
      createdAfter: filters.createdAfter ? new Date(filters.createdAfter) : undefined,
      createdBefore: filters.createdBefore ? new Date(filters.createdBefore) : undefined,
      lastLoginAfter: filters.lastLoginAfter ? new Date(filters.lastLoginAfter) : undefined,
      lastLoginBefore: filters.lastLoginBefore ? new Date(filters.lastLoginBefore) : undefined,
    };

    const exportResult = await userBulkService.exportUsers(
      {
        format,
        includeInactive,
        includeRoles,
        filters: processedFilters,
        fields: fields.length > 0 ? fields : undefined,
      },
      adminUserId
    );

    // Set appropriate headers for file download
    res.setHeader('Content-Type', exportResult.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    res.send(exportResult.content);
  });

  // Bulk delete users
  bulkDeleteUsers = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { userIds, options = {} } = req.body;
    const adminUserId = req.user!.id;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw new ValidationError('User IDs array is required');
    }

    const result = await userBulkService.bulkDeleteUsers(userIds, adminUserId, {
      skipSystemUsers: options.skipSystemUsers !== false, // Default to true
      sendNotificationEmails: options.sendNotificationEmails || false,
    });

    res.status(200).json({
      success: true,
      message: `Bulk delete completed: ${result.successful}/${result.total} users deleted successfully`,
      data: result,
    });
  });

  // Get bulk operation history
  getBulkOperationHistory = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { limit = 20, offset = 0 } = req.query;

    const history = await userBulkService.getBulkOperationHistory(
      Number(limit),
      Number(offset)
    );

    res.status(200).json({
      success: true,
      message: 'Bulk operation history retrieved successfully',
      data: {
        operations: history.operations,
        pagination: {
          total: history.total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: history.total > Number(offset) + Number(limit),
        },
      },
    });
  });

  // Validate CSV template
  validateCSV = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { csvContent } = req.body;

    if (!csvContent) {
      throw new ValidationError('CSV content is required');
    }

    const validation = await userBulkService.validateCSVTemplate(csvContent);

    res.status(200).json({
      success: validation.valid,
      message: validation.valid 
        ? 'CSV template is valid' 
        : `CSV template has ${validation.errors.length} validation errors`,
      data: validation,
    });
  });

  // Validate CSV file upload
  validateCSVFromFile = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { csvContent, originalFilename, fileSize } = req.body;

    if (!csvContent) {
      throw new ValidationError('CSV file is required');
    }

    const validation = await userBulkService.validateCSVTemplate(csvContent);

    res.status(200).json({
      success: validation.valid,
      message: validation.valid 
        ? 'CSV file is valid' 
        : `CSV file has ${validation.errors.length} validation errors`,
      data: {
        ...validation,
        fileInfo: {
          originalFilename,
          fileSize,
        },
      },
    });
  });

  // Get CSV template
  getCSVTemplate = asyncHandler(async (req: Request, res: Response) => {
    const template = userBulkService.generateCSVTemplate();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="user_import_template.csv"');
    res.send(template);
  });

  // Get import/export statistics
  getBulkStats = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { startDate: _startDate, endDate: _endDate } = req.query;

    // Get recent bulk operations
    const recentOperations = await userBulkService.getBulkOperationHistory(10, 0);

    // Calculate stats from recent operations
    const stats = {
      totalOperations: recentOperations.total,
      recentImports: recentOperations.operations.filter(op => 
        op.action === 'bulk_import_users'
      ).length,
      recentExports: recentOperations.operations.filter(op => 
        op.action === 'bulk_export_users'
      ).length,
      recentDeletes: recentOperations.operations.filter(op => 
        op.action === 'bulk_delete_users'
      ).length,
      lastOperation: recentOperations.operations[0] || null,
    };

    res.status(200).json({
      success: true,
      message: 'Bulk operation statistics retrieved successfully',
      data: stats,
    });
  });

  // Preview import data
  previewImport = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { csvContent, previewCount = 5 } = req.body;

    if (!csvContent) {
      throw new ValidationError('CSV content is required');
    }

    const validation = await userBulkService.validateCSVTemplate(csvContent);

    res.status(200).json({
      success: true,
      message: 'Import preview generated successfully',
      data: {
        valid: validation.valid,
        errors: validation.errors,
        preview: validation.sampleData?.slice(0, Number(previewCount)) || [],
        estimatedTotal: validation.sampleData?.length || 0,
      },
    });
  });

  // Get supported export formats and fields
  getExportOptions = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const exportOptions = {
      formats: ['csv', 'json'],
      availableFields: [
        'id',
        'email',
        'username',
        'firstName',
        'lastName',
        'phoneNumber',
        'avatar',
        'timezone',
        'language',
        'isActive',
        'isEmailVerified',
        'twoFactorEnabled',
        'lastLoginAt',
        'lastLoginIp',
        'failedLoginAttempts',
        'lockedAt',
        'lockedUntil',
        'emailVerifiedAt',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
      ],
      filterOptions: {
        dateFields: ['createdAt', 'updatedAt', 'lastLoginAt', 'emailVerifiedAt'],
        booleanFields: ['isActive', 'isEmailVerified', 'twoFactorEnabled'],
        textFields: ['email', 'username', 'firstName', 'lastName'],
      },
      maxExportSize: 10000,
      maxImportSize: 1000,
    };

    res.status(200).json({
      success: true,
      message: 'Export options retrieved successfully',
      data: exportOptions,
    });
  });
}

export const userBulkController = new UserBulkController();