import { Response } from 'express';
import { AuthRequest, APIResponse } from '../types';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import executorService from '../services/executorService';

class ExecutorController {
  /**
   * POST /api/executor/start-work
   * Start working
   */
  startWork = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    await executorService.startWork(req.user.id);

    const response: APIResponse = {
      success: true,
      data: { message: 'Started working' },
    };

    res.json(response);
  });

  /**
   * POST /api/executor/stop-work
   * Stop working
   */
  stopWork = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    await executorService.stopWork(req.user.id);

    const response: APIResponse = {
      success: true,
      data: { message: 'Stopped working' },
    };

    res.json(response);
  });

  /**
   * GET /api/executor/orders
   * Get available orders
   */
  getAvailableOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const orders = await executorService.getAvailableOrders(req.user.id);

    const response: APIResponse = {
      success: true,
      data: { orders },
    };

    res.json(response);
  });

  /**
   * POST /api/executor/orders/:id/accept
   * Accept order
   */
  acceptOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');
    const order = await executorService.acceptOrder(req.user.id, id);

    const response: APIResponse = {
      success: true,
      data: { order },
    };

    res.json(response);
  });

  /**
   * POST /api/executor/orders/:id/complete
   * Complete order
   */
  completeOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');
    const order = await executorService.completeOrder(req.user.id, id);

    const response: APIResponse = {
      success: true,
      data: { order },
    };

    res.json(response);
  });

  /**
   * GET /api/executor/orders/history
   * Get completed orders history
   */
  getOrdersHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const orders = await executorService.getOrdersHistory(req.user.id);

    const response: APIResponse = {
      success: true,
      data: { orders },
    };

    res.json(response);
  });

  /**
   * GET /api/executor/orders/active
   * Get current active order
   */
  getActiveOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const order = await executorService.getActiveOrder(req.user.id);

    const response: APIResponse = {
      success: true,
      data: { order },
    };

    res.json(response);
  });
}

export default new ExecutorController();
