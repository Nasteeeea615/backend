import { Router } from 'express';
import adminController from '../controllers/adminController';
import { authenticate, authorize } from '../middleware/authMiddleware';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

// Orders management
router.get('/orders', adminController.getAllOrders);
router.put('/orders/:id', adminController.updateOrder);
router.post('/orders/:id/assign', adminController.assignExecutor);

// Users management
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserDetails);
router.put('/users/:id/block', adminController.toggleBlockUser);
router.put('/users/:id/verify', adminController.verifyExecutor);

// Payments management
router.get('/payments', adminController.getAllPayments);
router.post('/payments/:id/refund', adminController.refundPayment);

// Tickets management
router.get('/tickets', adminController.getAllTickets);
router.post('/tickets/:id/reply', adminController.replyToTicket);
router.put('/tickets/:id/status', adminController.updateTicketStatus);

// Analytics
router.get('/analytics', adminController.getAnalytics);

export default router;
