import { Request, Response, NextFunction } from 'express';
import { permissionService } from '../services/permissionService';
import { ApiResponse } from '../types';

class PermissionController {
  async getPermissions(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { 
        resource, 
        action,
        scope,
        isSystem,
        search,
        groupBy 
      } = req.query;

      const filters = {
        resource: resource as string,
        action: action as string,
        scope: scope as string,
        isSystem: isSystem ? isSystem === 'true' : undefined,
        search: search as string,
      };

      let permissions;
      if (groupBy === 'resource') {
        permissions = await permissionService.findManyGroupedByResource(filters);
      } else {
        permissions = await permissionService.findMany(filters);
      }

      res.json({
        success: true,
        message: 'Permissions retrieved successfully',
        data: permissions,
      });
    } catch (error) {
      next(error);
    }
  }

  async getPermissionById(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Permission ID is required',
        });
        return;
      }

      const permission = await permissionService.findById(id);

      if (!permission) {
        res.status(404).json({
          success: false,
          message: 'Permission not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Permission retrieved successfully',
        data: permission,
      });
    } catch (error) {
      next(error);
    }
  }

  async createPermission(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { name, displayName, description, resource, action, scope } = req.body;

      const permission = await permissionService.createPermission({
        name,
        displayName,
        description,
        resource,
        action,
        scope,
        createdBy: req.user!.id,
      });

      res.status(201).json({
        success: true,
        message: 'Permission created successfully',
        data: permission,
      });
    } catch (error) {
      next(error);
    }
  }

  async updatePermission(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { displayName, description } = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Permission ID is required',
        });
        return;
      }

      const permission = await permissionService.updatePermission(id, {
        displayName,
        description,
        updatedBy: req.user!.id,
      });

      res.json({
        success: true,
        message: 'Permission updated successfully',
        data: permission,
      });
    } catch (error) {
      next(error);
    }
  }

  async deletePermission(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Permission ID is required',
        });
        return;
      }

      await permissionService.deletePermission(id);

      res.json({
        success: true,
        message: 'Permission deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async getPermissionRoles(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Permission ID is required',
        });
        return;
      }

      const roles = await permissionService.getPermissionRoles(id);

      res.json({
        success: true,
        message: 'Permission roles retrieved successfully',
        data: roles,
      });
    } catch (error) {
      next(error);
    }
  }

  async getResources(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const resources = await permissionService.getUniqueResources();

      res.json({
        success: true,
        message: 'Resources retrieved successfully',
        data: resources,
      });
    } catch (error) {
      next(error);
    }
  }

  async getActions(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { resource } = req.query;

      const actions = await permissionService.getUniqueActions(resource as string);

      res.json({
        success: true,
        message: 'Actions retrieved successfully',
        data: actions,
      });
    } catch (error) {
      next(error);
    }
  }

  async getScopes(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const scopes = await permissionService.getUniqueScopes();

      res.json({
        success: true,
        message: 'Scopes retrieved successfully',
        data: scopes,
      });
    } catch (error) {
      next(error);
    }
  }

  async checkPermission(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { userId, permission, resource, action, scope } = req.body;

      let hasPermission = false;

      if (permission) {
        hasPermission = await permissionService.userHasPermission(userId, permission);
      } else if (resource && action) {
        hasPermission = await permissionService.userHasResourcePermission(
          userId,
          resource,
          action,
          scope
        );
      }

      res.json({
        success: true,
        message: 'Permission check completed',
        data: {
          hasPermission,
          userId,
          permission: permission || `${resource}:${action}${scope ? `:${scope}` : ''}`,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async bulkCreatePermissions(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { permissions } = req.body;

      if (!permissions || !Array.isArray(permissions)) {
        res.status(400).json({
          success: false,
          message: 'Permissions array is required',
        });
        return;
      }

      const createdPermissions = await permissionService.bulkCreatePermissions(
        permissions.map(p => ({ ...p, createdBy: req.user!.id }))
      );

      res.status(201).json({
        success: true,
        message: `${createdPermissions.length} permissions created successfully`,
        data: createdPermissions,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const permissionController = new PermissionController();