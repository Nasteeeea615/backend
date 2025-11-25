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

    const { id } = req.params;
    const { paymentMethod, saveCard } = req.body;

    if (!paymentMethod) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'Payment method is required', 400);
    }

    const payment = await paymentService.createPayment(req.user.id, id, paymentMethod);

    // Save card if requested
    if (saveCard && paymentMethod.type === 'card') {
      await paymentService.savePaymentMethod(req.user.id, {
        type: 'saved_card',
        cardLast4: paymentMethod.cardLast4,
        cardToken: paymentMethod.cardToken,
      });
    }

    const response: APIResponse = {
      success: true,
      data: { payment },
    };

    res.json(response);
  });

  /**
   * GET /api/payments/methods
   * Get saved payment methods
   */
  getSavedMethods = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const methods = await paymentService.getSavedPaymentMethods(req.user.id);

    const response: APIResponse = {
      success: true,
      data: { methods },
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
