import { Response } from 'express';
import { AuthRequest, APIResponse } from '../types';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import paymentService from '../services/paymentService';

class PaymentController {
  /**
   * POST /api/orders/:id/pay
   * Pay for order
   */
  payOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');
    const { paymentMethod } = req.body;

    if (!paymentMethod) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'Payment method is required', 400);
    }

    const payment = await paymentService.createPayment(id, req.user.id, paymentMethod);

    const response: APIResponse = {
      success: true,
      data: { payment },
    };

    res.json(response);
  });

  /**
   * POST /api/payments/webhook
   * Handle payment gateway webhook
   */
  handleWebhook = asyncHandler(async (req: AuthRequest, res: Response) => {
    // In production, verify webhook signature
    const { paymentId, status } = req.body;

    if (status === 'succeeded') {
      await paymentService.processPayment(paymentId);
    }

    res.json({ received: true });
  });
}

export default new PaymentController();
