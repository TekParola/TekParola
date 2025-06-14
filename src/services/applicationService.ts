import { Application, ApiKey, Prisma } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';
import { cacheService } from './cacheService';

export interface CreateApplicationData {
  name: string;
  displayName: string;
  description?: string;
  redirectUris: string[];
  scopes: string[];
  website?: string;
  contactEmail?: string;
  isFirstParty?: boolean;
  allowedOrigins?: string[];
  tokenLifetime?: number;
  refreshTokenLifetime?: number;
  createdBy?: string;
}

export interface UpdateApplicationData {
  displayName?: string;
  description?: string;
  redirectUris?: string[];
  scopes?: string[];
  website?: string;
  contactEmail?: string;
  isActive?: boolean;
  allowedOrigins?: string[];
  tokenLifetime?: number;
  refreshTokenLifetime?: number;
  updatedBy?: string;
}

export interface ApplicationWithKeys extends Application {
  apiKeys: ApiKey[];
}

export interface CreateApiKeyData {
  applicationId: string;
  name: string;
  permissions: string[];
  expiresAt?: Date;
  rateLimit?: number;
  rateLimitWindow?: number;
  createdBy?: string;
}

export interface UpdateApiKeyData {
  name?: string;
  permissions?: string[];
  isActive?: boolean;
  expiresAt?: Date;
  rateLimit?: number;
  rateLimitWindow?: number;
  updatedBy?: string;
}

