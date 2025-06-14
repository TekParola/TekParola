import { userService } from '../../src/services/userService';
import { prisma } from '../../src/config/database';
import { ConflictError, NotFoundError, ValidationError } from '../../src/utils/errors';

// Mock dependencies
jest.mock('../../src/config/database');
jest.mock('../../src/services/cacheService');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    const userData = {
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      password: 'TestPass123!',
    };

    it('should create a user successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        isActive: true,
        isEmailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockRole = { id: 'role-123', name: 'user' };

      mockPrisma.user.findFirst.mockResolvedValue(null); // No existing user
      mockPrisma.role.findUnique.mockResolvedValue(mockRole);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });
      mockPrisma.user.create.mockResolvedValue(mockUser as any);

      const result = await userService.createUser(userData);

      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { email: userData.email },
            { username: userData.username },
          ],
        },
      });
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should throw ConflictError if user already exists', async () => {
      const existingUser = { id: 'existing-123', email: userData.email };
      mockPrisma.user.findFirst.mockResolvedValue(existingUser as any);

      await expect(userService.createUser(userData)).rejects.toThrow(ConflictError);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should throw ValidationError if email is invalid', async () => {
      const invalidUserData = { ...userData, email: 'invalid-email' };

      await expect(userService.createUser(invalidUserData)).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('should return user if found', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await userService.findById('user-123');

      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
      });
    });

    it('should return null if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await userService.findById('nonexistent-123');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should return user if found', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await userService.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should return null if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await userService.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    const userId = 'user-123';
    const updateData = {
      firstName: 'Jane',
      lastName: 'Smith',
    };

    it('should update user successfully', async () => {
      const existingUser = {
        id: userId,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const updatedUser = {
        ...existingUser,
        ...updateData,
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(existingUser as any);
      mockPrisma.user.update.mockResolvedValue(updatedUser as any);

      const result = await userService.updateUser(userId, updateData);

      expect(result).toEqual(updatedUser);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          ...updateData,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should throw NotFoundError if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(userService.updateUser(userId, updateData)).rejects.toThrow(NotFoundError);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('deactivateUser', () => {
    const userId = 'user-123';

    it('should deactivate user successfully', async () => {
      const existingUser = {
        id: userId,
        email: 'test@example.com',
        isActive: true,
      };

      const deactivatedUser = {
        ...existingUser,
        isActive: false,
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(existingUser as any);
      mockPrisma.user.update.mockResolvedValue(deactivatedUser as any);

      const result = await userService.deactivateUser(userId);

      expect(result).toEqual(deactivatedUser);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          isActive: false,
          updatedBy: undefined,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should throw NotFoundError if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(userService.deactivateUser(userId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('assignRoles', () => {
    const userId = 'user-123';
    const roleIds = ['role-1', 'role-2'];
    const assignedBy = 'admin-123';

    it('should assign roles successfully', async () => {
      const existingUser = { id: userId, email: 'test@example.com' };
      const existingRoles = [
        { id: 'role-1', name: 'user' },
        { id: 'role-2', name: 'moderator' },
      ];

      mockPrisma.user.findUnique.mockResolvedValue(existingUser as any);
      mockPrisma.role.findMany.mockResolvedValue(existingRoles as any);
      mockPrisma.userRole.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.userRole.createMany.mockResolvedValue({ count: 2 });

      await userService.assignRoles(userId, roleIds, assignedBy);

      expect(mockPrisma.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(mockPrisma.userRole.createMany).toHaveBeenCalledWith({
        data: [
          { userId, roleId: 'role-1', assignedBy },
          { userId, roleId: 'role-2', assignedBy },
        ],
      });
    });

    it('should throw NotFoundError if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(userService.assignRoles(userId, roleIds, assignedBy)).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if some roles do not exist', async () => {
      const existingUser = { id: userId, email: 'test@example.com' };
      const partialRoles = [{ id: 'role-1', name: 'user' }]; // Missing role-2

      mockPrisma.user.findUnique.mockResolvedValue(existingUser as any);
      mockPrisma.role.findMany.mockResolvedValue(partialRoles as any);

      await expect(userService.assignRoles(userId, roleIds, assignedBy)).rejects.toThrow(ValidationError);
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      const mockStats = {
        total: 100,
        active: 95,
        verified: 80,
        lastWeek: 10,
        lastMonth: 25,
      };

      mockPrisma.user.count
        .mockResolvedValueOnce(mockStats.total) // total
        .mockResolvedValueOnce(mockStats.active) // active
        .mockResolvedValueOnce(mockStats.verified) // verified
        .mockResolvedValueOnce(mockStats.lastWeek) // last week
        .mockResolvedValueOnce(mockStats.lastMonth); // last month

      const result = await userService.getUserStats();

      expect(result).toEqual(mockStats);
      expect(mockPrisma.user.count).toHaveBeenCalledTimes(5);
    });
  });

  describe('searchUsers', () => {
    const searchParams = {
      search: 'john',
      page: 1,
      limit: 10,
    };

    it('should search users successfully', async () => {
      const mockUsers = [
        { id: 'user-1', email: 'john@example.com', firstName: 'John', lastName: 'Doe' },
        { id: 'user-2', email: 'johnny@example.com', firstName: 'Johnny', lastName: 'Smith' },
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers as any);
      mockPrisma.user.count.mockResolvedValue(2);

      const result = await userService.searchUsers(searchParams);

      expect(result.users).toEqual(mockUsers);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('should handle empty search results', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      const result = await userService.searchUsers(searchParams);

      expect(result.users).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });
});