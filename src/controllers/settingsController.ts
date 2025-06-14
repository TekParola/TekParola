import { Request, Response } from 'express';
import { settingsService } from '../services/settingsService';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../utils/errors';

export class SettingsController {
  // Get all settings (public or all for admins)
  getAllSettings = asyncHandler(async (req: Request, res: Response) => {
    const { includePrivate = false } = req.query;
    const isAdmin = req.user?.roles?.some((role: any) => role.name === 'admin' || role.name === 'super_admin');
    
    const shouldIncludePrivate = isAdmin && includePrivate === 'true';
    const settings = await settingsService.getAllSettings(shouldIncludePrivate);

    return res.status(200).json({
      success: true,
      message: 'Settings retrieved successfully',
      data: {
        settings: settings.map(setting => ({
          key: setting.key,
          value: (settingsService as any).parseSettingValue(setting.value, setting.type),
          type: setting.type,
          description: setting.description,
          category: setting.category,
          isPublic: setting.isPublic,
          updatedAt: setting.updatedAt,
          updatedBy: setting.updatedBy,
        })),
      },
    });
  });

  // Get settings by category
  getSettingsByCategory = asyncHandler(async (req: Request, res: Response) => {
    const { category } = req.params;
    const { includePrivate = false } = req.query;
    const isAdmin = req.user?.roles?.some((role: any) => role.name === 'admin' || role.name === 'super_admin');
    
    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Category is required',
      });
    }
    
    const shouldIncludePrivate = isAdmin && includePrivate === 'true';
    const settings = await settingsService.getSettingsByCategory(category, shouldIncludePrivate);

    return res.status(200).json({
      success: true,
      message: `Settings for category '${category}' retrieved successfully`,
      data: {
        category,
        settings: settings.map(setting => ({
          key: setting.key,
          value: (settingsService as any).parseSettingValue(setting.value, setting.type),
          type: setting.type,
          description: setting.description,
          isPublic: setting.isPublic,
          updatedAt: setting.updatedAt,
          updatedBy: setting.updatedBy,
        })),
      },
    });
  });

  // Get grouped settings
  getGroupedSettings = asyncHandler(async (req: Request, res: Response) => {
    const { includePrivate = false } = req.query;
    const isAdmin = req.user?.roles?.some((role: any) => role.name === 'admin' || role.name === 'super_admin');
    
    const shouldIncludePrivate = isAdmin && includePrivate === 'true';
    const groupedSettings = await settingsService.getGroupedSettings(shouldIncludePrivate);

    return res.status(200).json({
      success: true,
      message: 'Grouped settings retrieved successfully',
      data: {
        settings: groupedSettings,
      },
    });
  });

  // Get specific setting value
  getSettingValue = asyncHandler(async (req: Request, res: Response) => {
    const { key } = req.params;
    
    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Setting key is required',
      });
    }
    
    const setting = await settingsService.findByKey(key);
    if (!setting) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found',
      });
    }

    // Check if user can access private settings
    const isAdmin = req.user?.roles?.some((role: any) => role.name === 'admin' || role.name === 'super_admin');
    if (!setting.isPublic && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to private setting',
      });
    }

    const value = await settingsService.getSettingValue(key);

    return res.status(200).json({
      success: true,
      message: 'Setting value retrieved successfully',
      data: {
        key: setting.key,
        value,
        type: setting.type,
        description: setting.description,
        category: setting.category,
        isPublic: setting.isPublic,
        updatedAt: setting.updatedAt,
        updatedBy: setting.updatedBy,
      },
    });
  });

  // Create new setting (admin only)
  createSetting = asyncHandler(async (req: Request, res: Response) => {
    const { key, value, type, description, category, isPublic } = req.body;
    const adminUserId = req.user!.id;

    if (!key || !value || !type) {
      throw new ValidationError('Key, value, and type are required');
    }

    const setting = await settingsService.createSetting({
      key,
      value: String(value),
      type,
      description,
      category,
      isPublic,
      updatedBy: adminUserId,
    });

    return res.status(201).json({
      success: true,
      message: 'Setting created successfully',
      data: {
        setting: {
          key: setting.key,
          value: (settingsService as any).parseSettingValue(setting.value, setting.type),
          type: setting.type,
          description: setting.description,
          category: setting.category,
          isPublic: setting.isPublic,
          updatedAt: setting.updatedAt,
          updatedBy: setting.updatedBy,
        },
      },
    });
  });

  // Update setting (admin only)
  updateSetting = asyncHandler(async (req: Request, res: Response) => {
    const { key } = req.params;
    const { value, description, category, isPublic } = req.body;
    const adminUserId = req.user!.id;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Setting key is required',
      });
    }

    if (value === undefined) {
      throw new ValidationError('Value is required');
    }

    const setting = await settingsService.updateSetting(key, {
      value: String(value),
      description,
      category,
      isPublic,
      updatedBy: adminUserId,
    });

    return res.status(200).json({
      success: true,
      message: 'Setting updated successfully',
      data: {
        setting: {
          key: setting.key,
          value: (settingsService as any).parseSettingValue(setting.value, setting.type),
          type: setting.type,
          description: setting.description,
          category: setting.category,
          isPublic: setting.isPublic,
          updatedAt: setting.updatedAt,
          updatedBy: setting.updatedBy,
        },
      },
    });
  });

  // Delete setting (admin only)
  deleteSetting = asyncHandler(async (req: Request, res: Response) => {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Setting key is required',
      });
    }

    await settingsService.deleteSetting(key);

    return res.status(200).json({
      success: true,
      message: 'Setting deleted successfully',
    });
  });

  // Bulk update settings (admin only)
  bulkUpdateSettings = asyncHandler(async (req: Request, res: Response) => {
    const { updates } = req.body;
    const adminUserId = req.user!.id;

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new ValidationError('Updates array is required and must not be empty');
    }

    // Validate updates format
    for (const update of updates) {
      if (!update.key || update.value === undefined) {
        throw new ValidationError('Each update must have key and value');
      }
    }

    await settingsService.bulkUpdateSettings(updates, adminUserId);

    return res.status(200).json({
      success: true,
      message: `${updates.length} settings updated successfully`,
      data: {
        updatedCount: updates.length,
      },
    });
  });

  // Reset settings to defaults (admin only)
  resetToDefaults = asyncHandler(async (req: Request, res: Response) => {
    const { category } = req.query;

    await settingsService.resetToDefaults(category as string);

    return res.status(200).json({
      success: true,
      message: category 
        ? `Settings reset to defaults for category: ${category}`
        : 'All settings reset to defaults',
    });
  });

  // Get setting categories
  getCategories = asyncHandler(async (req: Request, res: Response) => {
    const categories = await settingsService.getCategories();

    return res.status(200).json({
      success: true,
      message: 'Setting categories retrieved successfully',
      data: {
        categories,
      },
    });
  });

  // Initialize default settings (admin only, typically called during setup)
  initializeDefaults = asyncHandler(async (req: Request, res: Response) => {
    const adminUserId = req.user!.id;
    const defaultSettings = (settingsService as any).getDefaultSettings();
    
    const createdSettings = [];
    const skippedSettings = [];

    for (const [key, config] of Object.entries(defaultSettings) as [string, any][]) {
      try {
        const existingSetting = await settingsService.findByKey(key);
        if (!existingSetting) {
          const setting = await settingsService.createSetting({
            key,
            value: String(config.value),
            type: typeof config.value === 'boolean' ? 'boolean' : 
                  typeof config.value === 'number' ? 'number' : 'string',
            description: config.description,
            category: config.category,
            isPublic: config.isPublic,
            updatedBy: adminUserId,
          });
          createdSettings.push(setting.key);
        } else {
          skippedSettings.push(key);
        }
      } catch (error) {
        logger.error(`Failed to create default setting ${key}:`, error);
        skippedSettings.push(key);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Default settings initialization completed',
      data: {
        created: createdSettings.length,
        skipped: skippedSettings.length,
        createdSettings,
        skippedSettings,
      },
    });
  });
}

export const settingsController = new SettingsController();