export class ApplicationService {
  async createApplication(appData: CreateApplicationData): Promise<Application> {
    try {
      // Check if application name already exists
      const existingApp = await prisma.application.findUnique({
        where: { name: appData.name },
      });

      if (existingApp) {
        throw new ConflictError('Application with this name already exists');
      }

      // Generate client ID and secret
      const clientId = this.generateClientId();
      const clientSecret = this.generateClientSecret();

      const application = await prisma.application.create({
        data: {
          name: appData.name,
          displayName: appData.displayName,
          description: appData.description,
          clientId,
          clientSecret,
          redirectUris: appData.redirectUris,
          scopes: appData.scopes,
          website: appData.website,
          contactEmail: appData.contactEmail,
          isFirstParty: appData.isFirstParty || false,
          allowedOrigins: appData.allowedOrigins || [],
          tokenLifetime: appData.tokenLifetime || 3600,
          refreshTokenLifetime: appData.refreshTokenLifetime || 604800,
          createdBy: appData.createdBy,
        },
      });

      logger.info(`Application created: ${application.id} (${application.name})`);
      return application;
    } catch (error) {
      logger.error('Failed to create application:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<Application | null> {
    try {
      return await cacheService.getOrSet(
        cacheService.getCacheKeyConfig('APPLICATION_BY_ID')?.pattern.replace('{id}', id) || `app:id:${id}`,
        async () => {
          return await prisma.application.findUnique({
            where: { id },
          });
        },
        { ttl: cacheService.getCacheKeyConfig('APPLICATION_BY_ID')?.ttl || 3600 }
      );
    } catch (error) {
      logger.error('Failed to find application by ID:', error);
      throw error;
    }
  }


  async findWithApiKeys(id: string): Promise<ApplicationWithKeys | null> {
    try {
      return await prisma.application.findUnique({
        where: { id },
        include: {
          apiKeys: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    } catch (error) {
      logger.error('Failed to find application with API keys:', error);
      throw error;
    }
  }

  async updateApplication(id: string, updateData: UpdateApplicationData): Promise<Application> {
    try {
      const application = await this.findById(id);
      if (!application) {
        throw new NotFoundError('Application not found');
      }

      const updatedApplication = await prisma.application.update({
        where: { id },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
      });

      // Invalidate application cache
      await cacheService.invalidateKey('APPLICATION_BY_ID', { id });
      await cacheService.invalidateKey('APPLICATION_BY_CLIENT_ID', { clientId: application.clientId });

      logger.info(`Application updated: ${updatedApplication.id} (${updatedApplication.name})`);
      return updatedApplication;
    } catch (error) {
      logger.error('Failed to update application:', error);
      throw error;
    }
  }

  async deleteApplication(id: string): Promise<void> {
    try {
      const application = await this.findById(id);
      if (!application) {
        throw new NotFoundError('Application not found');
      }

      await prisma.application.delete({
        where: { id },
      });

      logger.info(`Application deleted: ${id} (${application.name})`);
    } catch (error) {
      logger.error('Failed to delete application:', error);
      throw error;
    }
  }

  async getAllApplications(includeInactive = false): Promise<Application[]> {
    try {
      const where: Prisma.ApplicationWhereInput = includeInactive ? {} : { isActive: true };

      return await prisma.application.findMany({
        where,
        orderBy: { displayName: 'asc' },
      });
    } catch (error) {
      logger.error('Failed to get all applications:', error);
      throw error;
    }
  }

  async searchApplications(
    query: string,
    limit = 10,
    offset = 0
  ): Promise<{ applications: Application[]; total: number }> {
    try {
      const where: Prisma.ApplicationWhereInput = {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      };

      const [applications, total] = await Promise.all([
        prisma.application.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { displayName: 'asc' },
        }),
        prisma.application.count({ where }),
      ]);

      return { applications, total };
    } catch (error) {
      logger.error('Failed to search applications:', error);
      throw error;
    }
  }

  async regenerateClientSecret(id: string): Promise<{ clientSecret: string }> {
    try {
      const application = await this.findById(id);
      if (!application) {
        throw new NotFoundError('Application not found');
      }

      const newClientSecret = this.generateClientSecret();

      await prisma.application.update({
        where: { id },
        data: {
          clientSecret: newClientSecret,
          updatedAt: new Date(),
        },
      });

      logger.info(`Client secret regenerated for application: ${application.name}`);
      return { clientSecret: newClientSecret };
    } catch (error) {
      logger.error('Failed to regenerate client secret:', error);
      throw error;
    }
  }

  // API Key Management

  async createApiKey(keyData: CreateApiKeyData): Promise<{ apiKey: ApiKey; keySecret: string }> {
    try {
      // Verify application exists
      const application = await this.findById(keyData.applicationId);
      if (!application) {
        throw new NotFoundError('Application not found');
      }

      // Generate key ID and secret
      const keyId = this.generateKeyId();
      const keySecret = this.generateKeySecret();

      const apiKey = await prisma.apiKey.create({
        data: {
          applicationId: keyData.applicationId,
          name: keyData.name,
          keyId,
          keySecret: this.hashSecret(keySecret),
          permissions: keyData.permissions,
          expiresAt: keyData.expiresAt,
          rateLimit: keyData.rateLimit || 1000,
          rateLimitWindow: keyData.rateLimitWindow || 3600,
          createdBy: keyData.createdBy,
        },
      });

      logger.info(`API key created: ${apiKey.id} for application ${application.name}`);
      return { apiKey, keySecret };
    } catch (error) {
      logger.error('Failed to create API key:', error);
      throw error;
    }
  }

  async findApiKeyById(id: string): Promise<ApiKey | null> {
    try {
      return await prisma.apiKey.findUnique({
        where: { id },
      });
    } catch (error) {
      logger.error('Failed to find API key by ID:', error);
      throw error;
    }
  }

  async findApiKeyByKeyId(keyId: string): Promise<ApiKey | null> {
    try {
      return await prisma.apiKey.findUnique({
        where: { keyId },
        include: {
          application: true,
        },
      });
    } catch (error) {
      logger.error('Failed to find API key by key ID:', error);
      throw error;
    }
  }

  async updateApiKey(id: string, updateData: UpdateApiKeyData): Promise<ApiKey> {
    try {
      const apiKey = await this.findApiKeyById(id);
      if (!apiKey) {
        throw new NotFoundError('API key not found');
      }

      const updatedApiKey = await prisma.apiKey.update({
        where: { id },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
      });

      logger.info(`API key updated: ${updatedApiKey.id}`);
      return updatedApiKey;
    } catch (error) {
      logger.error('Failed to update API key:', error);
      throw error;
    }
  }

  async deleteApiKey(id: string): Promise<void> {
    try {
      const apiKey = await this.findApiKeyById(id);
      if (!apiKey) {
        throw new NotFoundError('API key not found');
      }

      await prisma.apiKey.delete({
        where: { id },
      });

      logger.info(`API key deleted: ${id}`);
    } catch (error) {
      logger.error('Failed to delete API key:', error);
      throw error;
    }
  }

  async getApplicationApiKeys(applicationId: string): Promise<ApiKey[]> {
    try {
      return await prisma.apiKey.findMany({
        where: { applicationId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      logger.error('Failed to get application API keys:', error);
      throw error;
    }
  }

  async verifyApiKey(keyId: string, keySecret: string): Promise<{ valid: boolean; apiKey?: ApiKey }> {
    try {
      const apiKey = await this.findApiKeyByKeyId(keyId);
      
      if (!apiKey || !apiKey.isActive) {
        return { valid: false };
      }

      // Check expiration
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return { valid: false };
      }

      // Verify secret
      const hashedSecret = this.hashSecret(keySecret);
      if (hashedSecret !== apiKey.keySecret) {
        return { valid: false };
      }

      // Update last used
      await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: {
          lastUsedAt: new Date(),
        },
      });

      return { valid: true, apiKey };
    } catch (error) {
      logger.error('Failed to verify API key:', error);
      return { valid: false };
    }
  }

  async getApplicationStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    firstParty: number;
    thirdParty: number;
  }> {
    try {
      const [total, active, inactive, firstParty, thirdParty] = await Promise.all([
        prisma.application.count(),
        prisma.application.count({ where: { isActive: true } }),
        prisma.application.count({ where: { isActive: false } }),
        prisma.application.count({ where: { isFirstParty: true } }),
        prisma.application.count({ where: { isFirstParty: false } }),
      ]);

      return {
        total,
        active,
        inactive,
        firstParty,
        thirdParty,
      };
    } catch (error) {
      logger.error('Failed to get application stats:', error);
      throw error;
    }
  }

  async findByClientId(clientId: string): Promise<ApplicationWithKeys | null> {
    try {
      return await prisma.application.findUnique({
        where: { clientId },
        include: {
          apiKeys: {
            where: { isActive: true },
          },
        },
      });
    } catch (error) {
      logger.error('Failed to find application by client ID:', error);
      throw error;
    }
  }

  async validateApiKey(keyId: string): Promise<ApplicationWithKeys> {
    try {
      const apiKey = await prisma.apiKey.findUnique({
        where: { keyId },
        include: {
          application: {
            include: {
              apiKeys: {
                where: { isActive: true },
              },
            },
          },
        },
      });

      if (!apiKey || !apiKey.isActive) {
        throw new ValidationError('Invalid or inactive API key');
      }

      if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
        throw new ValidationError('API key has expired');
      }

      if (!apiKey.application || !apiKey.application.isActive) {
        throw new ValidationError('Application is not active');
      }

      return apiKey.application as ApplicationWithKeys;
    } catch (error) {
      logger.error('Failed to validate API key:', error);
      throw error;
    }
  }

  async validateClientSecret(applicationId: string, clientSecret: string): Promise<boolean> {
    try {
      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: { clientSecret: true },
      });

      if (!application) {
        return false;
      }

      return application.clientSecret === clientSecret;
    } catch (error) {
      logger.error('Failed to validate client secret:', error);
      return false;
    }
  }

  // API Key Rotation Methods

  async rotateApiKey(id: string, rotatedBy?: string): Promise<{ apiKey: ApiKey; keySecret: string; oldKeyId: string }> {
    try {
      const apiKey = await this.findApiKeyById(id);
      if (!apiKey) {
        throw new NotFoundError('API key not found');
      }

      const oldKeyId = apiKey.keyId;

      // Generate new key ID and secret
      const newKeyId = this.generateKeyId();
      const newKeySecret = this.generateKeySecret();

      const updatedApiKey = await prisma.apiKey.update({
        where: { id },
        data: {
          keyId: newKeyId,
          keySecret: this.hashSecret(newKeySecret),
          lastRotatedAt: new Date(),
          rotatedBy,
          updatedAt: new Date(),
        },
      });

      // Create audit log for rotation
      try {
        const { auditService } = await import('./auditService');
        await auditService.log({
          applicationId: apiKey.applicationId,
          action: 'api_key_rotate',
          resource: 'api_key',
          resourceId: id,
          details: {
            oldKeyId,
            newKeyId,
            rotatedBy,
            rotationReason: 'manual_rotation',
          },
          ipAddress: 'system',
          userAgent: 'system',
          success: true,
        });
      } catch (auditError) {
        logger.warn('Failed to create audit log for key rotation:', auditError);
      }

      logger.info(`API key rotated: ${id} (${oldKeyId} -> ${newKeyId})`);
      return { apiKey: updatedApiKey, keySecret: newKeySecret, oldKeyId };
    } catch (error) {
      logger.error('Failed to rotate API key:', error);
      throw error;
    }
  }

  async scheduleApiKeyRotation(id: string, rotationDate: Date, rotatedBy?: string): Promise<ApiKey> {
    try {
      const apiKey = await this.findApiKeyById(id);
      if (!apiKey) {
        throw new NotFoundError('API key not found');
      }

      const updatedApiKey = await prisma.apiKey.update({
        where: { id },
        data: {
          scheduledRotationAt: rotationDate,
          updatedBy: rotatedBy,
          updatedAt: new Date(),
        },
      });

      logger.info(`API key rotation scheduled: ${id} for ${rotationDate.toISOString()}`);
      return updatedApiKey;
    } catch (error) {
      logger.error('Failed to schedule API key rotation:', error);
      throw error;
    }
  }

  async getApiKeysForRotation(): Promise<ApiKey[]> {
    try {
      const now = new Date();
      
      // First, get keys that are scheduled for rotation
      const scheduledKeys = await prisma.apiKey.findMany({
        where: {
          AND: [
            { isActive: true },
            { scheduledRotationAt: { lte: now } },
          ]
        },
        include: {
          application: true,
        },
      });

      // Then, get keys that need auto-rotation based on their age
      const autoRotationKeys = await prisma.apiKey.findMany({
        where: {
          AND: [
            { isActive: true },
            { autoRotateAfterDays: { not: null } },
          ]
        },
        include: {
          application: true,
        },
      });

      // Filter auto-rotation keys based on their actual rotation period
      const filteredAutoKeys = autoRotationKeys.filter(key => {
        if (!key.autoRotateAfterDays) {
          return false;
        }
        
        const rotationThreshold = new Date(now.getTime() - (key.autoRotateAfterDays * 24 * 60 * 60 * 1000));
        const lastRotation = key.lastRotatedAt || key.createdAt;
        
        return lastRotation <= rotationThreshold;
      });

      // Combine and deduplicate
      const allKeys = [...scheduledKeys, ...filteredAutoKeys];
      const uniqueKeys = allKeys.filter((key, index, self) => 
        self.findIndex(k => k.id === key.id) === index
      );

      return uniqueKeys;
    } catch (error) {
      logger.error('Failed to get API keys for rotation:', error);
      throw error;
    }
  }

  async enableAutoRotation(id: string, rotateAfterDays: number, updatedBy?: string): Promise<ApiKey> {
    try {
      const apiKey = await this.findApiKeyById(id);
      if (!apiKey) {
        throw new NotFoundError('API key not found');
      }

      if (rotateAfterDays < 1 || rotateAfterDays > 365) {
        throw new ValidationError('Auto rotation period must be between 1 and 365 days');
      }

      const updatedApiKey = await prisma.apiKey.update({
        where: { id },
        data: {
          autoRotateAfterDays: rotateAfterDays,
          updatedBy,
          updatedAt: new Date(),
        },
      });

      logger.info(`Auto rotation enabled for API key ${id}: ${rotateAfterDays} days`);
      return updatedApiKey;
    } catch (error) {
      logger.error('Failed to enable auto rotation:', error);
      throw error;
    }
  }

  async disableAutoRotation(id: string, updatedBy?: string): Promise<ApiKey> {
    try {
      const apiKey = await this.findApiKeyById(id);
      if (!apiKey) {
        throw new NotFoundError('API key not found');
      }

      const updatedApiKey = await prisma.apiKey.update({
        where: { id },
        data: {
          autoRotateAfterDays: null,
          scheduledRotationAt: null,
          updatedBy,
          updatedAt: new Date(),
        },
      });

      logger.info(`Auto rotation disabled for API key: ${id}`);
      return updatedApiKey;
    } catch (error) {
      logger.error('Failed to disable auto rotation:', error);
      throw error;
    }
  }

  async getApiKeyRotationHistory(apiKeyId: string, limit = 10): Promise<any[]> {
    try {
      const { auditService } = await import('./auditService');
      
      return await auditService.findMany({
        action: 'api_key_rotate',
        resource: 'api_key',
      }, {
        limit,
        offset: 0,
      });
    } catch (error) {
      logger.error('Failed to get API key rotation history:', error);
      throw error;
    }
  }

  async getApiKeyStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    scheduledForRotation: number;
    autoRotationEnabled: number;
  }> {
    try {
      const now = new Date();
      
      const [total, active, expired, scheduledForRotation, autoRotationEnabled] = await Promise.all([
        prisma.apiKey.count(),
        prisma.apiKey.count({ where: { isActive: true } }),
        prisma.apiKey.count({ 
          where: { 
            expiresAt: { lt: now },
            isActive: true 
          } 
        }),
        prisma.apiKey.count({ 
          where: { 
            scheduledRotationAt: { lte: now },
            isActive: true 
          } 
        }),
        prisma.apiKey.count({ 
          where: { 
            autoRotateAfterDays: { not: null },
            isActive: true 
          } 
        }),
      ]);

      return {
        total,
        active,
        expired,
        scheduledForRotation,
        autoRotationEnabled,
      };
    } catch (error) {
      logger.error('Failed to get API key stats:', error);
      throw error;
    }
  }

  private generateClientId(): string {
    return 'app_' + randomBytes(16).toString('hex');
  }

  private generateClientSecret(): string {
    return randomBytes(32).toString('hex');
  }

  private generateKeyId(): string {
    return 'ak_' + randomBytes(16).toString('hex');
  }

  private generateKeySecret(): string {
    return randomBytes(32).toString('hex');
  }

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }
}

export const applicationService = new ApplicationService();