import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import { Readable } from 'stream';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { userService, CreateUserData } from './userService';
import { auditService } from './auditService';
import { emailService } from './emailService';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

export interface BulkImportResult {
  total: number;
  successful: number;
  failed: number;
  errors: Array<{
    row: number;
    email?: string;
    username?: string;
    error: string;
  }>;
  importId: string;
  createdUsers: Array<{
    id: string;
    email: string;
    username?: string;
  }>;
}

export interface BulkExportOptions {
  format: 'csv' | 'json';
  includeInactive?: boolean;
  includeRoles?: boolean;
  filters?: {
    createdAfter?: Date;
    createdBefore?: Date;
    lastLoginAfter?: Date;
    lastLoginBefore?: Date;
    emailVerified?: boolean;
    roles?: string[];
  };
  fields?: string[];
}

export interface UserImportRow {
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  password?: string;
  phoneNumber?: string;
  isEmailVerified?: boolean;
  roles?: string;
  sendWelcomeEmail?: boolean;
}

export interface BulkDeleteResult {
  total: number;
  successful: number;
  failed: number;
  errors: Array<{
    userId: string;
    email: string;
    error: string;
  }>;
  deletedUsers: Array<{
    id: string;
    email: string;
  }>;
}

export class UserBulkService {
  /**
   * Import users from CSV content
   */
  async importFromCSV(
    csvContent: string,
    importedBy: string,
    options: {
      skipDuplicates?: boolean;
      generatePasswords?: boolean;
      sendWelcomeEmails?: boolean;
      defaultRoles?: string[];
    } = {}
  ): Promise<BulkImportResult> {
    const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.info(`Starting user bulk import: ${importId}`);

      // Parse CSV content
      const records = await this.parseCSV(csvContent);
      
      if (records.length === 0) {
        throw new ValidationError('No valid records found in CSV');
      }

      if (records.length > 1000) {
        throw new ValidationError('Maximum 1000 users can be imported at once');
      }

      // Validate and process records
      const result: BulkImportResult = {
        total: records.length,
        successful: 0,
        failed: 0,
        errors: [],
        importId,
        createdUsers: [],
      };

      // Process records in batches to avoid overwhelming the database
      const batchSize = 50;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await this.processBatch(batch, i, result, importedBy, options);
      }

      // Create audit log for the bulk import
      await auditService.log({
        userId: importedBy,
        action: 'bulk_import_users',
        resource: 'user',
        details: {
          importId,
          totalRecords: result.total,
          successful: result.successful,
          failed: result.failed,
          options,
        },
        ipAddress: 'system',
        userAgent: 'bulk_import_service',
        success: result.successful > 0,
      });

