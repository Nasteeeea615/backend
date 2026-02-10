import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import paymentService from '../services/paymentService';
import logger from '../utils/logger';

class WebhookController {
  /**
   * POST /api/webhooks/yookassa
   * Handle YooKassa webhook
   */
  handleYooKassaWebhook = asyncHandler(async (req: Request, res: Response) => {
    const webhookData = req.body;

    logger.info('Received YooKassa webhook', {
      type: webhookData.type,
      objectId: webhookData.object?.id,
    });

    // Log webhook to database for debugging
    // TODO: Implement webhook logging

    try {
      await paymentService.processWebhook(webhookData);

      // Always return 200 to YooKassa
      res.status(200).json({ received: true });
    } catch (error: any) {
      logger.error('Error processing webhook', {
        error: error.message,
        webhookData,
      });

      // Still return 200 to prevent retries
      res.status(200).json({ received: true, error: error.message });
    }
  });
}

export default new WebhookController();
