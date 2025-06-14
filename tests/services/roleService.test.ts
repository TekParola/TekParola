import { roleService } from '../../src/services/roleService';
import { prisma } from '../../src/config/database';
import { cacheService } from '../../src/services/cacheService';
import { ConflictError, NotFoundError, ValidationError } from '../../src/utils/errors';

// Mock dependencies
jest.mock('../../src/config/database');
jest.mock('../../src/services/cacheService');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockCacheService = cacheService as jest.Mocked<typeof cacheService>;

describe('RoleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createRole', () => {
    const roleData = {
      name: 'admin',
      description: 'Administrator role',
      permissions: ['manage:users', 'manage:roles'],
      createdBy: 'user-123',
    };

    it('should create role successfully', async () => {
      const mockRole = {
        id: 'role-123',
        name: roleData.name,
        description: roleData.description,
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPermissions = [
        { id: 'perm-1', name: 'manage:users' },
        { id: 'perm-2', name: 'manage:roles' },
      ];

      mockPrisma.role.findUnique.mockResolvedValue(null); // No existing role
      mockPrisma.permission.findMany.mockResolvedValue(mockPermissions as any);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });
      mockPrisma.role.create.mockResolvedValue(mockRole as any);
      mockCacheService.deleteByPattern.mockResolvedValue(undefined);

      const result = await roleService.createRole(roleData);

      expect(result).toEqual(mockRole);
      expect(mockPrisma.role.findUnique).toHaveBeenCalledWith({
        where: { name: roleData.name },
      });
      expect(mockPrisma.permission.findMany).toHaveBeenCalledWith({
        where: { name: { in: roleData.permissions } },
      });
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith('role:*');
    });

    it('should throw ConflictError if role already exists', async () => {
      const existingRole = { id: 'existing-123', name: roleData.name };
      mockPrisma.role.findUnique.mockResolvedValue(existingRole as any);

      await expect(roleService.createRole(roleData)).rejects.toThrow(ConflictError);
      expect(mockPrisma.role.create).not.toHaveBeenCalled();
    });

    it('should throw ValidationError if permissions do not exist', async () => {
      const partialPermissions = [{ id: 'perm-1', name: 'manage:users' }]; // Missing manage:roles
      
      mockPrisma.role.findUnique.mockResolvedValue(null);
      mockPrisma.permission.findMany.mockResolvedValue(partialPermissions as any);

      await expect(roleService.createRole(roleData)).rejects.toThrow(ValidationError);
    });
  });

  describe('findById', () => {
    it('should find role by id with permissions', async () => {
      const roleId = 'role-123';
      const mockRole = {
        id: roleId,
        name: 'admin',
        description: 'Administrator role',
        isSystem: false,
        permissions: [
          {
            permission: {
              id: 'perm-1',
              name: 'manage:users',
              description: 'Manage users',
            },
          },
        ],
      };

      mockPrisma.role.findUnique.mockResolvedValue(mockRole as any);

      const result = await roleService.findById(roleId);

      expect(result).toEqual(mockRole);
      expect(mockPrisma.role.findUnique).toHaveBeenCalledWith({
        where: { id: roleId },
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      });
    });

    it('should return null for non-existent role', async () => {
      const roleId = 'non-existent';
      mockPrisma.role.findUnique.mockResolvedValue(null);

      const result = await roleService.findById(roleId);

      expect(result).toBeNull();
    });
  });

  describe('updateRole', () => {
    const roleId = 'role-123';
    const updateData = {
      description: 'Updated description',
      permissions: ['manage:users', 'view:analytics'],
      updatedBy: 'admin-123',
    };

    it('should update role successfully', async () => {
      const existingRole = {
        id: roleId,
        name: 'admin',
        description: 'Old description',
        isSystem: false,
      };

      const updatedRole = {
        ...existingRole,
        description: updateData.description,
        updatedAt: new Date(),
      };

      const mockPermissions = [
        { id: 'perm-1', name: 'manage:users' },
        { id: 'perm-2', name: 'view:analytics' },
      ];

      mockPrisma.role.findUnique.mockResolvedValue(existingRole as any);
      mockPrisma.permission.findMany.mockResolvedValue(mockPermissions as any);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });
      mockPrisma.rolePermission.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.rolePermission.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.role.update.mockResolvedValue(updatedRole as any);
      mockCacheService.deleteByPattern.mockResolvedValue(undefined);

      const result = await roleService.updateRole(roleId, updateData);

      expect(result).toEqual(updatedRole);
      expect(mockPrisma.role.update).toHaveBeenCalledWith({
        where: { id: roleId },
        data: {
          description: updateData.description,
          updatedBy: updateData.updatedBy,
          updatedAt: expect.any(Date),
        },
      });
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith('role:*');
    });

    it('should throw NotFoundError if role does not exist', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(roleService.updateRole(roleId, updateData)).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if trying to update system role', async () => {
      const systemRole = {
        id: roleId,
        name: 'admin',
        isSystem: true,
      };

      mockPrisma.role.findUnique.mockResolvedValue(systemRole as any);

      await expect(roleService.updateRole(roleId, updateData)).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteRole', () => {
    const roleId = 'role-123';
    const deletedBy = 'admin-123';

    it('should delete role successfully', async () => {
      const existingRole = {
        id: roleId,
        name: 'custom-role',
        isSystem: false,
      };

      mockPrisma.role.findUnique.mockResolvedValue(existingRole as any);
      mockPrisma.userRole.count.mockResolvedValue(0); // No users assigned
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });
      mockPrisma.rolePermission.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.role.delete.mockResolvedValue(existingRole as any);
      mockCacheService.deleteByPattern.mockResolvedValue(undefined);

      await roleService.deleteRole(roleId, deletedBy);

      expect(mockPrisma.role.delete).toHaveBeenCalledWith({
        where: { id: roleId },
      });
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith('role:*');
    });

    it('should throw NotFoundError if role does not exist', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(roleService.deleteRole(roleId, deletedBy)).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if trying to delete system role', async () => {
      const systemRole = {
        id: roleId,
        name: 'admin',
        isSystem: true,
      };

      mockPrisma.role.findUnique.mockResolvedValue(systemRole as any);

      await expect(roleService.deleteRole(roleId, deletedBy)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if role has assigned users', async () => {
      const existingRole = {
        id: roleId,
        name: 'custom-role',
        isSystem: false,
      };

      mockPrisma.role.findUnique.mockResolvedValue(existingRole as any);
      mockPrisma.userRole.count.mockResolvedValue(5); // 5 users assigned

      await expect(roleService.deleteRole(roleId, deletedBy)).rejects.toThrow(ValidationError);
    });
  });

  describe('assignPermissions', () => {
    const roleId = 'role-123';
    const permissions = ['manage:users', 'view:reports'];
    const assignedBy = 'admin-123';

    it('should assign permissions successfully', async () => {
      const existingRole = {
        id: roleId,
        name: 'custom-role',
        isSystem: false,
      };

      const mockPermissions = [
        { id: 'perm-1', name: 'manage:users' },
        { id: 'perm-2', name: 'view:reports' },
      ];

      mockPrisma.role.findUnique.mockResolvedValue(existingRole as any);
      mockPrisma.permission.findMany.mockResolvedValue(mockPermissions as any);
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });
      mockPrisma.rolePermission.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.rolePermission.createMany.mockResolvedValue({ count: 2 });
      mockCacheService.deleteByPattern.mockResolvedValue(undefined);

      await roleService.assignPermissions(roleId, permissions, assignedBy);

      expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId },
      });
      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId, permissionId: 'perm-1', assignedBy },
          { roleId, permissionId: 'perm-2', assignedBy },
        ],
      });
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith('role:*');
    });

    it('should throw NotFoundError if role does not exist', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(
        roleService.assignPermissions(roleId, permissions, assignedBy)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getRoleHierarchy', () => {
    it('should build role hierarchy correctly', async () => {
      const mockRoles = [
        {
          id: 'role-1',
          name: 'super-admin',
          parentId: null,
          children: [
            {
              id: 'role-2',
              name: 'admin',
              parentId: 'role-1',
              children: [
                {
                  id: 'role-3',
                  name: 'moderator',
                  parentId: 'role-2',
                  children: [],
                },
              ],
            },
          ],
        },
        {
          id: 'role-4',
          name: 'user',
          parentId: null,
          children: [],
        },
      ];

      mockPrisma.role.findMany.mockResolvedValue(mockRoles as any);

      const result = await roleService.getRoleHierarchy();

      expect(result).toHaveLength(2); // Two root roles
      expect(result[0].name).toBe('super-admin');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].name).toBe('admin');
      expect(result[0].children[0].children[0].name).toBe('moderator');
    });
  });

  describe('searchRoles', () => {
    const searchParams = {
      search: 'admin',
      page: 1,
      limit: 10,
    };

    it('should search roles successfully', async () => {
      const mockRoles = [
        { id: 'role-1', name: 'admin', description: 'Administrator' },
        { id: 'role-2', name: 'super-admin', description: 'Super Administrator' },
      ];

      mockPrisma.role.findMany.mockResolvedValue(mockRoles as any);
      mockPrisma.role.count.mockResolvedValue(2);

      const result = await roleService.searchRoles(searchParams);

      expect(result.roles).toEqual(mockRoles);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
      expect(mockPrisma.role.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: 'admin', mode: 'insensitive' } },
            { description: { contains: 'admin', mode: 'insensitive' } },
          ],
        },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should handle empty search results', async () => {
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.role.count.mockResolvedValue(0);

      const result = await roleService.searchRoles(searchParams);

      expect(result.roles).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe('cloneRole', () => {
    it('should clone role successfully', async () => {
      const sourceRoleId = 'role-123';
      const newRoleName = 'admin-clone';
      const clonedBy = 'admin-123';

      const sourceRole = {
        id: sourceRoleId,
        name: 'admin',
        description: 'Administrator role',
        permissions: [
          { permission: { id: 'perm-1', name: 'manage:users' } },
          { permission: { id: 'perm-2', name: 'manage:roles' } },
        ],
      };

      const clonedRole = {
        id: 'role-456',
        name: newRoleName,
        description: sourceRole.description,
        isSystem: false,
      };

      mockPrisma.role.findUnique
        .mockResolvedValueOnce(sourceRole as any) // Source role exists
        .mockResolvedValueOnce(null); // New role name doesn't exist

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });
      mockPrisma.role.create.mockResolvedValue(clonedRole as any);
      mockCacheService.deleteByPattern.mockResolvedValue(undefined);

      const result = await roleService.cloneRole(sourceRoleId, newRoleName, clonedBy);

      expect(result).toEqual(clonedRole);
      expect(mockPrisma.role.create).toHaveBeenCalledWith({
        data: {
          name: newRoleName,
          description: sourceRole.description,
          isSystem: false,
          createdBy: clonedBy,
          permissions: {
            create: [
              { permissionId: 'perm-1', assignedBy: clonedBy },
              { permissionId: 'perm-2', assignedBy: clonedBy },
            ],
          },
        },
      });
    });

    it('should throw NotFoundError if source role does not exist', async () => {
      const sourceRoleId = 'non-existent';
      const newRoleName = 'admin-clone';
      const clonedBy = 'admin-123';

      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(
        roleService.cloneRole(sourceRoleId, newRoleName, clonedBy)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError if new role name already exists', async () => {
      const sourceRoleId = 'role-123';
      const newRoleName = 'existing-role';
      const clonedBy = 'admin-123';

      const sourceRole = { id: sourceRoleId, name: 'admin' };
      const existingRole = { id: 'role-456', name: newRoleName };

      mockPrisma.role.findUnique
        .mockResolvedValueOnce(sourceRole as any)
        .mockResolvedValueOnce(existingRole as any);

      await expect(
        roleService.cloneRole(sourceRoleId, newRoleName, clonedBy)
      ).rejects.toThrow(ConflictError);
    });
  });
});
