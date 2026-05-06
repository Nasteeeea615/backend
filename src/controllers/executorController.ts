import { Response } from 'express';
import { AuthRequest, APIResponse } from '../types';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import executorService from '../services/executorService';
import balanceService from '../services/balanceService';
import yookassaService from '../services/yookassaService';

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

  /**
   * GET /api/executor/balance
   * Get current balance and recent transactions
   */
  getBalance = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const data = await balanceService.getBalanceWithHistory(req.user.id, 50);

    const response: APIResponse = {
      success: true,
      data,
    };

    res.json(response);
  });

  /**
   * POST /api/executor/deposit
   * Create YooKassa top-up payment for executor balance
   */
  createDepositPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const amount = Number(req.body?.amount);
    if (!amount || amount < 100) {
      throw new AppError('INVALID_AMOUNT', 'Минимальная сумма пополнения 100 ₽', 400);
    }

    const payment = await yookassaService.createPayment({
      amount,
      description: `Пополнение баланса исполнителя ${req.user.id.substring(0, 8)}`,
      orderId: `executor_deposit_${req.user.id}_${Date.now()}`,
      metadata: {
        kind: 'executor_deposit',
        executor_id: req.user.id,
        amount,
      },
    });

    const response: APIResponse = {
      success: true,
      data: {
        paymentId: payment.id,
        paymentUrl: payment.confirmation.confirmation_url,
      },
    };

    res.json(response);
  });

  /**
   * POST /api/executor/withdraw
   * Create withdrawal request and deduct balance
   */
  requestWithdrawal = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const { amount, bank_name, account_number } = req.body;

    if (!amount || amount <= 0) {
      throw new AppError('INVALID_AMOUNT', 'Amount must be greater than 0', 400);
    }

    if (!bank_name || !account_number) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'bank_name and account_number are required', 400);
    }

    const withdrawalResult = await executorService.createWithdrawalRequest(req.user.id, {
      amount: Number(amount),
      bank_name,
      account_number,
    });

    await balanceService.recordWithdrawal(
      req.user.id,
      withdrawalResult.id,
      Number(amount)
    );

    const response: APIResponse = {
      success: true,
      data: {
        withdrawal: withdrawalResult,
        message: 'Withdrawal request created successfully',
      },
    };

    res.json(response);
  });
}

export default new ExecutorController();
