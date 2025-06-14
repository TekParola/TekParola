import { Request, Response } from 'express';
import { applicationService } from '../services/applicationService';
import { asyncHandler } from '../middleware/errorHandler';
import { NotFoundError, ValidationError } from '../utils/errors';

export class ApplicationController {
  // Get all applications
  getAllApplications = asyncHandler(async (req: Request, res: Response) => {
    const { includeInactive = false } = req.query;

    const applications = await applicationService.getAllApplications(
      includeInactive === 'true'
    );

    res.status(200).json({
      success: true,
      message: 'Applications retrieved successfully',
      data: {
        applications: applications.map(app => ({
          id: app.id,
          name: app.name,
          displayName: app.displayName,
          description: app.description,
          clientId: app.clientId,
          isActive: app.isActive,
          isFirstParty: app.isFirstParty,
          website: app.website,
          contactEmail: app.contactEmail,
          createdAt: app.createdAt,
          updatedAt: app.updatedAt,
        })),
      },
    });
  });

  // Get application by ID
  getApplicationById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new NotFoundError('Application ID is required');
    }

    const application = await applicationService.findWithApiKeys(id);
    if (!application) {
      throw new NotFoundError('Application not found');
    }

    res.status(200).json({
      success: true,
      message: 'Application retrieved successfully',
      data: {
        application: {
          id: application.id,
          name: application.name,
          displayName: application.displayName,
          description: application.description,
          clientId: application.clientId,
          redirectUris: application.redirectUris,
          scopes: application.scopes,
          allowedOrigins: application.allowedOrigins,
          tokenLifetime: application.tokenLifetime,
          refreshTokenLifetime: application.refreshTokenLifetime,
          isActive: application.isActive,
          isFirstParty: application.isFirstParty,
          website: application.website,
          contactEmail: application.contactEmail,
          createdAt: application.createdAt,
          updatedAt: application.updatedAt,
          apiKeys: application.apiKeys.map(key => ({
            id: key.id,
            name: key.name,
            keyId: key.keyId,
            permissions: key.permissions,
            isActive: key.isActive,
            lastUsedAt: key.lastUsedAt,
            expiresAt: key.expiresAt,
            rateLimit: key.rateLimit,
            rateLimitWindow: key.rateLimitWindow,
            createdAt: key.createdAt,
          })),
        },
      },
    });
  });

  // Create new application
  createApplication = asyncHandler(async (req: Request, res: Response) => {
    const {
      name,
      displayName,
      description,
      redirectUris,
      scopes,
      website,
      contactEmail,
      isFirstParty,
      allowedOrigins,
      tokenLifetime,
      refreshTokenLifetime,
    } = req.body;

    const adminUserId = req.user!.id;

    const application = await applicationService.createApplication({
      name,
      displayName,
      description,
      redirectUris: redirectUris || [],
      scopes: scopes || [],
      website,
      contactEmail,
      isFirstParty: isFirstParty || false,
      allowedOrigins: allowedOrigins || [],
      tokenLifetime,
      refreshTokenLifetime,
      createdBy: adminUserId,
    });

    res.status(201).json({
      success: true,
      message: 'Application created successfully',
      data: {
        application: {
          id: application.id,
          name: application.name,
          displayName: application.displayName,
          clientId: application.clientId,
          clientSecret: application.clientSecret,
          isActive: application.isActive,
          createdAt: application.createdAt,
        },
      },
    });
  });

  // Update application
  updateApplication = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;
    const adminUserId = req.user!.id;

    if (!id) {
      throw new ValidationError('Application ID is required');
    }

    const application = await applicationService.updateApplication(id, {
      ...updateData,
      updatedBy: adminUserId,
    });

    res.status(200).json({
      success: true,
      message: 'Application updated successfully',
      data: {
        application: {
          id: application.id,
          name: application.name,
          displayName: application.displayName,
          isActive: application.isActive,
          updatedAt: application.updatedAt,
        },
      },
    });
  });

  // Delete application
  deleteApplication = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Application ID is required');
    }

    await applicationService.deleteApplication(id);

    res.status(200).json({
      success: true,
      message: 'Application deleted successfully',
    });
  });

  // Regenerate client secret
  regenerateClientSecret = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Application ID is required');
    }

    const { clientSecret } = await applicationService.regenerateClientSecret(id);

    res.status(200).json({
      success: true,
      message: 'Client secret regenerated successfully',
      data: {
        clientSecret,
        warning: 'Please update your application configuration with the new client secret. The old secret is now invalid.',
      },
    });
  });

  // Search applications
  searchApplications = asyncHandler(async (req: Request, res: Response) => {
    const { q, limit = 10, offset = 0 } = req.query;

    if (!q) {
      throw new ValidationError('Search query is required');
    }

    const { applications, total } = await applicationService.searchApplications(
      q as string,
      parseInt(limit as string, 10),
      parseInt(offset as string, 10)
    );

    res.status(200).json({
      success: true,
      message: 'Applications searched successfully',
      data: {
        applications: applications.map(app => ({
          id: app.id,
          name: app.name,
          displayName: app.displayName,
          description: app.description,
          isActive: app.isActive,
          isFirstParty: app.isFirstParty,
        })),
        pagination: {
          total,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
        },
      },
    });
  });

  // API Key Management

  // Create API key
  createApiKey = asyncHandler(async (req: Request, res: Response) => {
    const { id: applicationId } = req.params;
    const { name, permissions, expiresAt, rateLimit, rateLimitWindow } = req.body;
    const adminUserId = req.user!.id;

    if (!applicationId) {
      throw new ValidationError('Application ID is required');
    }

    const expirationDate = expiresAt ? new Date(expiresAt) : undefined;

    const { apiKey, keySecret } = await applicationService.createApiKey({
      applicationId,
      name,
      permissions: permissions || [],
      expiresAt: expirationDate,
      rateLimit,
      rateLimitWindow,
      createdBy: adminUserId,
    });

    res.status(201).json({
      success: true,
      message: 'API key created successfully',
      data: {
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          keyId: apiKey.keyId,
          keySecret, // Only returned once
          permissions: apiKey.permissions,
          expiresAt: apiKey.expiresAt,
          rateLimit: apiKey.rateLimit,
          rateLimitWindow: apiKey.rateLimitWindow,
          createdAt: apiKey.createdAt,
        },
        warning: 'Please save the API key secret securely. It will not be shown again.',
      },
    });
  });

  // Get application API keys
  getApplicationApiKeys = asyncHandler(async (req: Request, res: Response) => {
    const { id: applicationId } = req.params;

    if (!applicationId) {
      throw new ValidationError('Application ID is required');
    }

    const apiKeys = await applicationService.getApplicationApiKeys(applicationId);

    res.status(200).json({
      success: true,
      message: 'API keys retrieved successfully',
      data: {
        apiKeys: apiKeys.map(key => ({
          id: key.id,
          name: key.name,
          keyId: key.keyId,
          permissions: key.permissions,
          isActive: key.isActive,
          lastUsedAt: key.lastUsedAt,
          expiresAt: key.expiresAt,
          rateLimit: key.rateLimit,
          rateLimitWindow: key.rateLimitWindow,
          createdAt: key.createdAt,
          updatedAt: key.updatedAt,
        })),
      },
    });
  });

  // Update API key
  updateApiKey = asyncHandler(async (req: Request, res: Response) => {
    const { keyId } = req.params;
    const updateData = req.body;
    const adminUserId = req.user!.id;

    if (!keyId) {
      throw new ValidationError('API Key ID is required');
    }

    const apiKey = await applicationService.updateApiKey(keyId, {
      ...updateData,
      updatedBy: adminUserId,
    });

    res.status(200).json({
      success: true,
      message: 'API key updated successfully',
      data: {
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          keyId: apiKey.keyId,
          permissions: apiKey.permissions,
          isActive: apiKey.isActive,
          updatedAt: apiKey.updatedAt,
        },
      },
    });
  });

  // Delete API key
  deleteApiKey = asyncHandler(async (req: Request, res: Response) => {
    const { keyId } = req.params;

    if (!keyId) {
      throw new ValidationError('API Key ID is required');
    }

    await applicationService.deleteApiKey(keyId);

    res.status(200).json({
      success: true,
      message: 'API key deleted successfully',
    });
  });

  // Get application statistics
  getApplicationStats = asyncHandler(async (req: Request, res: Response) => {
    const stats = await applicationService.getApplicationStats();

    res.status(200).json({
      success: true,
      message: 'Application statistics retrieved successfully',
      data: { stats },
    });
  });

  // Verify API key (for testing purposes)
  verifyApiKey = asyncHandler(async (req: Request, res: Response) => {
    const { keyId, keySecret } = req.body;

    const { valid, apiKey } = await applicationService.verifyApiKey(keyId, keySecret);

    if (!valid) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired API key',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'API key is valid',
      data: {
        keyId: apiKey!.keyId,
        name: apiKey!.name,
        permissions: apiKey!.permissions,
        applicationId: apiKey!.applicationId,
      },
    });
  });

  // Rotate API key
  rotateApiKey = asyncHandler(async (req: Request, res: Response) => {
    const { id: _id, keyId } = req.params;
    const adminUserId = req.user!.id;

    if (!keyId) {
      throw new ValidationError('API Key ID is required');
    }

    const { apiKey, keySecret, oldKeyId } = await applicationService.rotateApiKey(keyId, adminUserId);

    res.status(200).json({
      success: true,
      message: 'API key rotated successfully',
      data: {
        apiKey: {
          id: apiKey.id,
          keyId: apiKey.keyId,
          name: apiKey.name,
          permissions: apiKey.permissions,
          isActive: apiKey.isActive,
          lastRotatedAt: apiKey.lastRotatedAt,
          expiresAt: apiKey.expiresAt,
        },
        keySecret,
        oldKeyId,
        warning: 'Please update your application configuration with the new API key. The old key is now invalid.',
      },
    });
  });

  // Schedule API key rotation
  scheduleApiKeyRotation = asyncHandler(async (req: Request, res: Response) => {
    const { id: _id, keyId } = req.params;
    const { rotationDate } = req.body;
    const adminUserId = req.user!.id;

    if (!keyId) {
      throw new ValidationError('API Key ID is required');
    }

    if (!rotationDate) {
      throw new ValidationError('Rotation date is required');
    }

    const scheduledDate = new Date(rotationDate);
    if (scheduledDate <= new Date()) {
      throw new ValidationError('Rotation date must be in the future');
    }

    const apiKey = await applicationService.scheduleApiKeyRotation(keyId, scheduledDate, adminUserId);

    res.status(200).json({
      success: true,
      message: 'API key rotation scheduled successfully',
      data: {
        apiKey: {
          id: apiKey.id,
          keyId: apiKey.keyId,
          name: apiKey.name,
          scheduledRotationAt: apiKey.scheduledRotationAt,
        },
      },
    });
  });

  // Enable auto rotation for API key
  enableAutoRotation = asyncHandler(async (req: Request, res: Response) => {
    const { id: _id, keyId } = req.params;
    const { rotateAfterDays } = req.body;
    const adminUserId = req.user!.id;

    if (!keyId) {
      throw new ValidationError('API Key ID is required');
    }

    if (!rotateAfterDays || rotateAfterDays < 1 || rotateAfterDays > 365) {
      throw new ValidationError('rotateAfterDays must be between 1 and 365 days');
    }

    const apiKey = await applicationService.enableAutoRotation(keyId, parseInt(rotateAfterDays, 10), adminUserId);

    res.status(200).json({
      success: true,
      message: 'Auto rotation enabled successfully',
      data: {
        apiKey: {
          id: apiKey.id,
          keyId: apiKey.keyId,
          name: apiKey.name,
          autoRotateAfterDays: apiKey.autoRotateAfterDays,
        },
      },
    });
  });

  // Disable auto rotation for API key
  disableAutoRotation = asyncHandler(async (req: Request, res: Response) => {
    const { id: _id, keyId } = req.params;
    const adminUserId = req.user!.id;

    if (!keyId) {
      throw new ValidationError('API Key ID is required');
    }

    const apiKey = await applicationService.disableAutoRotation(keyId, adminUserId);

    res.status(200).json({
      success: true,
      message: 'Auto rotation disabled successfully',
      data: {
        apiKey: {
          id: apiKey.id,
          keyId: apiKey.keyId,
          name: apiKey.name,
          autoRotateAfterDays: apiKey.autoRotateAfterDays,
          scheduledRotationAt: apiKey.scheduledRotationAt,
        },
      },
    });
  });

  // Get API key rotation history
  getApiKeyRotationHistory = asyncHandler(async (req: Request, res: Response) => {
    const { id: _id, keyId } = req.params;
    const { limit = 10 } = req.query;

    if (!keyId) {
      throw new ValidationError('API Key ID is required');
    }

    const history = await applicationService.getApiKeyRotationHistory(keyId, parseInt(limit as string, 10));

    res.status(200).json({
      success: true,
      message: 'API key rotation history retrieved successfully',
      data: {
        history,
      },
    });
  });

  // Get API keys scheduled for rotation
  getApiKeysForRotation = asyncHandler(async (req: Request, res: Response) => {
    const apiKeys = await applicationService.getApiKeysForRotation();

    res.status(200).json({
      success: true,
      message: 'API keys for rotation retrieved successfully',
      data: {
        apiKeys: apiKeys.map(key => ({
          id: key.id,
          keyId: key.keyId,
          name: key.name,
          applicationName: (key as any).application?.name,
          applicationId: key.applicationId,
          scheduledRotationAt: key.scheduledRotationAt,
          autoRotateAfterDays: key.autoRotateAfterDays,
          lastRotatedAt: key.lastRotatedAt,
          createdAt: key.createdAt,
        })),
      },
    });
  });

  // Get API key statistics
  getApiKeyStats = asyncHandler(async (req: Request, res: Response) => {
    const stats = await applicationService.getApiKeyStats();

    res.status(200).json({
      success: true,
      message: 'API key statistics retrieved successfully',
      data: stats,
    });
  });

  // Manually trigger rotation check
  triggerRotationCheck = asyncHandler(async (req: Request, res: Response) => {
    const { keyRotationService } = await import('../services/keyRotationService');
    
    const result = await keyRotationService.triggerRotationCheck();

    res.status(200).json({
      success: true,
      message: 'Rotation check triggered successfully',
      data: result,
    });
  });
}

export const applicationController = new ApplicationController();