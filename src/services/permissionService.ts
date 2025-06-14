import { Permission, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, ConflictError } from '../utils/errors';

export interface CreatePermissionData {
  name: string;
  displayName: string;
  description?: string;
  resource: string;
  action: string;
  scope?: string;
  isSystem?: boolean;
  createdBy?: string;
}

export interface UpdatePermissionData {
  displayName?: string;
  description?: string;
  updatedBy?: string;
}

export interface PermissionFilters {
  resource?: string;
  action?: string;
  scope?: string;
  isSystem?: boolean;
  search?: string;
}

export class PermissionService {
  async createPermission(data: CreatePermissionData): Promise<Permission> {
    try {
      // Check if permission already exists
      const existing = await prisma.permission.findUnique({
        where: { name: data.name },
      });

      if (existing) {
        throw new ConflictError('Permission with this name already exists');
      }

      const permission = await prisma.permission.create({
        data: {
          name: data.name,
          displayName: data.displayName,
          description: data.description,
          resource: data.resource,
          action: data.action,
          scope: data.scope,
          isSystem: data.isSystem || false,
          createdBy: data.createdBy,
        },
      });

      logger.info(`Permission created: ${permission.name}`);
      return permission;
    } catch (error) {
      logger.error('Failed to create permission:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<Permission | null> {
    try {
      return await prisma.permission.findUnique({
        where: { id },
      });
    } catch (error) {
      logger.error('Failed to find permission by ID:', error);
      throw error;
    }
  }

  async findByName(name: string): Promise<Permission | null> {
    try {
      return await prisma.permission.findUnique({
        where: { name },
      });
    } catch (error) {
      logger.error('Failed to find permission by name:', error);
      throw error;
    }
  }

  async findMany(filters: PermissionFilters = {}): Promise<Permission[]> {
    try {
      const where: Prisma.PermissionWhereInput = {};

      if (filters.resource) {
        where.resource = filters.resource;
      }

      if (filters.action) {
        where.action = filters.action;
      }

      if (filters.scope !== undefined) {
        where.scope = filters.scope;
      }

      if (filters.isSystem !== undefined) {
        where.isSystem = filters.isSystem;
      }

      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { displayName: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      return await prisma.permission.findMany({
        where,
        orderBy: [
          { resource: 'asc' },
          { action: 'asc' },
          { scope: 'asc' },
        ],
      });
    } catch (error) {
      logger.error('Failed to find permissions:', error);
      throw error;
    }
  }

  async findManyGroupedByResource(filters: PermissionFilters = {}): Promise<Record<string, Permission[]>> {
    try {
      const permissions = await this.findMany(filters);
      
      const grouped: Record<string, Permission[]> = {};
      
      permissions.forEach(permission => {
        if (!grouped[permission.resource]) {
          grouped[permission.resource] = [];
        }
        grouped[permission.resource]!.push(permission);
      });

      return grouped;
    } catch (error) {
      logger.error('Failed to find permissions grouped by resource:', error);
      throw error;
    }
  }

  async updatePermission(id: string, data: UpdatePermissionData): Promise<Permission> {
    try {
      const permission = await this.findById(id);
      if (!permission) {
        throw new NotFoundError('Permission not found');
      }

      if (permission.isSystem) {
        throw new ConflictError('Cannot update system permission');
      }

      const updated = await prisma.permission.update({
        where: { id },
        data: {
          displayName: data.displayName,
          description: data.description,
          updatedBy: data.updatedBy,
          updatedAt: new Date(),
        },
      });

      logger.info(`Permission updated: ${updated.name}`);
      return updated;
    } catch (error) {
      logger.error('Failed to update permission:', error);
      throw error;
    }
  }

  async deletePermission(id: string): Promise<void> {
    try {
      const permission = await this.findById(id);
      if (!permission) {
        throw new NotFoundError('Permission not found');
      }

      if (permission.isSystem) {
        throw new ConflictError('Cannot delete system permission');
      }

      await prisma.permission.delete({
        where: { id },
      });

      logger.info(`Permission deleted: ${permission.name}`);
    } catch (error) {
      logger.error('Failed to delete permission:', error);
      throw error;
    }
  }

  async getPermissionRoles(permissionId: string): Promise<any[]> {
    try {
      const rolePermissions = await prisma.rolePermission.findMany({
        where: { permissionId },
        include: {
          role: true,
        },
      });

      return rolePermissions.map(rp => rp.role);
    } catch (error) {
      logger.error('Failed to get permission roles:', error);
      throw error;
    }
  }

  async getUniqueResources(): Promise<string[]> {
    try {
      const permissions = await prisma.permission.findMany({
        select: { resource: true },
        distinct: ['resource'],
        orderBy: { resource: 'asc' },
      });

      return permissions.map(p => p.resource);
    } catch (error) {
      logger.error('Failed to get unique resources:', error);
      throw error;
    }
  }

  async getUniqueActions(resource?: string): Promise<string[]> {
    try {
      const where: Prisma.PermissionWhereInput = {};
      
      if (resource) {
        where.resource = resource;
      }

      const permissions = await prisma.permission.findMany({
        where,
        select: { action: true },
        distinct: ['action'],
        orderBy: { action: 'asc' },
      });

      return permissions.map(p => p.action);
    } catch (error) {
      logger.error('Failed to get unique actions:', error);
      throw error;
    }
  }

  async getUniqueScopes(): Promise<(string | null)[]> {
    try {
      const permissions = await prisma.permission.findMany({
        select: { scope: true },
        distinct: ['scope'],
        orderBy: { scope: 'asc' },
      });

      return permissions.map(p => p.scope);
    } catch (error) {
      logger.error('Failed to get unique scopes:', error);
      throw error;
    }
  }

  async userHasPermission(userId: string, permissionName: string): Promise<boolean> {
    try {
      const userRoles = await prisma.userRole.findMany({
        where: { userId },
        include: {
          role: {
            include: {
              permissions: {
                where: {
                  permission: { name: permissionName },
                },
              },
            },
          },
        },
      });

      return userRoles.some(ur => ur.role.permissions.length > 0);
    } catch (error) {
      logger.error('Failed to check user permission:', error);
      return false;
    }
  }

  async userHasResourcePermission(
    userId: string, 
    resource: string, 
    action: string, 
    scope?: string
  ): Promise<boolean> {
    try {
      const userRoles = await prisma.userRole.findMany({
        where: { userId },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      return userRoles.some(ur => 
        ur.role.permissions.some(rp => {
          const p = rp.permission;
          return p.resource === resource && 
                 p.action === action && 
                 (scope === undefined || p.scope === scope || p.scope === 'all');
        })
      );
    } catch (error) {
      logger.error('Failed to check user resource permission:', error);
      return false;
    }
  }

  async bulkCreatePermissions(permissions: CreatePermissionData[]): Promise<Permission[]> {
    try {
      const createdPermissions: Permission[] = [];

      for (const permData of permissions) {
        try {
          const permission = await this.createPermission(permData);
          createdPermissions.push(permission);
        } catch (error) {
          if (error instanceof ConflictError) {
            logger.warn(`Permission ${permData.name} already exists, skipping`);
          } else {
            throw error;
          }
        }
      }

      logger.info(`Bulk created ${createdPermissions.length} permissions`);
      return createdPermissions;
    } catch (error) {
      logger.error('Failed to bulk create permissions:', error);
      throw error;
    }
  }
}

export const permissionService = new PermissionService();