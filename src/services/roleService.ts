import { Role, Permission, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';

export interface CreateRoleData {
  name: string;
  displayName: string;
  description?: string;
  parentId?: string;
  createdBy?: string;
}

export interface UpdateRoleData {
  displayName?: string;
  description?: string;
  parentId?: string;
  isActive?: boolean;
  updatedBy?: string;
}

export interface RoleWithPermissions extends Role {
  permissions: Array<{
    permission: Permission;
  }>;
  parent?: Role | null;
  children?: Role[];
}

export interface CreatePermissionData {
  name: string;
  displayName: string;
  description?: string;
  resource: string;
  action: string;
  scope?: string;
  createdBy?: string;
}

export interface UpdatePermissionData {
  displayName?: string;
  description?: string;
  resource?: string;
  action?: string;
  scope?: string;
  updatedBy?: string;
}

export class RoleService {
  async createRole(roleData: CreateRoleData): Promise<Role> {
    try {
      // Check if role name already exists
      const existingRole = await prisma.role.findUnique({
        where: { name: roleData.name },
      });

      if (existingRole) {
        throw new ConflictError('Role with this name already exists');
      }

      // Validate parent role exists if provided
      if (roleData.parentId) {
        const parentRole = await prisma.role.findUnique({
          where: { id: roleData.parentId },
        });

        if (!parentRole) {
          throw new ValidationError('Parent role not found');
        }
      }

      const role = await prisma.role.create({
        data: {
          name: roleData.name,
          displayName: roleData.displayName,
          description: roleData.description,
          parentId: roleData.parentId,
          createdBy: roleData.createdBy,
        },
      });

      logger.info(`Role created: ${role.id} (${role.name})`);
      return role;
    } catch (error) {
      logger.error('Failed to create role:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<Role | null> {
    try {
      return await prisma.role.findUnique({
        where: { id },
      });
    } catch (error) {
      logger.error('Failed to find role by ID:', error);
      throw error;
    }
  }

  async findByName(name: string): Promise<Role | null> {
    try {
      return await prisma.role.findUnique({
        where: { name },
      });
    } catch (error) {
      logger.error('Failed to find role by name:', error);
      throw error;
    }
  }

  async findWithPermissions(id: string): Promise<RoleWithPermissions | null> {
    try {
      return await prisma.role.findUnique({
        where: { id },
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
          parent: true,
          children: true,
        },
      });
    } catch (error) {
      logger.error('Failed to find role with permissions:', error);
      throw error;
    }
  }

  async updateRole(id: string, updateData: UpdateRoleData): Promise<Role> {
    try {
      const role = await this.findById(id);
      if (!role) {
        throw new NotFoundError('Role not found');
      }

      if (role.isSystem && updateData.isActive === false) {
        throw new ValidationError('System roles cannot be deactivated');
      }

      // Validate parent role exists if provided
      if (updateData.parentId) {
        if (updateData.parentId === id) {
          throw new ValidationError('Role cannot be its own parent');
        }

        const parentRole = await prisma.role.findUnique({
          where: { id: updateData.parentId },
        });

        if (!parentRole) {
          throw new ValidationError('Parent role not found');
        }

        // Check for circular references
        const isCircular = await this.wouldCreateCircularReference(id, updateData.parentId);
        if (isCircular) {
          throw new ValidationError('This would create a circular reference in role hierarchy');
        }
      }

      const updatedRole = await prisma.role.update({
        where: { id },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
      });

      logger.info(`Role updated: ${updatedRole.id} (${updatedRole.name})`);
      return updatedRole;
    } catch (error) {
      logger.error('Failed to update role:', error);
      throw error;
    }
  }

  async deleteRole(id: string): Promise<void> {
    try {
      const role = await this.findById(id);
      if (!role) {
        throw new NotFoundError('Role not found');
      }

      if (role.isSystem) {
        throw new ValidationError('System roles cannot be deleted');
      }

      // Check if role has users assigned
      const userCount = await prisma.userRole.count({
        where: { roleId: id },
      });

      if (userCount > 0) {
        throw new ValidationError('Cannot delete role that has users assigned');
      }

      await prisma.role.delete({
        where: { id },
      });

      logger.info(`Role deleted: ${id} (${role.name})`);
    } catch (error) {
      logger.error('Failed to delete role:', error);
      throw error;
    }
  }

  async assignPermission(roleId: string, permissionId: string, assignedBy?: string): Promise<void> {
    try {
      const role = await this.findById(roleId);
      if (!role) {
        throw new NotFoundError('Role not found');
      }

      const permission = await prisma.permission.findUnique({
        where: { id: permissionId },
      });

      if (!permission) {
        throw new NotFoundError('Permission not found');
      }

      // Check if permission is already assigned
      const existingAssignment = await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: {
            roleId,
            permissionId,
          },
        },
      });

      if (existingAssignment) {
        throw new ConflictError('Permission already assigned to role');
      }

      await prisma.rolePermission.create({
        data: {
          roleId,
          permissionId,
          assignedBy,
        },
      });

      logger.info(`Permission assigned: ${permission.name} to role ${role.name}`);
    } catch (error) {
      logger.error('Failed to assign permission:', error);
      throw error;
    }
  }

  async revokePermission(roleId: string, permissionId: string): Promise<void> {
    try {
      const assignment = await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: {
            roleId,
            permissionId,
          },
        },
      });

      if (!assignment) {
        throw new NotFoundError('Permission assignment not found');
      }

      await prisma.rolePermission.delete({
        where: {
          roleId_permissionId: {
            roleId,
            permissionId,
          },
        },
      });

      logger.info(`Permission revoked: ${permissionId} from role ${roleId}`);
    } catch (error) {
      logger.error('Failed to revoke permission:', error);
      throw error;
    }
  }

  async getRolePermissions(roleId: string, includeInherited = true): Promise<Permission[]> {
    try {
      const permissions = new Set<Permission>();

      // Get direct permissions
      const rolePermissions = await prisma.rolePermission.findMany({
        where: { roleId },
        include: { permission: true },
      });

      rolePermissions.forEach(rp => permissions.add(rp.permission));

      // Get inherited permissions if requested
      if (includeInherited) {
        const inheritedPermissions = await this.getInheritedPermissions(roleId);
        inheritedPermissions.forEach(p => permissions.add(p));
      }

      return Array.from(permissions);
    } catch (error) {
      logger.error('Failed to get role permissions:', error);
      throw error;
    }
  }

  private async getInheritedPermissions(roleId: string): Promise<Permission[]> {
    try {
      const role = await prisma.role.findUnique({
        where: { id: roleId },
        include: { parent: true },
      });

      if (!role?.parent) {
        return [];
      }

      const parentPermissions = await this.getRolePermissions(role.parent.id, true);
      return parentPermissions;
    } catch (error) {
      logger.error('Failed to get inherited permissions:', error);
      return [];
    }
  }

  private async wouldCreateCircularReference(roleId: string, newParentId: string): Promise<boolean> {
    try {
      let currentParentId = newParentId;
      const visited = new Set<string>();

      while (currentParentId && !visited.has(currentParentId)) {
        if (currentParentId === roleId) {
          return true;
        }

        visited.add(currentParentId);

        const parent = await prisma.role.findUnique({
          where: { id: currentParentId },
          select: { parentId: true },
        });

        currentParentId = parent?.parentId || '';
      }

      return false;
    } catch (error) {
      logger.error('Failed to check circular reference:', error);
      return true; // Err on the side of caution
    }
  }

  async getAllRoles(includeInactive = false): Promise<Role[]> {
    try {
      const where: Prisma.RoleWhereInput = includeInactive ? {} : { isActive: true };

      return await prisma.role.findMany({
        where,
        orderBy: { displayName: 'asc' },
      });
    } catch (error) {
      logger.error('Failed to get all roles:', error);
      throw error;
    }
  }

  async getRoleHierarchy(): Promise<Role[]> {
    try {
      return await prisma.role.findMany({
        where: { isActive: true },
        include: {
          parent: true,
          children: true,
        },
        orderBy: { displayName: 'asc' },
      });
    } catch (error) {
      logger.error('Failed to get role hierarchy:', error);
      throw error;
    }
  }

  async assignRoleToUser(userId: string, roleId: string, assignedBy?: string, expiresAt?: Date): Promise<void> {
    try {
      // Check if user and role exist
      const [user, role] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.role.findUnique({ where: { id: roleId } }),
      ]);

      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (!role) {
        throw new NotFoundError('Role not found');
      }

      // Check if role is already assigned
      const existingAssignment = await prisma.userRole.findUnique({
        where: {
          userId_roleId: {
            userId,
            roleId,
          },
        },
      });

      if (existingAssignment) {
        throw new ConflictError('Role already assigned to user');
      }

      await prisma.userRole.create({
        data: {
          userId,
          roleId,
          assignedBy,
          expiresAt,
        },
      });

      logger.info(`Role assigned: ${role.name} to user ${user.email}`);
    } catch (error) {
      logger.error('Failed to assign role to user:', error);
      throw error;
    }
  }

  async revokeRoleFromUser(userId: string, roleId: string): Promise<void> {
    try {
      const assignment = await prisma.userRole.findUnique({
        where: {
          userId_roleId: {
            userId,
            roleId,
          },
        },
      });

      if (!assignment) {
        throw new NotFoundError('Role assignment not found');
      }

      await prisma.userRole.delete({
        where: {
          userId_roleId: {
            userId,
            roleId,
          },
        },
      });

      logger.info(`Role revoked: ${roleId} from user ${userId}`);
    } catch (error) {
      logger.error('Failed to revoke role from user:', error);
      throw error;
    }
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    try {
      const userRoles = await prisma.userRole.findMany({
        where: { 
          userId,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        include: { role: true },
      });

      return userRoles.map(ur => ur.role);
    } catch (error) {
      logger.error('Failed to get user roles:', error);
      throw error;
    }
  }
}

