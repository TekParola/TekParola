import { applicationService } from '../../src/services/applicationService';
import { prisma } from '../../src/config/database';
import { cacheService } from '../../src/services/cacheService';
import { ConflictError, NotFoundError, ValidationError } from '../../src/utils/errors';
import * as crypto from 'crypto';

// Mock dependencies
jest.mock('../../src/config/database');
jest.mock('../../src/services/cacheService');
jest.mock('crypto');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockCacheService = cacheService as jest.Mocked<typeof cacheService>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;

describe('ApplicationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createApplication', () => {
    const appData = {
      name: 'Test App',
      description: 'Test application',
      redirectUris: ['https://app.example.com/callback'],
      allowedOrigins: ['https://app.example.com'],
      ownerId: 'user-123',
    };

    it('should create application successfully', async () => {
      const mockClientId = 'app_1234567890';
      const mockClientSecret = 'secret_abcdefghij';
      const mockApiKey = 'key_xyz123';
      const mockApiSecret = 'secret_xyz123';

      const mockApplication = {
        id: 'app-123',
        name: appData.name,
        description: appData.description,
        clientId: mockClientId,
        redirectUris: appData.redirectUris,
        allowedOrigins: appData.allowedOrigins,
        ownerId: appData.ownerId,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        apiKeys: [
          {
            id: 'key-123',
            keyId: mockApiKey,
            isActive: true,
            createdAt: new Date(),
          },
        ],
      };

      mockPrisma.application.findFirst.mockResolvedValue(null); // No existing app
      mockCrypto.randomBytes
        .mockReturnValueOnce(Buffer.from('1234567890')) // clientId
        .mockReturnValueOnce(Buffer.from('abcdefghij')) // clientSecret
        .mockReturnValueOnce(Buffer.from('xyz123')) // apiKey
        .mockReturnValueOnce(Buffer.from('xyz123')); // apiSecret

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });
      mockPrisma.application.create.mockResolvedValue(mockApplication as any);
      mockCacheService.deleteByPattern.mockResolvedValue(undefined);

      const result = await applicationService.createApplication(appData);

      expect(result.application).toEqual(mockApplication);
      expect(result.clientSecret).toBeDefined();
      expect(result.apiKeySecret).toBeDefined();
      expect(mockPrisma.application.findFirst).toHaveBeenCalledWith({
        where: { name: appData.name },
      });
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith('app:*');
    });

    it('should throw ConflictError if application name already exists', async () => {
      const existingApp = { id: 'existing-123', name: appData.name };
      mockPrisma.application.findFirst.mockResolvedValue(existingApp as any);

      await expect(applicationService.createApplication(appData)).rejects.toThrow(ConflictError);
      expect(mockPrisma.application.create).not.toHaveBeenCalled();
    });

    it('should validate redirect URIs', async () => {
      const invalidAppData = {
        ...appData,
        redirectUris: ['invalid-uri', 'http://insecure.com'],
      };

      await expect(applicationService.createApplication(invalidAppData)).rejects.toThrow(ValidationError);
    });
  });

  describe('findByClientId', () => {
    it('should find application by client ID', async () => {
      const clientId = 'app_1234567890';
      const mockApplication = {
        id: 'app-123',
        name: 'Test App',
        clientId,
        isActive: true,
        owner: {
          id: 'user-123',
          email: 'owner@example.com',
        },
        apiKeys: [
          {
            id: 'key-123',
            keyId: 'key_xyz123',
            isActive: true,
          },
        ],
      };

      mockPrisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const result = await applicationService.findByClientId(clientId);

      expect(result).toEqual(mockApplication);
      expect(mockPrisma.application.findUnique).toHaveBeenCalledWith({
        where: { clientId },
        include: {
          owner: true,
          apiKeys: {
            where: { isActive: true },
          },
        },
      });
    });

    it('should return null for non-existent client ID', async () => {
      const clientId = 'non-existent';
      mockPrisma.application.findUnique.mockResolvedValue(null);

      const result = await applicationService.findByClientId(clientId);

      expect(result).toBeNull();
    });
  });

  describe('validateClientSecret', () => {
    it('should validate client secret successfully', async () => {
      const clientId = 'app_1234567890';
      const clientSecret = 'secret_abcdefghij';
      const hashedSecret = 'hashed_secret';

      const mockApplication = {
        id: 'app-123',
        clientId,
        clientSecret: hashedSecret,
        isActive: true,
      };

      mockPrisma.application.findUnique.mockResolvedValue(mockApplication as any);
      
      // Mock bcrypt comparison
      const bcrypt = require('bcrypt');
      jest.mock('bcrypt');
      bcrypt.compare = jest.fn().mockResolvedValue(true);

      const result = await applicationService.validateClientSecret(clientId, clientSecret);

      expect(result).toBe(true);
      expect(mockPrisma.application.findUnique).toHaveBeenCalledWith({
        where: { clientId },
      });
    });

    it('should return false for invalid client secret', async () => {
      const clientId = 'app_1234567890';
      const clientSecret = 'wrong_secret';
      const hashedSecret = 'hashed_secret';

      const mockApplication = {
        id: 'app-123',
        clientId,
        clientSecret: hashedSecret,
        isActive: true,
      };

      mockPrisma.application.findUnique.mockResolvedValue(mockApplication as any);
      
      const bcrypt = require('bcrypt');
      bcrypt.compare = jest.fn().mockResolvedValue(false);

      const result = await applicationService.validateClientSecret(clientId, clientSecret);

      expect(result).toBe(false);
    });

    it('should return false for inactive application', async () => {
      const clientId = 'app_1234567890';
      const clientSecret = 'secret_abcdefghij';

      const mockApplication = {
        id: 'app-123',
        clientId,
        clientSecret: 'hashed_secret',
        isActive: false,
      };

      mockPrisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const result = await applicationService.validateClientSecret(clientId, clientSecret);

      expect(result).toBe(false);
    });
  });

  describe('rotateApiKey', () => {
    it('should rotate API key successfully', async () => {
      const keyId = 'key-123';
      const rotatedBy = 'admin-123';
      const newKeyId = 'key_new123';
      const newKeySecret = 'secret_new123';

      const existingKey = {
        id: keyId,
        keyId: 'key_old123',
        applicationId: 'app-123',
        isActive: true,
      };

      const newKey = {
        id: 'key-456',
        keyId: newKeyId,
        applicationId: 'app-123',
        isActive: true,
        createdAt: new Date(),
      };

      mockPrisma.apiKey.findUnique.mockResolvedValue(existingKey as any);
      mockCrypto.randomBytes
        .mockReturnValueOnce(Buffer.from('new123')) // keyId
        .mockReturnValueOnce(Buffer.from('new123')); // keySecret

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });
      mockPrisma.apiKey.update.mockResolvedValue({ ...existingKey, isActive: false } as any);
      mockPrisma.apiKey.create.mockResolvedValue(newKey as any);
      mockCacheService.deleteByPattern.mockResolvedValue(undefined);

      const result = await applicationService.rotateApiKey(keyId, rotatedBy);

      expect(result.apiKey).toEqual(newKey);
      expect(result.keySecret).toBeDefined();
      expect(result.oldKeyId).toBe(keyId);
      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: keyId },
        data: {
          isActive: false,
          rotatedBy,
          lastRotatedAt: expect.any(Date),
        },
      });
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith(`app:${existingKey.applicationId}:*`);
    });

    it('should throw NotFoundError if API key does not exist', async () => {
      const keyId = 'non-existent';
      mockPrisma.apiKey.findUnique.mockResolvedValue(null);

      await expect(applicationService.rotateApiKey(keyId)).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if API key is already inactive', async () => {
      const keyId = 'key-123';
      const inactiveKey = {
        id: keyId,
        keyId: 'key_old123',
        isActive: false,
      };

      mockPrisma.apiKey.findUnique.mockResolvedValue(inactiveKey as any);

      await expect(applicationService.rotateApiKey(keyId)).rejects.toThrow(ValidationError);
    });
  });

  describe('updateApplication', () => {
    const appId = 'app-123';
    const updateData = {
      description: 'Updated description',
      redirectUris: ['https://newapp.example.com/callback'],
      updatedBy: 'admin-123',
    };

    it('should update application successfully', async () => {
      const existingApp = {
        id: appId,
        name: 'Test App',
        description: 'Old description',
        ownerId: 'user-123',
      };

      const updatedApp = {
        ...existingApp,
        ...updateData,
        updatedAt: new Date(),
      };

      mockPrisma.application.findUnique.mockResolvedValue(existingApp as any);
      mockPrisma.application.update.mockResolvedValue(updatedApp as any);
      mockCacheService.deleteByPattern.mockResolvedValue(undefined);

      const result = await applicationService.updateApplication(appId, updateData);

      expect(result).toEqual(updatedApp);
      expect(mockPrisma.application.update).toHaveBeenCalledWith({
        where: { id: appId },
        data: {
          ...updateData,
          updatedAt: expect.any(Date),
        },
      });
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith(`app:${appId}:*`);
    });

    it('should throw NotFoundError if application does not exist', async () => {
      mockPrisma.application.findUnique.mockResolvedValue(null);

      await expect(applicationService.updateApplication(appId, updateData)).rejects.toThrow(NotFoundError);
    });
  });

  describe('deactivateApplication', () => {
    const appId = 'app-123';
    const deactivatedBy = 'admin-123';

    it('should deactivate application successfully', async () => {
      const existingApp = {
        id: appId,
        name: 'Test App',
        isActive: true,
      };

      const deactivatedApp = {
        ...existingApp,
        isActive: false,
        updatedAt: new Date(),
      };

      mockPrisma.application.findUnique.mockResolvedValue(existingApp as any);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });
      mockPrisma.application.update.mockResolvedValue(deactivatedApp as any);
      mockPrisma.apiKey.updateMany.mockResolvedValue({ count: 2 });
      mockCacheService.deleteByPattern.mockResolvedValue(undefined);

      const result = await applicationService.deactivateApplication(appId, deactivatedBy);

      expect(result).toEqual(deactivatedApp);
      expect(mockPrisma.application.update).toHaveBeenCalledWith({
        where: { id: appId },
        data: {
          isActive: false,
          updatedBy: deactivatedBy,
          updatedAt: expect.any(Date),
        },
      });
      expect(mockPrisma.apiKey.updateMany).toHaveBeenCalledWith({
        where: { applicationId: appId },
        data: { isActive: false },
      });
    });

    it('should throw NotFoundError if application does not exist', async () => {
      mockPrisma.application.findUnique.mockResolvedValue(null);

      await expect(applicationService.deactivateApplication(appId, deactivatedBy)).rejects.toThrow(NotFoundError);
    });
  });

  describe('validateApiKey', () => {
    it('should validate API key successfully', async () => {
      const keyId = 'key_xyz123';
      const keySecret = 'secret_xyz123';
      const hashedSecret = 'hashed_secret';

      const mockKey = {
        id: 'key-123',
        keyId,
        keySecret: hashedSecret,
        isActive: true,
        application: {
          id: 'app-123',
          name: 'Test App',
          isActive: true,
        },
      };

      mockPrisma.apiKey.findUnique.mockResolvedValue(mockKey as any);
      
      const bcrypt = require('bcrypt');
      bcrypt.compare = jest.fn().mockResolvedValue(true);

      const result = await applicationService.validateApiKey(keyId, keySecret);

      expect(result).toEqual(mockKey.application);
      expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledWith({
        where: { keyId },
        include: { application: true },
      });
    });

    it('should return null for invalid API key secret', async () => {
      const keyId = 'key_xyz123';
      const keySecret = 'wrong_secret';
      const hashedSecret = 'hashed_secret';

      const mockKey = {
        id: 'key-123',
        keyId,
        keySecret: hashedSecret,
        isActive: true,
        application: {
          id: 'app-123',
          name: 'Test App',
          isActive: true,
        },
      };

      mockPrisma.apiKey.findUnique.mockResolvedValue(mockKey as any);
      
      const bcrypt = require('bcrypt');
      bcrypt.compare = jest.fn().mockResolvedValue(false);

      const result = await applicationService.validateApiKey(keyId, keySecret);

      expect(result).toBeNull();
    });

    it('should return null for inactive API key', async () => {
      const keyId = 'key_xyz123';
      const keySecret = 'secret_xyz123';

      const mockKey = {
        id: 'key-123',
        keyId,
        keySecret: 'hashed_secret',
        isActive: false,
        application: {
          id: 'app-123',
          name: 'Test App',
          isActive: true,
        },
      };

      mockPrisma.apiKey.findUnique.mockResolvedValue(mockKey as any);

      const result = await applicationService.validateApiKey(keyId, keySecret);

      expect(result).toBeNull();
    });
  });

  describe('getApplicationStats', () => {
    it('should return application statistics', async () => {
      const appId = 'app-123';
      const mockStats = {
        totalApiKeys: 5,
        activeApiKeys: 3,
        totalRequests: 1000,
        lastDayRequests: 150,
        lastWeekRequests: 800,
      };

      mockPrisma.apiKey.count
        .mockResolvedValueOnce(mockStats.totalApiKeys) // total
        .mockResolvedValueOnce(mockStats.activeApiKeys); // active

      mockPrisma.auditLog.count
        .mockResolvedValueOnce(mockStats.totalRequests) // total requests
        .mockResolvedValueOnce(mockStats.lastDayRequests) // last day
        .mockResolvedValueOnce(mockStats.lastWeekRequests); // last week

      const result = await applicationService.getApplicationStats(appId);

      expect(result).toEqual(mockStats);
      expect(mockPrisma.apiKey.count).toHaveBeenCalledTimes(2);
      expect(mockPrisma.auditLog.count).toHaveBeenCalledTimes(3);
    });
  });
});
