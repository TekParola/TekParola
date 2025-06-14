import { Request, Response, NextFunction } from 'express';
import { roleService } from '../services/roleService';
import { ApiResponse } from '../types';

class RoleController {
  async getRoles(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { 
        search, 
        isActive, 
        isSystem,
        includePermissions: _includePermissions = 'true',
        limit: _limit = 50,
        offset: _offset = 0,
      } = req.query;

      const filters = {
        search: search as string,
        isActive: isActive ? isActive === 'true' : undefined,
        isSystem: isSystem ? isSystem === 'true' : undefined,
      };

      const roles = await roleService.getAllRoles(
        filters.isActive !== undefined ? !filters.isActive : false
      );

      res.json({
        success: true,
        message: 'Roles retrieved successfully',
        data: roles,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRoleById(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { includePermissions = 'true' } = req.query;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Role ID is required',
        });
        return;
      }

      const role = includePermissions === 'true' 
        ? await roleService.findWithPermissions(id)
        : await roleService.findById(id);

      if (!role) {
        res.status(404).json({
          success: false,
          message: 'Role not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Role retrieved successfully',
        data: role,
      });
    } catch (error) {
      next(error);
    }
  }

  async createRole(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { name, displayName, description, parentId, permissions } = req.body;

      const role = await roleService.createRole({
        name,
        displayName,
        description,
        parentId,
        createdBy: req.user!.id,
      });

      // Assign permissions if provided
      if (permissions && permissions.length > 0) {
        for (const permissionId of permissions) {
          await roleService.assignPermission(role.id, permissionId, req.user!.id);
        }
      }

      // Fetch the complete role with permissions
      const completeRole = await roleService.findWithPermissions(role.id);

      res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: completeRole,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateRole(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { displayName, description, parentId, isActive } = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Role ID is required',
        });
        return;
      }

      const role = await roleService.updateRole(id, {
        displayName,
        description,
        parentId,
        isActive,
        updatedBy: req.user!.id,
      });

      res.json({
        success: true,
        message: 'Role updated successfully',
        data: role,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteRole(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Role ID is required',
        });
        return;
      }

      await roleService.deleteRole(id);

      res.json({
        success: true,
        message: 'Role deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async getRolePermissions(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Role ID is required',
        });
        return;
      }

      const permissions = await roleService.getRolePermissions(id);

      res.json({
        success: true,
        message: 'Role permissions retrieved successfully',
        data: permissions,
      });
    } catch (error) {
      next(error);
    }
  }

  async assignPermissions(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { permissions } = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Role ID is required',
        });
        return;
      }

      if (!permissions || !Array.isArray(permissions)) {
        res.status(400).json({
          success: false,
          message: 'Permissions array is required',
        });
        return;
      }

      // Assign permissions one by one
      for (const permissionId of permissions) {
        await roleService.assignPermission(id, permissionId, req.user!.id);
      }

      const updatedPermissions = await roleService.getRolePermissions(id);

      res.json({
        success: true,
        message: 'Permissions assigned successfully',
        data: updatedPermissions,
      });
    } catch (error) {
      next(error);
    }
  }

  async removePermissions(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { permissions } = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Role ID is required',
        });
        return;
      }

      if (!permissions || !Array.isArray(permissions)) {
        res.status(400).json({
          success: false,
          message: 'Permissions array is required',
        });
        return;
      }

      // Remove permissions one by one
      for (const permissionId of permissions) {
        await roleService.revokePermission(id, permissionId);
      }

      const updatedPermissions = await roleService.getRolePermissions(id);

      res.json({
        success: true,
        message: 'Permissions removed successfully',
        data: updatedPermissions,
      });
    } catch (error) {
      next(error);
    }
  }

  async syncPermissions(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { permissions } = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Role ID is required',
        });
        return;
      }

      if (!permissions || !Array.isArray(permissions)) {
        res.status(400).json({
          success: false,
          message: 'Permissions array is required',
        });
        return;
      }

      // Get current permissions
      const currentPermissions = await roleService.getRolePermissions(id);
      const currentPermissionIds = currentPermissions.map(p => p.id);
      
      // Remove permissions not in the new list
      for (const currentId of currentPermissionIds) {
        if (!permissions.includes(currentId)) {
          await roleService.revokePermission(id, currentId);
        }
      }
      
      // Add new permissions
      for (const permissionId of permissions) {
        if (!currentPermissionIds.includes(permissionId)) {
          await roleService.assignPermission(id, permissionId, req.user!.id);
        }
      }

      const updatedPermissions = await roleService.getRolePermissions(id);

      res.json({
        success: true,
        message: 'Permissions synchronized successfully',
        data: updatedPermissions,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRoleUsers(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Role ID is required',
        });
        return;
      }

      // Get users with this role
      const { userService } = await import('../services/userService');
      const users = await userService.findManyWithFilters(
        {
          roles: {
            some: {
              roleId: id,
            },
          },
        },
        {
          skip: Number(offset),
          take: Number(limit),
        }
      );

      res.json({
        success: true,
        message: 'Role users retrieved successfully',
        data: users,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRoleHierarchy(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const hierarchy = await roleService.getRoleHierarchy();

      res.json({
        success: true,
        message: 'Role hierarchy retrieved successfully',
        data: hierarchy,
      });
    } catch (error) {
      next(error);
    }
  }

  async cloneRole(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { name, displayName } = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Role ID is required',
        });
        return;
      }

      // Get the original role with permissions
      const originalRole = await roleService.findWithPermissions(id);
      if (!originalRole) {
        res.status(404).json({
          success: false,
          message: 'Role not found',
        });
        return;
      }

      // Create the new role
      const clonedRole = await roleService.createRole({
        name,
        displayName,
        description: originalRole.description || undefined,
        parentId: originalRole.parentId || undefined,
        createdBy: req.user!.id,
      });

      // Copy permissions
      if (originalRole.permissions && originalRole.permissions.length > 0) {
        for (const rolePermission of originalRole.permissions) {
          await roleService.assignPermission(
            clonedRole.id, 
            rolePermission.permission.id, 
            req.user!.id
          );
        }
      }

      // Fetch the complete cloned role
      const completeClonedRole = await roleService.findWithPermissions(clonedRole.id);

      res.status(201).json({
        success: true,
        message: 'Role cloned successfully',
        data: completeClonedRole,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const roleController = new RoleController();