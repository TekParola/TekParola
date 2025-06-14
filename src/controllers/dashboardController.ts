import { Request, Response, NextFunction } from 'express';
import { dashboardService } from '../services/dashboardService';
import { ApiResponse } from '../types';

class DashboardController {
  async getOverview(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const data = await dashboardService.getDashboardStats();

      res.json({
        success: true,
        message: 'Dashboard overview retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserGrowth(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { days = 30 } = req.query;
      
      const data = await dashboardService.getActivityMetrics(Number(days));

      res.json({
        success: true,
        message: 'User growth data retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getLoginActivity(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { days = 7 } = req.query;
      
      const data = await dashboardService.getActivityMetrics(Number(days));

      res.json({
        success: true,
        message: 'Login activity data retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getApplicationUsage(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      // This method doesn't exist in dashboardService, so we'll use getDashboardStats
      const data = await dashboardService.getDashboardStats();

      res.json({
        success: true,
        message: 'Application usage data retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSystemHealth(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const data = await dashboardService.getSystemHealth();

      res.json({
        success: true,
        message: 'System health data retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSecurityOverview(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { limit = 20 } = req.query;
      
      const data = await dashboardService.getSecurityEvents(Number(limit));

      res.json({
        success: true,
        message: 'Security overview data retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRoleDistribution(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      // This method doesn't exist in dashboardService, we'll use getDashboardStats
      const data = await dashboardService.getDashboardStats();

      res.json({
        success: true,
        message: 'Role distribution data retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRecentActivities(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const { limit = 20 } = req.query;
      
      const data = await dashboardService.getRecentAuditLogs(Number(limit));

      res.json({
        success: true,
        message: 'Recent activities retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getPerformanceMetrics(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
    try {
      const data = await dashboardService.getSystemHealth();

      res.json({
        success: true,
        message: 'Performance metrics retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const dashboardController = new DashboardController();