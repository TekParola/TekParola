import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboardService';
import { userService } from '../services/userService';
import { roleService, permissionService } from '../services/roleService';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../utils/errors';

export class AdminController {
  // Get dashboard overview with key metrics
  getDashboardOverview = asyncHandler(async (req: Request, res: Response) => {
    const stats = await dashboardService.getDashboardStats();

    res.status(200).json({
      success: true,
      message: 'Dashboard overview retrieved successfully',
      data: { stats },
    });
  });

  // Get detailed analytics
  getAnalytics = asyncHandler(async (req: Request, res: Response) => {
    const { days = 7 } = req.query;
    const daysNum = parseInt(days as string, 10);

    const [activityMetrics, topUsers] = await Promise.all([
      dashboardService.getActivityMetrics(daysNum),
      dashboardService.getTopUsers(),
    ]);

    res.status(200).json({
      success: true,
      message: 'Analytics retrieved successfully',
      data: {
        activityMetrics,
        topUsers,
      },
    });
  });

  // Get system health status
  getSystemHealth = asyncHandler(async (req: Request, res: Response) => {
    const health = await dashboardService.getSystemHealth();

    res.status(200).json({
      success: true,
      message: 'System health retrieved successfully',
      data: { health },
    });
  });

  // Get recent audit logs
  getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
    const { limit = 50 } = req.query;
    const limitNum = parseInt(limit as string, 10);

    const auditLogs = await dashboardService.getRecentAuditLogs(limitNum);

