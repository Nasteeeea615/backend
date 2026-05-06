import { Router } from 'express';
import executorController from '../controllers/executorController';
import { authenticate, authorize } from '../middleware/authMiddleware';

const router = Router();

// All routes require authentication and executor role
router.use(authenticate);
router.use(authorize('executor'));

// POST /api/executor/start-work - Start working
router.post('/start-work', executorController.startWork);

// POST /api/executor/stop-work - Stop working
router.post('/stop-work', executorController.stopWork);

// GET /api/executor/orders - Get available orders
router.get('/orders', executorController.getAvailableOrders);

// GET /api/executor/orders/active - Get active order
router.get('/orders/active', executorController.getActiveOrder);

// GET /api/executor/orders/history - Get orders history
router.get('/orders/history', executorController.getOrdersHistory);

// POST /api/executor/orders/:id/accept - Accept order
router.post('/orders/:id/accept', executorController.acceptOrder);

// POST /api/executor/orders/:id/complete - Complete order
router.post('/orders/:id/complete', executorController.completeOrder);

// GET /api/executor/balance - Get executor balance and recent transactions
router.get('/balance', executorController.getBalance);

// POST /api/executor/deposit - Create balance top-up payment via YooKassa
router.post('/deposit', executorController.createDepositPayment);

// POST /api/executor/withdraw - Request withdrawal
router.post('/withdraw', executorController.requestWithdrawal);

export default router;
