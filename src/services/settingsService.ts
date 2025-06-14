import { SystemSetting, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { NotFoundError, ValidationError } from '../utils/errors';

export interface CreateSettingData {
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
  category?: string;
  isPublic?: boolean;
  updatedBy?: string;
}

export interface UpdateSettingData {
  value: string;
  description?: string;
  category?: string;
  isPublic?: boolean;
  updatedBy?: string;
}

export interface SettingsGroup {
  [category: string]: {
    [key: string]: {
      value: any;
      type: string;
      description?: string;
      isPublic: boolean;
      updatedAt: Date;
    };
  };
}

export class SettingsService {
  private readonly CACHE_PREFIX = 'settings:';
  private readonly CACHE_TTL = 300; // 5 minutes

  async createSetting(settingData: CreateSettingData): Promise<SystemSetting> {
    try {
      // Validate setting value based on type
      this.validateSettingValue(settingData.value, settingData.type);

      const setting = await prisma.systemSetting.create({
        data: {
          key: settingData.key,
          value: settingData.value,
          type: settingData.type,
          description: settingData.description,
          category: settingData.category || 'general',
          isPublic: settingData.isPublic || false,
          updatedBy: settingData.updatedBy,
        },
      });

      // Clear cache
      await this.clearSettingsCache();
      
      logger.info(`System setting created: ${setting.key}`);
      return setting;
    } catch (error) {
      logger.error('Failed to create system setting:', error);
      throw error;
    }
  }

  async updateSetting(key: string, updateData: UpdateSettingData): Promise<SystemSetting> {
    try {
      const existingSetting = await this.findByKey(key);
      if (!existingSetting) {
        throw new NotFoundError('System setting not found');
      }

      // Validate setting value based on existing type
      this.validateSettingValue(updateData.value, existingSetting.type);

      const setting = await prisma.systemSetting.update({
        where: { key },
        data: {
          value: updateData.value,
          description: updateData.description,
          category: updateData.category,
          isPublic: updateData.isPublic,
          updatedBy: updateData.updatedBy,
          updatedAt: new Date(),
        },
      });

      // Clear cache
      await this.clearSettingsCache();

      logger.info(`System setting updated: ${setting.key}`);
      return setting;
    } catch (error) {
      logger.error('Failed to update system setting:', error);
      throw error;
    }
  }

  async deleteSetting(key: string): Promise<void> {
    try {
      const setting = await this.findByKey(key);
      if (!setting) {
        throw new NotFoundError('System setting not found');
      }

      await prisma.systemSetting.delete({
        where: { key },
      });

      // Clear cache
      await this.clearSettingsCache();

      logger.info(`System setting deleted: ${key}`);
    } catch (error) {
      logger.error('Failed to delete system setting:', error);
      throw error;
    }
  }

  async findByKey(key: string): Promise<SystemSetting | null> {
    try {
      return await prisma.systemSetting.findUnique({
        where: { key },
      });
    } catch (error) {
      logger.error('Failed to find system setting:', error);
      throw error;
    }
  }

  async getAllSettings(includePrivate = false): Promise<SystemSetting[]> {
    try {
      const where: Prisma.SystemSettingWhereInput = includePrivate ? {} : { isPublic: true };

      return await prisma.systemSetting.findMany({
        where,
        orderBy: [{ category: 'asc' }, { key: 'asc' }],
      });
    } catch (error) {
      logger.error('Failed to get all system settings:', error);
      throw error;
    }
  }

  async getSettingsByCategory(category: string, includePrivate = false): Promise<SystemSetting[]> {
    try {
      const where: Prisma.SystemSettingWhereInput = {
        category,
        ...(includePrivate ? {} : { isPublic: true }),
      };

      return await prisma.systemSetting.findMany({
        where,
        orderBy: { key: 'asc' },
      });
    } catch (error) {
      logger.error('Failed to get settings by category:', error);
      throw error;
    }
  }

  async getGroupedSettings(includePrivate = false): Promise<SettingsGroup> {
    try {
      const settings = await this.getAllSettings(includePrivate);
      const grouped: SettingsGroup = {};

      for (const setting of settings) {
        const category = setting.category;
        if (!grouped[category]) {
          grouped[category] = {};
        }

        grouped[category][setting.key] = {
          value: this.parseSettingValue(setting.value, setting.type),
          type: setting.type,
          description: setting.description ?? undefined,
          isPublic: setting.isPublic,
          updatedAt: setting.updatedAt,
        };
      }

      return grouped;
    } catch (error) {
      logger.error('Failed to get grouped settings:', error);
      throw error;
    }
  }

  async getSettingValue<T = any>(key: string, defaultValue?: T): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.getFromCache(key);
      if (cached !== null) {
        return cached as T;
      }

      const setting = await this.findByKey(key);
      if (!setting) {
        return defaultValue as T;
      }

      const value = this.parseSettingValue(setting.value, setting.type);
      
      // Cache the value
      await this.setCache(key, value);
      
      return value as T;
    } catch (error) {
      logger.error(`Failed to get setting value for ${key}:`, error);
      return defaultValue as T;
    }
  }

  async setSettingValue(key: string, value: any, updatedBy?: string): Promise<void> {
    try {
      const setting = await this.findByKey(key);
      if (!setting) {
        throw new NotFoundError(`System setting not found: ${key}`);
      }

      const stringValue = this.stringifySettingValue(value, setting.type);
      
      await this.updateSetting(key, {
        value: stringValue,
        updatedBy,
      });
    } catch (error) {
      logger.error(`Failed to set setting value for ${key}:`, error);
      throw error;
    }
  }

  async bulkUpdateSettings(updates: Array<{ key: string; value: any }>, updatedBy?: string): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        for (const update of updates) {
          const setting = await tx.systemSetting.findUnique({
            where: { key: update.key },
          });

          if (setting) {
            const stringValue = this.stringifySettingValue(update.value, setting.type);
            await tx.systemSetting.update({
              where: { key: update.key },
              data: {
                value: stringValue,
                updatedBy,
                updatedAt: new Date(),
              },
            });
          }
        }
      });

      // Clear cache
      await this.clearSettingsCache();

      logger.info(`Bulk updated ${updates.length} system settings`);
    } catch (error) {
      logger.error('Failed to bulk update settings:', error);
      throw error;
    }
  }

  async resetToDefaults(category?: string): Promise<void> {
    try {
      const defaultSettings = this.getDefaultSettings();
      const updates = [];

      for (const [key, config] of Object.entries(defaultSettings)) {
        if (!category || config.category === category) {
          updates.push({ key, value: config.value });
        }
      }

      await this.bulkUpdateSettings(updates, 'system');
      logger.info(`Reset settings to defaults${category ? ` for category: ${category}` : ''}`);
    } catch (error) {
      logger.error('Failed to reset settings to defaults:', error);
      throw error;
    }
  }

  async getCategories(): Promise<string[]> {
    try {
      const result = await prisma.systemSetting.findMany({
        select: { category: true },
        distinct: ['category'],
        orderBy: { category: 'asc' },
      });

      return result.map(r => r.category);
    } catch (error) {
      logger.error('Failed to get setting categories:', error);
      throw error;
    }
  }

  private validateSettingValue(value: string, type: string): void {
    switch (type) {
      case 'boolean':
        if (!['true', 'false'].includes(value.toLowerCase())) {
          throw new ValidationError('Boolean setting must be "true" or "false"');
        }
        break;
      case 'number':
        if (isNaN(Number(value))) {
          throw new ValidationError('Number setting must be a valid number');
        }
        break;
      case 'json':
        try {
          JSON.parse(value);
        } catch {
          throw new ValidationError('JSON setting must be valid JSON');
        }
        break;
      case 'string':
        // No validation needed for strings
        break;
      default:
        throw new ValidationError(`Unknown setting type: ${type}`);
    }
  }

  private parseSettingValue(value: string, type: string): any {
    switch (type) {
      case 'boolean':
        return value.toLowerCase() === 'true';
      case 'number':
        return Number(value);
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      case 'string':
      default:
        return value;
    }
  }

  private stringifySettingValue(value: any, type: string): string {
    switch (type) {
      case 'boolean':
        return String(Boolean(value));
      case 'number':
        return String(Number(value));
      case 'json':
        return typeof value === 'string' ? value : JSON.stringify(value);
      case 'string':
      default:
        return String(value);
    }
  }

  private async getFromCache(key: string): Promise<any> {
    try {
      const cached = await redisClient.get(`${this.CACHE_PREFIX}${key}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.debug('Failed to get setting from cache:', error);
      return null;
    }
  }

  private async setCache(key: string, value: any): Promise<void> {
    try {
      await redisClient.setEx(
        `${this.CACHE_PREFIX}${key}`,
        this.CACHE_TTL,
        JSON.stringify(value)
      );
    } catch (error) {
      logger.debug('Failed to set setting in cache:', error);
    }
  }

  private async clearSettingsCache(): Promise<void> {
    try {
      const keys = await redisClient.keys(`${this.CACHE_PREFIX}*`);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (error) {
      logger.debug('Failed to clear settings cache:', error);
    }
  }

  private getDefaultSettings(): Record<string, { value: any; category: string; description: string; isPublic: boolean }> {
    return {
      registration_enabled: {
        value: true,
        category: 'auth',
        description: 'Allow new user registration',
        isPublic: true,
      },
      default_role: {
        value: 'user',
        category: 'auth',
        description: 'Default role for new users',
        isPublic: false,
      },
      company_name: {
        value: 'TekParola',
        category: 'branding',
        description: 'Company name',
        isPublic: true,
      },
      max_login_attempts: {
        value: 5,
        category: 'security',
        description: 'Maximum login attempts before lockout',
        isPublic: false,
      },
      lockout_duration: {
        value: 900,
        category: 'security',
        description: 'Lockout duration in seconds',
        isPublic: false,
      },
      session_timeout: {
        value: 86400,
        category: 'security',
        description: 'Session timeout in seconds',
        isPublic: false,
      },
      password_min_length: {
        value: 8,
        category: 'security',
        description: 'Minimum password length',
        isPublic: true,
      },
      password_require_uppercase: {
        value: true,
        category: 'security',
        description: 'Require uppercase letters in password',
        isPublic: true,
      },
      password_require_lowercase: {
        value: true,
        category: 'security',
        description: 'Require lowercase letters in password',
        isPublic: true,
      },
      password_require_numbers: {
        value: true,
        category: 'security',
        description: 'Require numbers in password',
        isPublic: true,
      },
      password_require_symbols: {
        value: true,
        category: 'security',
        description: 'Require symbols in password',
        isPublic: true,
      },
      email_verification_required: {
        value: false,
        category: 'email',
        description: 'Require email verification for new users',
        isPublic: true,
      },
      support_email: {
        value: 'support@tekparola.com',
        category: 'contact',
        description: 'Support email address',
        isPublic: true,
      },
      maintenance_mode: {
        value: false,
        category: 'system',
        description: 'Enable maintenance mode',
        isPublic: true,
      },
      api_rate_limit: {
        value: 1000,
        category: 'api',
        description: 'Default API rate limit per hour',
        isPublic: false,
      },
    };
  }
}

export const settingsService = new SettingsService();