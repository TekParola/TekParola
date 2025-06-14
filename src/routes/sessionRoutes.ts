import { Router } from 'express';
import { sessionController } from '../controllers/sessionController';
import { authenticate, authorize } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { param, query } from 'express-validator';

const router = Router();

// All session routes require authentication
router.use(authenticate);

// User's own session management
router.get(
  '/my-sessions',
  sessionController.getCurrentUserSessions
);

router.delete(
  '/my-sessions/:sessionId',
  [param('sessionId').notEmpty().withMessage('Session ID is required')],
  validateRequest,
  sessionController.revokeCurrentUserSession
);

router.delete(
  '/my-sessions',
  sessionController.revokeAllCurrentUserSessions
);

// Admin session management
router.get(
  '/',
  authorize(['sessions.read', 'admin']),
  [
    query('userId').optional().isString().withMessage('User ID must be a string'),
    query('isActive').optional().isIn(['true', 'false', 'all']).withMessage('isActive must be true, false, or all'),
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer'),
  ],
  validateRequest,
  sessionController.getAllSessions
);

router.get(
  '/stats',
  authorize(['sessions.read', 'admin']),
  sessionController.getSessionStats
);

router.get(
  '/activity',
  authorize(['sessions.read', 'admin']),
  [
    query('days').optional().isInt({ min: 1, max: 90 }).withMessage('Days must be between 1 and 90'),
  ],
  validateRequest,
  sessionController.getSessionActivity
);

router.delete(
  '/:sessionId',
  authorize(['sessions.delete', 'admin']),
  [param('sessionId').notEmpty().withMessage('Session ID is required')],
  validateRequest,
  sessionController.revokeSession
);

router.post(
  '/cleanup',
  authorize(['sessions.delete', 'admin']),
  sessionController.cleanExpiredSessions
);

export default router;