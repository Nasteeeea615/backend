import { Response } from 'express';
import { AuthRequest, CreateOrderDTO, APIResponse } from '../types';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import orderService from '../services/orderService';
import paymentService from '../services/paymentService';

class OrderController {
  /**
   * POST /api/orders
   * Create new order
   */
  createOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const data: CreateOrderDTO = req.body;

    // Validate required fields
    if (
      !data.vehicle_capacity ||
      !data.city ||
      !data.street ||
      !data.house_number ||
      !data.scheduled_date ||
      !data.scheduled_time ||
      !data.payment_type
    ) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'All fields are required', 400);
    }

    // Validate vehicle capacity
    if (![3, 5, 10].includes(data.vehicle_capacity)) {
      throw new AppError('INVALID_VEHICLE_CAPACITY', 'Vehicle capacity must be 3, 5, or 10', 400);
    }

    // Validate payment type
    if (!['cash', 'sbp'].includes(data.payment_type)) {
      throw new AppError('INVALID_PAYMENT_METHOD', 'Payment type must be cash or sbp', 400);
    }

    // Create order
    const order = await orderService.createOrder(req.user.id, data);

    const response: APIResponse = {
      success: true,
      data: { order },
    };

    res.status(201).json(response);
  });

  /**
   * GET /api/orders/my
   * Get current user's orders
   */
  getMyOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const orders = await orderService.getOrdersByClientId(req.user.id);

    const response: APIResponse = {
      success: true,
      data: { orders },
    };

    res.json(response);
  });

  /**
   * GET /api/orders/:id
   * Get order details
   */
  getOrderDetails = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');

    // Check if order belongs to user (client, executor on the order, or admin)
    const isOwner = await orderService.isOrderOwnedByClient(id, req.user.id);
    const isExecutorOnOrder = req.user.role === 'executor'
      ? await orderService.isOrderAssignedToExecutor(id, req.user.id)
      : false;
    if (!isOwner && !isExecutorOnOrder && req.user.role !== 'admin') {
      throw new AppError('FORBIDDEN', 'You do not have access to this order', 403);
    }

    const order = await orderService.getOrderDetails(id);

    const response: APIResponse = {
      success: true,
      data: { order },
    };

    res.json(response);
  });

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
}

export default new OrderController();