export class PermissionService {
  async createPermission(permissionData: CreatePermissionData): Promise<Permission> {
    try {
      // Check if permission already exists
      const existingPermission = await prisma.permission.findFirst({
        where: {
          name: permissionData.name,
        },
      });

      if (existingPermission) {
        throw new ConflictError('Permission with this name already exists');
      }

      const permission = await prisma.permission.create({
        data: {
          name: permissionData.name,
          displayName: permissionData.displayName,
          description: permissionData.description,
          resource: permissionData.resource,
          action: permissionData.action,
          scope: permissionData.scope,
          createdBy: permissionData.createdBy,
        },
      });

      logger.info(`Permission created: ${permission.id} (${permission.name})`);
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

  async updatePermission(id: string, updateData: UpdatePermissionData): Promise<Permission> {
    try {
      const permission = await this.findById(id);
      if (!permission) {
        throw new NotFoundError('Permission not found');
      }

      if (permission.isSystem) {
        throw new ValidationError('System permissions cannot be modified');
      }

      const updatedPermission = await prisma.permission.update({
        where: { id },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
      });

      logger.info(`Permission updated: ${updatedPermission.id} (${updatedPermission.name})`);
      return updatedPermission;
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
        throw new ValidationError('System permissions cannot be deleted');
      }

      await prisma.permission.delete({
        where: { id },
      });

      logger.info(`Permission deleted: ${id} (${permission.name})`);
    } catch (error) {
      logger.error('Failed to delete permission:', error);
      throw error;
    }
  }

  async getAllPermissions(): Promise<Permission[]> {
    try {
      return await prisma.permission.findMany({
        orderBy: { displayName: 'asc' },
      });
    } catch (error) {
      logger.error('Failed to get all permissions:', error);
      throw error;
    }
  }

  async getPermissionsByResource(resource: string): Promise<Permission[]> {
    try {
      return await prisma.permission.findMany({
        where: { resource },
        orderBy: { action: 'asc' },
      });
    } catch (error) {
      logger.error('Failed to get permissions by resource:', error);
      throw error;
    }
  }
}

export const roleService = new RoleService();
export const permissionService = new PermissionService();