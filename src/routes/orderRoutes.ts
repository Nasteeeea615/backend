import { Router } from 'express';
import orderController from '../controllers/orderController';
import { authenticate, authorize } from '../middleware/authMiddleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /api/orders - Create new order (clients only)
router.post('/', authorize('client'), orderController.createOrder);

// GET /api/orders/my - Get my orders (clients only)
router.get('/my', authorize('client'), orderController.getMyOrders);

// GET /api/orders/:id - Get order details
router.get('/:id', orderController.getOrderDetails);

// POST /api/orders/:id/pay - Pay for order
router.post('/:id/pay', authorize('client'), orderController.payOrder);

export default router;
