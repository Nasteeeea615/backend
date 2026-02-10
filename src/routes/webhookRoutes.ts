import { Router } from 'express';
import webhookController from '../controllers/webhookController';

const router = Router();

// POST /api/webhooks/yookassa - Handle YooKassa webhook
router.post('/yookassa', webhookController.handleYooKassaWebhook);

export default router;