      logger.info(`User bulk import completed: ${importId} - ${result.successful}/${result.total} successful`);
      return result;

    } catch (error) {
      logger.error(`Failed to import users: ${importId}`, error);
      
      // Log failed import attempt
      await auditService.log({
        userId: importedBy,
        action: 'bulk_import_users_failed',
        resource: 'user',
        details: {
          importId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        ipAddress: 'system',
        userAgent: 'bulk_import_service',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Export users to CSV or JSON format
   */
  async exportUsers(
    options: BulkExportOptions,
    exportedBy: string
  ): Promise<{ content: string; filename: string; contentType: string }> {
    try {
      logger.info(`Starting user bulk export by ${exportedBy}`);

      // Build query filters
      const where = this.buildExportFilters(options.filters);

      // Get users with optional role information
      const users = await prisma.user.findMany({
        where,
        include: {
          roles: options.includeRoles ? {
            include: {
              role: {
                select: {
                  name: true,
                  displayName: true,
                },
              },
            },
          } : false,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (users.length === 0) {
        throw new ValidationError('No users found matching the specified criteria');
      }

      if (users.length > 10000) {
        throw new ValidationError('Export too large. Please use filters to reduce the number of users.');
      }

      // Create audit log for export
      await auditService.log({
        userId: exportedBy,
        action: 'bulk_export_users',
        resource: 'user',
        details: {
          format: options.format,
          userCount: users.length,
          filters: options.filters,
          includeRoles: options.includeRoles,
        },
        ipAddress: 'system',
        userAgent: 'bulk_export_service',
        success: true,
      });

      // Generate export content
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      if (options.format === 'json') {
        const jsonData = this.formatUsersForExport(users, options);
        return {
          content: JSON.stringify(jsonData, null, 2),
          filename: `users_export_${timestamp}.json`,
          contentType: 'application/json',
        };
      } else {
        const csvContent = await this.formatUsersAsCSV(users, options);
        return {
          content: csvContent,
          filename: `users_export_${timestamp}.csv`,
          contentType: 'text/csv',
        };
      }

    } catch (error) {
      logger.error('Failed to export users', error);
      
      // Log failed export attempt
      await auditService.log({
        userId: exportedBy,
        action: 'bulk_export_users_failed',
        resource: 'user',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          options,
        },
        ipAddress: 'system',
        userAgent: 'bulk_export_service',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Bulk delete users by IDs
   */
  async bulkDeleteUsers(
    userIds: string[],
    deletedBy: string,
    options: {
      skipSystemUsers?: boolean;
      sendNotificationEmails?: boolean;
    } = {}
  ): Promise<BulkDeleteResult> {
    try {
      logger.info(`Starting bulk delete of ${userIds.length} users by ${deletedBy}`);

      if (userIds.length === 0) {
        throw new ValidationError('No user IDs provided');
      }

      if (userIds.length > 100) {
        throw new ValidationError('Maximum 100 users can be deleted at once');
      }

      const result: BulkDeleteResult = {
        total: userIds.length,
        successful: 0,
        failed: 0,
        errors: [],
        deletedUsers: [],
      };

      // Get users to be deleted
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      // Process each user deletion
      for (const user of users) {
        try {
          // Skip system users if option is enabled
          if (options.skipSystemUsers && this.isSystemUser(user)) {
            result.errors.push({
              userId: user.id,
              email: user.email,
              error: 'Cannot delete system user',
            });
            result.failed++;
            continue;
          }

          // Delete the user
          await userService.deleteUser(user.id);

          result.deletedUsers.push({
            id: user.id,
            email: user.email,
          });
          result.successful++;

          // Send notification email if requested
          if (options.sendNotificationEmails && user.email) {
            try {
              await this.sendAccountDeletionEmail(user.email, user.firstName);
            } catch (emailError) {
              logger.warn(`Failed to send deletion notification to ${user.email}:`, emailError);
            }
          }

        } catch (error) {
          logger.error(`Failed to delete user ${user.id}:`, error);
          result.errors.push({
            userId: user.id,
            email: user.email,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          result.failed++;
        }
      }

      // Handle users that weren't found
      const foundUserIds = users.map(u => u.id);
      const notFoundIds = userIds.filter(id => !foundUserIds.includes(id));
      for (const notFoundId of notFoundIds) {
        result.errors.push({
          userId: notFoundId,
          email: 'unknown',
          error: 'User not found',
        });
        result.failed++;
      }

      // Create audit log
      await auditService.log({
        userId: deletedBy,
        action: 'bulk_delete_users',
        resource: 'user',
        details: {
          totalRequested: result.total,
          successful: result.successful,
          failed: result.failed,
          deletedUserIds: result.deletedUsers.map(u => u.id),
          options,
        },
        ipAddress: 'system',
        userAgent: 'bulk_delete_service',
        success: result.successful > 0,
      });

      logger.info(`Bulk delete completed: ${result.successful}/${result.total} users deleted`);
      return result;

    } catch (error) {
      logger.error('Failed to bulk delete users', error);
      throw error;
    }
  }

  /**
   * Get bulk operation status and history
   */
  async getBulkOperationHistory(
    limit = 20,
    offset = 0
  ): Promise<{
    operations: any[];
    total: number;
  }> {
    try {
      // Get operations for each action type separately since auditService expects single action
      const [importOps, exportOps, deleteOps] = await Promise.all([
        auditService.findMany({ action: 'bulk_import_users' }, { limit: Math.ceil(limit/3), offset: Math.floor(offset/3) }),
        auditService.findMany({ action: 'bulk_export_users' }, { limit: Math.ceil(limit/3), offset: Math.floor(offset/3) }),
        auditService.findMany({ action: 'bulk_delete_users' }, { limit: Math.ceil(limit/3), offset: Math.floor(offset/3) }),
      ]);

      const [importCount, exportCount, deleteCount] = await Promise.all([
        auditService.count({ action: 'bulk_import_users' }),
        auditService.count({ action: 'bulk_export_users' }),
        auditService.count({ action: 'bulk_delete_users' }),
      ]);

      // Combine and sort by created date
      const operations = [...importOps, ...exportOps, ...deleteOps]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);

      const total = importCount + exportCount + deleteCount;

      return { operations, total };
    } catch (error) {
      logger.error('Failed to get bulk operation history', error);
      throw error;
    }
  }

  /**
   * Validate CSV template format
   */
  async validateCSVTemplate(csvContent: string): Promise<{
    valid: boolean;
    errors: string[];
    sampleData?: UserImportRow[];
  }> {
    try {
      const records = await this.parseCSV(csvContent);
      const errors: string[] = [];
      const sampleData: UserImportRow[] = [];

      if (records.length === 0) {
        errors.push('CSV file is empty or has no valid data rows');
        return { valid: false, errors };
      }

      // Check required headers
      const requiredHeaders = ['email', 'firstName', 'lastName'];
      const firstRecord = records[0];
      
      for (const header of requiredHeaders) {
        if (!(header in firstRecord)) {
          errors.push(`Missing required column: ${header}`);
        }
      }

      // Validate sample records (first 5)
      const sampleRecords = records.slice(0, Math.min(5, records.length));
      for (let i = 0; i < sampleRecords.length; i++) {
        const record = sampleRecords[i];
        const rowErrors = this.validateUserRow(record, i + 2); // +2 for header and 1-based indexing
        
        if (rowErrors.length === 0) {
          sampleData.push(record as UserImportRow);
        } else {
          errors.push(...rowErrors);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        sampleData: sampleData.length > 0 ? sampleData : undefined,
      };

    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Generate CSV template for user import
   */
  generateCSVTemplate(): string {
    const headers = [
      'email',
      'username',
      'firstName',
      'lastName',
      'password',
      'phoneNumber',
      'isEmailVerified',
      'roles',
      'sendWelcomeEmail'
    ];

    const sampleData = [
      [
        'john.doe@example.com',
        'johndoe',
        'John',
        'Doe',
        'SecurePass123!',
        '+1234567890',
        'true',
        'user,customer',
        'true'
      ],
      [
        'jane.smith@example.com',
        'janesmith',
        'Jane',
        'Smith',
        'AnotherPass456!',
        '+1987654321',
        'false',
        'user',
        'false'
      ]
    ];

    let csv = headers.join(',') + '\n';
    for (const row of sampleData) {
      csv += row.map(field => `"${field}"`).join(',') + '\n';
    }

    return csv;
  }

  // Private helper methods

  private async parseCSV(csvContent: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const records: any[] = [];
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: true,
      });

      parser.on('readable', function() {
        let record;
        while ((record = parser.read())) {
          records.push(record);
        }
      });

      parser.on('error', function(err) {
        reject(err);
      });

      parser.on('end', function() {
        resolve(records);
      });

      const stream = Readable.from([csvContent]);
      stream.pipe(parser);
    });
  }

  private async processBatch(
    batch: any[],
    startIndex: number,
    result: BulkImportResult,
    importedBy: string,
    options: any
  ): Promise<void> {
    for (let i = 0; i < batch.length; i++) {
      const record = batch[i];
      const rowNumber = startIndex + i + 2; // +2 for header and 1-based indexing

      try {
        // Validate record
        const validationErrors = this.validateUserRow(record, rowNumber);
        if (validationErrors.length > 0) {
          result.errors.push({
            row: rowNumber,
            email: record.email,
            username: record.username,
            error: validationErrors.join('; '),
          });
          result.failed++;
          continue;
        }

        // Check for duplicates if not skipping
        if (!options.skipDuplicates) {
          const existing = await userService.findByEmailOrUsername(record.email, record.username);
          if (existing) {
            result.errors.push({
              row: rowNumber,
              email: record.email,
              username: record.username,
              error: `User with email ${record.email} or username ${record.username} already exists`,
            });
            result.failed++;
            continue;
          }
        }

        // Create user data
        const userData: CreateUserData = {
          email: record.email.toLowerCase().trim(),
          username: record.username?.trim(),
          firstName: record.firstName.trim(),
          lastName: record.lastName.trim(),
          password: record.password || this.generatePassword(),
          phoneNumber: record.phoneNumber?.trim(),
          isEmailVerified: this.parseBoolean(record.isEmailVerified),
          createdBy: importedBy,
        };

        // Create user
        const user = await userService.createUser(userData);

        // Assign roles if specified
        if (record.roles || options.defaultRoles) {
          const roles = this.parseRoles(record.roles) || options.defaultRoles || [];
          if (roles.length > 0) {
            await this.assignRoles(user.id, roles, importedBy);
          }
        }

        result.createdUsers.push({
          id: user.id,
          email: user.email,
          username: user.username ?? undefined,
        });
        result.successful++;

        // Send welcome email if requested
        if (options.sendWelcomeEmails && this.parseBoolean(record.sendWelcomeEmail, true)) {
          try {
            await emailService.sendWelcomeEmail(user.email, user.firstName);
          } catch (emailError) {
            logger.warn(`Failed to send welcome email to ${user.email}:`, emailError);
          }
        }

      } catch (error) {
        logger.error(`Failed to create user at row ${rowNumber}:`, error);
        result.errors.push({
          row: rowNumber,
          email: record.email,
          username: record.username,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        result.failed++;
      }
    }
  }

  private validateUserRow(record: any, _rowNumber: number): string[] {
    const errors: string[] = [];

    // Required fields
    if (!record.email) {
      errors.push('Email is required');
    } else if (!this.isValidEmail(record.email)) {
      errors.push('Invalid email format');
    }

    if (!record.firstName) {
      errors.push('First name is required');
    }

    if (!record.lastName) {
      errors.push('Last name is required');
    }

    // Optional field validation
    if (record.username && !this.isValidUsername(record.username)) {
      errors.push('Invalid username format (3-30 chars, alphanumeric and underscore only)');
    }

    if (record.password && !this.isValidPassword(record.password)) {
      errors.push('Password must be at least 8 characters long');
    }

    if (record.phoneNumber && !this.isValidPhoneNumber(record.phoneNumber)) {
      errors.push('Invalid phone number format');
    }

    return errors;
  }

  private buildExportFilters(filters?: BulkExportOptions['filters']): Prisma.UserWhereInput {
    if (!filters) {
      return {};
    }

    const where: Prisma.UserWhereInput = {};

    if (filters.createdAfter || filters.createdBefore) {
      where.createdAt = {};
      if (filters.createdAfter) {
        where.createdAt.gte = filters.createdAfter;
      }
      if (filters.createdBefore) {
        where.createdAt.lte = filters.createdBefore;
      }
    }

    if (filters.lastLoginAfter || filters.lastLoginBefore) {
      where.lastLoginAt = {};
      if (filters.lastLoginAfter) {
        where.lastLoginAt.gte = filters.lastLoginAfter;
      }
      if (filters.lastLoginBefore) {
        where.lastLoginAt.lte = filters.lastLoginBefore;
      }
    }

    if (typeof filters.emailVerified === 'boolean') {
      where.isEmailVerified = filters.emailVerified;
    }

    if (filters.roles && filters.roles.length > 0) {
      where.roles = {
        some: {
          role: {
            name: { in: filters.roles },
          },
        },
      };
    }

    return where;
  }

  private formatUsersForExport(users: any[], options: BulkExportOptions): any[] {
    const fields = options.fields || [
      'id', 'email', 'username', 'firstName', 'lastName', 
      'phoneNumber', 'isActive', 'isEmailVerified', 'lastLoginAt', 'createdAt'
    ];

    return users.map(user => {
      const exportUser: any = {};
      
      fields.forEach(field => {
        if (field in user) {
          exportUser[field] = user[field];
        }
      });

      if (options.includeRoles && user.roles) {
        exportUser.roles = user.roles.map((ur: any) => ur.role.name);
      }

      return exportUser;
    });
  }

  private async formatUsersAsCSV(users: any[], options: BulkExportOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      const fields = options.fields || [
        'id', 'email', 'username', 'firstName', 'lastName', 
        'phoneNumber', 'isActive', 'isEmailVerified', 'lastLoginAt', 'createdAt'
      ];

      if (options.includeRoles) {
        fields.push('roles');
      }

      const csvData = users.map(user => {
        const row: any = {};
        fields.forEach(field => {
          if (field === 'roles' && user.roles) {
            row[field] = user.roles.map((ur: any) => ur.role.name).join(';');
          } else {
            row[field] = user[field] || '';
          }
        });
        return row;
      });

      stringify(csvData, { 
        header: true,
        columns: fields 
      }, (err, output) => {
        if (err) {
          reject(err);
        } else {
          resolve(output);
        }
      });
    });
  }

  private async assignRoles(userId: string, roleNames: string[], assignedBy: string): Promise<void> {
    try {
      // Get role IDs from names
      const roles = await prisma.role.findMany({
        where: { name: { in: roleNames } },
      });

      if (roles.length !== roleNames.length) {
        const foundRoles = roles.map(r => r.name);
        const missingRoles = roleNames.filter(name => !foundRoles.includes(name));
        logger.warn(`Some roles not found for user ${userId}: ${missingRoles.join(', ')}`);
      }

      if (roles.length > 0) {
        await userService.assignRoles(userId, roles.map(r => r.id), assignedBy);
      }
    } catch (error) {
      logger.error(`Failed to assign roles to user ${userId}:`, error);
      throw error;
    }
  }

  private generatePassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }

  private parseBoolean(value: any, defaultValue = false): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
    }
    return defaultValue;
  }

  private parseRoles(rolesString: string): string[] | null {
    if (!rolesString) {
      return null;
    }
    return rolesString.split(',').map(role => role.trim()).filter(role => role.length > 0);
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidUsername(username: string): boolean {
    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
    return usernameRegex.test(username);
  }

  private isValidPassword(password: string): boolean {
    return password.length >= 8;
  }

  private isValidPhoneNumber(phone: string): boolean {
    const phoneRegex = /^[+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-()]/g, ''));
  }

  private isSystemUser(user: any): boolean {
    // Consider users with super_admin role or system-created users as system users
    return user.roles?.some((ur: any) => ur.role.name === 'super_admin') || 
           user.email?.endsWith('@system.local');
  }

  private async sendAccountDeletionEmail(email: string, firstName: string): Promise<void> {
    const emailContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #dc3545;">Account Deletion Notification</h2>
            
            <p>Hello ${firstName},</p>
            
            <p>We are writing to inform you that your account has been deleted from our system.</p>
            
            <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <h4 style="color: #721c24; margin-top: 0;">Account Details</h4>
              <p style="margin-bottom: 0; color: #721c24;">
                <strong>Email:</strong> ${email}<br>
                <strong>Deletion Date:</strong> ${new Date().toISOString()}<br>
                <strong>Reason:</strong> Administrative action
              </p>
            </div>
            
            <p>If you believe this was done in error, please contact our support team immediately.</p>
            
            <p>Thank you for using our services.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #666;">
              This is an automated notification from TekParola SSO System.<br>
              Time: ${new Date().toISOString()}
            </p>
          </div>
        </body>
      </html>
    `;

    await emailService.sendEmail({
      to: email,
      subject: 'Account Deletion Notification',
      htmlContent: emailContent,
    });
  }
}

export const userBulkService = new UserBulkService();