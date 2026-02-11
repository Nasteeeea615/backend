import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import paymentService from '../services/paymentService';
import logger from '../utils/logger';
import yookassaService from '../services/yookassaService';

class WebhookController {
  /**
   * POST /api/webhooks/yookassa
   * Handle YooKassa webhook
   */
  handleYooKassaWebhook = asyncHandler(async (req: Request, res: Response) => {
    // Capture raw body if available (set in express.json verify middleware)
    const raw = (req as any).rawBody || JSON.stringify(req.body);

    // Try to get signature from common headers
    const signature = (req.headers['x-request-signature'] || req.headers['x-signature'] || req.headers['x-yookassa-signature']) as string | undefined;

    // Verify webhook authenticity
    const verified = await yookassaService.verifyWebhookSignature(raw, signature);
    if (!verified) {
      logger.warn('Unverified YooKassa webhook received', { headers: req.headers });
      return res.status(401).json({ received: false, error: 'Invalid webhook signature' });
    }

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
      return res.status(200).json({ received: true });
    } catch (error: any) {
      logger.error('Error processing webhook', {
        error: error.message,
        webhookData,
      });

      // Still return 200 to prevent retries
      return res.status(200).json({ received: true, error: error.message });
    }
  });
}

export default new WebhookController();
