import { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/auditService';
import { ApiResponse } from '../types';
import { stringify } from 'csv-stringify';

class AuditController {
  async getLogs(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const {
        userId,
        applicationId,
        action,
        resource,
        success,
        startDate,
        endDate,
        ipAddress,
        limit = 50,
        offset = 0,
        orderBy = 'createdAt',
        order = 'desc',
      } = req.query;

      const filters = {
        userId: userId as string,
        applicationId: applicationId as string,
        action: action as string,
        resource: resource as string,
        success: success ? success === 'true' : undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        ipAddress: ipAddress as string,
      };

      const orderByField = orderBy as string;
      const orderDirection = order as 'asc' | 'desc';

      const [logs, total] = await Promise.all([
        auditService.findMany(filters, {
          limit: Number(limit),
          offset: Number(offset),
          orderBy: [{ [orderByField]: orderDirection }],
        }),
        auditService.count(filters),
      ]);

      res.json({
        success: true,
        message: 'Audit logs retrieved successfully',
        data: {
          items: logs,
          total,
          page: Math.floor(Number(offset) / Number(limit)) + 1,
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getLogById(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Audit log ID is required',
        });
        return;
      }

      const log = await auditService.findById(id);

      if (!log) {
        res.status(404).json({
          success: false,
          message: 'Audit log not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Audit log retrieved successfully',
        data: log,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserActivity(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      if (!userId) {
        res.status(400).json({
          success: false,
          message: 'User ID is required',
        });
        return;
      }

      const logs = await auditService.getUserActivity(
        userId,
        Number(limit),
        Number(offset)
      );

      res.json({
        success: true,
        message: 'User activity retrieved successfully',
        data: logs,
      });
    } catch (error) {
      next(error);
    }
  }

  async getApplicationActivity(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { applicationId } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      if (!applicationId) {
        res.status(400).json({
          success: false,
          message: 'Application ID is required',
        });
        return;
      }

      const logs = await auditService.getApplicationActivity(
        applicationId,
        Number(limit),
        Number(offset)
      );

      res.json({
        success: true,
        message: 'Application activity retrieved successfully',
        data: logs,
      });
    } catch (error) {
      next(error);
    }
  }

  async getActionStats(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const {
        userId,
        applicationId,
        resource,
        success,
        startDate,
        endDate,
        limit = 10,
      } = req.query;

      const filters = {
        userId: userId as string,
        applicationId: applicationId as string,
        resource: resource as string,
        success: success ? success === 'true' : undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      };

      const stats = await auditService.getActionStats(filters, Number(limit));

      res.json({
        success: true,
        message: 'Action statistics retrieved successfully',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSecurityEvents(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { limit = 20, offset = 0 } = req.query;

      const events = await auditService.getSecurityEvents(
        Number(limit),
        Number(offset)
      );

      res.json({
        success: true,
        message: 'Security events retrieved successfully',
        data: events,
      });
    } catch (error) {
      next(error);
    }
  }

  async getFailedActions(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const {
        userId,
        applicationId,
        action,
        resource,
        startDate,
        endDate,
        limit = 20,
        offset = 0,
      } = req.query;

      const filters = {
        userId: userId as string,
        applicationId: applicationId as string,
        action: action as string,
        resource: resource as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      };

      const logs = await auditService.getFailedActions(
        filters,
        Number(limit),
        Number(offset)
      );

      res.json({
        success: true,
        message: 'Failed actions retrieved successfully',
        data: logs,
      });
    } catch (error) {
      next(error);
    }
  }

  async exportLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        userId,
        applicationId,
        action,
        resource,
        success,
        startDate,
        endDate,
        ipAddress,
        format = 'json',
      } = req.query;

      const filters = {
        userId: userId as string,
        applicationId: applicationId as string,
        action: action as string,
        resource: resource as string,
        success: success ? success === 'true' : undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        ipAddress: ipAddress as string,
      };

      const logs = await auditService.findMany(filters, {
        limit: 10000, // Maximum export limit
        offset: 0,
        orderBy: [{ createdAt: 'desc' }],
      });

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');

        const csvData = logs.map(log => ({
          id: log.id,
          userId: log.userId || '',
          userEmail: (log as any).user?.email || '',
          applicationId: log.applicationId || '',
          applicationName: (log as any).application?.name || '',
          action: log.action,
          resource: log.resource || '',
          resourceId: log.resourceId || '',
          success: log.success,
          errorMessage: log.errorMessage || '',
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          createdAt: log.createdAt.toISOString(),
        }));

        stringify(csvData, {
          header: true,
          columns: [
            'id',
            'userId',
            'userEmail',
            'applicationId',
            'applicationName',
            'action',
            'resource',
            'resourceId',
            'success',
            'errorMessage',
            'ipAddress',
            'userAgent',
            'createdAt',
          ],
        }).pipe(res);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.json"');
        res.json({
          success: true,
          message: 'Audit logs exported successfully',
          data: logs,
        });
      }
    } catch (error) {
      next(error);
    }
  }

  async cleanup(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { retentionDays = 90 } = req.body;

      const deletedCount = await auditService.cleanup(Number(retentionDays));

      res.json({
        success: true,
        message: `Cleaned up ${deletedCount} audit logs older than ${retentionDays} days`,
        data: {
          deletedCount,
          retentionDays: Number(retentionDays),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const auditController = new AuditController();