    res.status(200).json({
      success: true,
      message: 'Audit logs retrieved successfully',
      data: { auditLogs },
    });
  });

  // Get security events
  getSecurityEvents = asyncHandler(async (req: Request, res: Response) => {
    const { limit = 20 } = req.query;
    const limitNum = parseInt(limit as string, 10);

    const securityEvents = await dashboardService.getSecurityEvents(limitNum);

    res.status(200).json({
      success: true,
      message: 'Security events retrieved successfully',
      data: { securityEvents },
    });
  });

  // Get all roles and permissions
  getRolesAndPermissions = asyncHandler(async (req: Request, res: Response) => {
    const [roles, permissions] = await Promise.all([
      roleService.getAllRoles(true), // Include inactive roles
      permissionService.getAllPermissions(),
    ]);

    res.status(200).json({
      success: true,
      message: 'Roles and permissions retrieved successfully',
      data: {
        roles: roles.map(role => ({
          id: role.id,
          name: role.name,
          displayName: role.displayName,
          description: role.description,
          isSystem: role.isSystem,
          isActive: role.isActive,
          parentId: role.parentId,
          createdAt: role.createdAt,
          updatedAt: role.updatedAt,
        })),
        permissions: permissions.map(permission => ({
          id: permission.id,
          name: permission.name,
          displayName: permission.displayName,
          description: permission.description,
          resource: permission.resource,
          action: permission.action,
          scope: permission.scope,
          isSystem: permission.isSystem,
          createdAt: permission.createdAt,
        })),
      },
    });
  });

  // Create new role
  createRole = asyncHandler(async (req: Request, res: Response) => {
    const { name, displayName, description, parentId, permissions = [] } = req.body;
    const adminUserId = req.user!.id;

    // Create role
    const role = await roleService.createRole({
      name,
      displayName,
      description,
      parentId,
      createdBy: adminUserId,
    });

    // Assign permissions
    for (const permissionId of permissions) {
      await roleService.assignPermission(role.id, permissionId, adminUserId);
    }

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: { role },
    });
  });

  // Update role
  updateRole = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;
    const adminUserId = req.user!.id;

    if (!id) {
      throw new ValidationError('Role ID is required');
    }

    const role = await roleService.updateRole(id, {
      ...updateData,
      updatedBy: adminUserId,
    });

    res.status(200).json({
      success: true,
      message: 'Role updated successfully',
      data: { role },
    });
  });

  // Delete role
  deleteRole = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Role ID is required');
    }

    await roleService.deleteRole(id);

    res.status(200).json({
      success: true,
      message: 'Role deleted successfully',
    });
  });

  // Create new permission
  createPermission = asyncHandler(async (req: Request, res: Response) => {
    const { name, displayName, description, resource, action, scope } = req.body;
    const adminUserId = req.user!.id;

    const permission = await permissionService.createPermission({
      name,
      displayName,
      description,
      resource,
      action,
      scope,
      createdBy: adminUserId,
    });

    res.status(201).json({
      success: true,
      message: 'Permission created successfully',
      data: { permission },
    });
  });

  // Update permission
  updatePermission = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;
    const adminUserId = req.user!.id;

    if (!id) {
      throw new ValidationError('Permission ID is required');
    }

    const permission = await permissionService.updatePermission(id, {
      ...updateData,
      updatedBy: adminUserId,
    });

    res.status(200).json({
      success: true,
      message: 'Permission updated successfully',
      data: { permission },
    });
  });

  // Delete permission
  deletePermission = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Permission ID is required');
    }

    await permissionService.deletePermission(id);

    res.status(200).json({
      success: true,
      message: 'Permission deleted successfully',
    });
  });

  // Get role hierarchy
  getRoleHierarchy = asyncHandler(async (req: Request, res: Response) => {
    const hierarchy = await roleService.getRoleHierarchy();

    res.status(200).json({
      success: true,
      message: 'Role hierarchy retrieved successfully',
      data: { hierarchy },
    });
  });

  // Get role permissions
  getRolePermissions = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { includeInherited = true } = req.query;

    if (!id) {
      throw new ValidationError('Role ID is required');
    }

    const permissions = await roleService.getRolePermissions(
      id,
      includeInherited === 'true'
    );

    res.status(200).json({
      success: true,
      message: 'Role permissions retrieved successfully',
      data: { permissions },
    });
  });

  // Assign permission to role
  assignPermissionToRole = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { permissionId } = req.body;
    const adminUserId = req.user!.id;

    if (!id) {
      throw new ValidationError('Role ID is required');
    }

    await roleService.assignPermission(id, permissionId, adminUserId);

    res.status(200).json({
      success: true,
      message: 'Permission assigned to role successfully',
    });
  });

  // Revoke permission from role
  revokePermissionFromRole = asyncHandler(async (req: Request, res: Response) => {
    const { id, permissionId } = req.params;

    if (!id || !permissionId) {
      throw new ValidationError('Role ID and Permission ID are required');
    }

    await roleService.revokePermission(id, permissionId);

    res.status(200).json({
      success: true,
      message: 'Permission revoked from role successfully',
    });
  });

  // Get system statistics
  getSystemStats = asyncHandler(async (req: Request, res: Response) => {
    const [userStats, dashboardStats, health] = await Promise.all([
      userService.getUserStats(),
      dashboardService.getDashboardStats(),
      dashboardService.getSystemHealth(),
    ]);

    res.status(200).json({
      success: true,
      message: 'System statistics retrieved successfully',
      data: {
        users: userStats,
        dashboard: dashboardStats,
        health,
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
      },
    });
  });

  // Export users data
  exportUsers = asyncHandler(async (req: Request, res: Response) => {
    const { format = 'json' } = req.query;

    // Get all users with basic information
    const users = await userService.findManyWithFilters({}, {
      orderBy: { createdAt: 'desc' },
    });

    const exportData = users.map(user => ({
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      roles: user.roles?.map(ur => ur.role.name).join(', ') || '',
    }));

    if (format === 'csv') {
      // Convert to CSV format
      const headers = Object.keys(exportData[0] || {});
      const csvContent = [
        headers.join(','),
        ...exportData.map(user => 
          headers.map(header => {
            const value = user[header as keyof typeof user];
            return typeof value === 'string' ? `"${value}"` : value;
          }).join(',')
        ),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=users-export.csv');
      res.send(csvContent);
    } else {
      res.status(200).json({
        success: true,
        message: 'Users exported successfully',
        data: {
          users: exportData,
          exportedAt: new Date().toISOString(),
          totalCount: exportData.length,
        },
      });
    }
  });

  // Get login analytics
  getLoginAnalytics = asyncHandler(async (req: Request, res: Response) => {
    const { days = 30 } = req.query;
    const daysNum = parseInt(days as string, 10);

    const activityMetrics = await dashboardService.getActivityMetrics(daysNum);

    res.status(200).json({
      success: true,
      message: 'Login analytics retrieved successfully',
      data: { activityMetrics },
    });
  });
}

export const adminController = new AdminController();