import { Response } from 'express';
import { AuthRequest, APIResponse } from '../types';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import orderService from '../services/orderService';
import userService from '../services/userService';
import paymentService from '../services/paymentService';
import supportService from '../services/supportService';
import notificationService from '../services/notificationService';
import pool from '../config/database';

class AdminController {
  /**
   * GET /api/admin/orders
   * Get all orders with filters
   */
  getAllOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status, startDate, endDate, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    let query = `
      SELECT 
        o.*,
        c.name as client_name,
        c.phone_number as client_phone,
        e.name as executor_name,
        e.phone_number as executor_phone
      FROM orders o
      LEFT JOIN users c ON o.client_id = c.id
      LEFT JOIN users e ON o.executor_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND o.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND o.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND o.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM orders WHERE 1=1';
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (status) {
      countQuery += ` AND status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }

    if (startDate) {
      countQuery += ` AND created_at >= $${countParamIndex}`;
      countParams.push(startDate);
      countParamIndex++;
    }

    if (endDate) {
      countQuery += ` AND created_at <= $${countParamIndex}`;
      countParams.push(endDate);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    const response: APIResponse = {
      success: true,
      data: {
        orders: result.rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    };

    res.json(response);
  });

  /**
   * PUT /api/admin/orders/:id
   * Update order
   */
  updateOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');
    const { status, executor_id } = req.body;

    // Verify order exists
    await orderService.getOrderDetails(id);

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (executor_id) {
      updates.push(`executor_id = $${paramIndex}`);
      params.push(executor_id);
      paramIndex++;

      if (status === 'assigned' || !status) {
        updates.push(`accepted_at = NOW()`);
      }
    }

    if (updates.length === 0) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'No fields to update', 400);
    }

    params.push(id);
    const query = `
      UPDATE orders 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, params);

    const response: APIResponse = {
      success: true,
      data: { order: result.rows[0] },
    };

    res.json(response);
  });

  /**
   * POST /api/admin/orders/:id/assign
   * Assign executor to order
   */
  assignExecutor = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');
    const { executor_id } = req.body;

    if (!executor_id) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'Executor ID is required', 400);
    }

    // Verify executor exists and is verified
    const executor = await userService.findById(executor_id);
    if (!executor || executor.role !== 'executor') {
      throw new AppError('INVALID_EXECUTOR', 'Invalid executor', 400);
    }

    const executorProfile = await pool.query(
      'SELECT * FROM executor_profiles WHERE user_id = $1',
      [executor_id]
    );

    if (!executorProfile.rows[0]?.is_verified) {
      throw new AppError('EXECUTOR_NOT_VERIFIED', 'Executor is not verified', 400);
    }

    // Update order
    const result = await pool.query(
      `UPDATE orders 
       SET executor_id = $1, status = 'assigned', accepted_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [executor_id, id]
    );

    if (result.rows.length === 0) {
      throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
    }

    const response: APIResponse = {
      success: true,
      data: { order: result.rows[0] },
    };

    res.json(response);
  });

  /**
   * GET /api/admin/users
   * Get all users with filters
   */
  getAllUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { role, isBlocked, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Join with profiles so admin sees verification status and profile details
    let query = `
      SELECT
        u.*,
        cp.city, cp.street, cp.house_number,
        ep.vehicle_number, ep.vehicle_capacity, ep.is_verified,
        ep.is_working, ep.rating, ep.completed_orders_count, ep.balance as executor_balance,
        CASE WHEN u.email IS NOT NULL THEN true ELSE false END AS email_confirmed
      FROM users u
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      LEFT JOIN executor_profiles ep ON ep.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (role) {
      query += ` AND u.role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    if (isBlocked !== undefined) {
      query += ` AND u.is_blocked = $${paramIndex}`;
      params.push(isBlocked === 'true');
      paramIndex++;
    }

    query += ` ORDER BY u.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);

    const result = await pool.query(query, params);

    // Map rows: attach profile fields as nested objects for frontend compatibility
    const users = result.rows.map((row: any) => {
      const user: any = {
        id: row.id,
        phone_number: row.phone_number,
        name: row.name,
        email: row.email,
        role: row.role,
        is_blocked: row.is_blocked,
        created_at: row.created_at,
        updated_at: row.updated_at,
        email_confirmed: row.email_confirmed,
      };

      if (row.role === 'client' && row.city) {
        user.client_profile = {
          city: row.city,
          street: row.street,
          house_number: row.house_number,
        };
      }

      if (row.role === 'executor' && row.vehicle_number) {
        user.executor_profile = {
          vehicle_number: row.vehicle_number,
          vehicle_capacity: row.vehicle_capacity,
          is_verified: row.is_verified,
          is_working: row.is_working,
          rating: row.rating,
          completed_orders_count: row.completed_orders_count,
          balance: row.executor_balance,
        };
      }

      return user;
    });

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM users u WHERE 1=1';
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (role) {
      countQuery += ` AND u.role = $${countParamIndex}`;
      countParams.push(role);
      countParamIndex++;
    }

    if (isBlocked !== undefined) {
      countQuery += ` AND u.is_blocked = $${countParamIndex}`;
      countParams.push(isBlocked === 'true');
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    const response: APIResponse = {
      success: true,
      data: {
        users,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    };

    res.json(response);
  });

  /**
   * GET /api/admin/users/:id
   * Get user details
   */
  getUserDetails = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');

    const user = await userService.findById(id);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    let profile = null;
    if (user.role === 'client') {
      const result = await pool.query(
        'SELECT * FROM client_profiles WHERE user_id = $1',
        [id]
      );
      profile = result.rows[0];
    } else if (user.role === 'executor') {
      const result = await pool.query(
        'SELECT * FROM executor_profiles WHERE user_id = $1',
        [id]
      );
      profile = result.rows[0];
    }

    const response: APIResponse = {
      success: true,
      data: { user, profile },
    };

    res.json(response);
  });

  /**
   * PUT /api/admin/users/:id/block
   * Block or unblock user
   */
  toggleBlockUser = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');
    const { isBlocked } = req.body;

    if (typeof isBlocked !== 'boolean') {
      throw new AppError('MISSING_REQUIRED_FIELD', 'isBlocked field is required', 400);
    }

    const result = await pool.query(
      'UPDATE users SET is_blocked = $1 WHERE id = $2 RETURNING *',
      [isBlocked, id]
    );

    if (result.rows.length === 0) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    const response: APIResponse = {
      success: true,
      data: { user: result.rows[0] },
    };

    res.json(response);
  });

  /**
   * PUT /api/admin/users/:id/verify
   * Verify executor
   */
  verifyExecutor = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');
    const { isVerified } = req.body;

    if (typeof isVerified !== 'boolean') {
      throw new AppError('MISSING_REQUIRED_FIELD', 'isVerified field is required', 400);
    }

    // Check if user is executor
    const user = await userService.findById(id);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }
    if (user.role !== 'executor') {
      throw new AppError('INVALID_USER_ROLE', 'User is not an executor', 400);
    }

    const currentProfileResult = await pool.query(
      'SELECT is_verified FROM executor_profiles WHERE user_id = $1',
      [id]
    );
    const wasVerified = currentProfileResult.rows[0]?.is_verified === true;

    const result = await pool.query(
      'UPDATE executor_profiles SET is_verified = $1 WHERE user_id = $2 RETURNING *',
      [isVerified, id]
    );

    if (result.rows.length === 0) {
      throw new AppError('EXECUTOR_NOT_FOUND', 'Executor profile not found', 404);
    }

    if (isVerified && !wasVerified) {
      await notificationService.notifyExecutorVerified(id);
    }

    const response: APIResponse = {
      success: true,
      data: { profile: result.rows[0] },
    };

    res.json(response);
  });

  /**
   * GET /api/admin/payments
   * Get all payments with filters
   */
  getAllPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status, startDate, endDate, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    let query = `
      SELECT 
        p.*,
        u.name as client_name,
        u.phone_number as client_phone,
        o.city, o.street, o.house_number
      FROM payments p
      LEFT JOIN users u ON p.client_id = u.id
      LEFT JOIN orders o ON p.order_id = o.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND p.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND p.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);

    const result = await pool.query(query, params);

    // Get total count and sum
    let countQuery = 'SELECT COUNT(*), SUM(amount) as total_amount FROM payments WHERE 1=1';
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (status) {
      countQuery += ` AND status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }

    if (startDate) {
      countQuery += ` AND created_at >= $${countParamIndex}`;
      countParams.push(startDate);
      countParamIndex++;
    }

    if (endDate) {
      countQuery += ` AND created_at <= $${countParamIndex}`;
      countParams.push(endDate);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);
    const totalAmount = parseFloat(countResult.rows[0].total_amount || 0);

    const response: APIResponse = {
      success: true,
      data: {
        payments: result.rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
        totalAmount,
      },
    };

    res.json(response);
  });

  /**
   * POST /api/admin/payments/:id/refund
   * Refund payment
   */
  refundPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');

    const payment = await paymentService.refundPayment(id);

    const response: APIResponse = {
      success: true,
      data: { payment },
    };

    res.json(response);
  });

  /**
   * GET /api/admin/tickets
   * Get all tickets with filters
   */
  getAllTickets = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    let query = `
      SELECT 
        t.*,
        u.name as user_name,
        u.phone_number as user_phone,
        u.role as user_role
      FROM tickets t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM tickets WHERE 1=1';
    const countParams: any[] = [];

    if (status) {
      countQuery += ` AND status = $1`;
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    const response: APIResponse = {
      success: true,
      data: {
        tickets: result.rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    };

    res.json(response);
  });

  /**
   * POST /api/admin/tickets/:id/reply
   * Reply to ticket
   */
  replyToTicket = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');
    const { content } = req.body;

    if (!content) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'Content is required', 400);
    }

    const message = await supportService.addMessage(id, req.user.id, 'admin', content);

    const response: APIResponse = {
      success: true,
      data: { message },
    };

    res.json(response);
  });

  /**
   * PUT /api/admin/tickets/:id/status
   * Update ticket status
   */
  updateTicketStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');
    const { status } = req.body;

    if (!status || !['open', 'in_progress', 'closed'].includes(status)) {
      throw new AppError('INVALID_STATUS', 'Invalid status', 400);
    }

    const result = await pool.query(
      'UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      throw new AppError('TICKET_NOT_FOUND', 'Ticket not found', 404);
    }

    const response: APIResponse = {
      success: true,
      data: { ticket: result.rows[0] },
    };

    res.json(response);
  });

  /**
   * GET /api/admin/analytics
   * Get analytics data
   */
  getAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params: any[] = [];

    if (startDate && endDate) {
      dateFilter = 'WHERE created_at >= $1 AND created_at <= $2';
      params.push(startDate, endDate);
    } else {
      // Default to current month
      dateFilter = "WHERE created_at >= date_trunc('month', CURRENT_DATE)";
    }

    // Get orders count
    const ordersResult = await pool.query(
      `SELECT COUNT(*) as total, status FROM orders ${dateFilter} GROUP BY status`,
      params
    );

    // Get total payments
    const paymentsResult = await pool.query(
      `SELECT SUM(amount) as total, COUNT(*) as count FROM payments ${dateFilter} AND status = 'completed'`,
      params
    );

    // Get active users
    const activeUsersResult = await pool.query(
      `SELECT COUNT(DISTINCT client_id) as clients, COUNT(DISTINCT executor_id) as executors 
       FROM orders ${dateFilter}`,
      params
    );

    // Get new registrations
    const newUsersResult = await pool.query(
      `SELECT COUNT(*) as total, role FROM users ${dateFilter} GROUP BY role`,
      params
    );

    const response: APIResponse = {
      success: true,
      data: {
        orders: {
          total: ordersResult.rows.reduce((sum: number, row: any) => sum + parseInt(row.count), 0),
          byStatus: ordersResult.rows,
        },
        payments: {
          total: parseFloat(paymentsResult.rows[0]?.total || 0),
          count: parseInt(paymentsResult.rows[0]?.count || 0),
        },
        activeUsers: {
          clients: parseInt(activeUsersResult.rows[0]?.clients || 0),
          executors: parseInt(activeUsersResult.rows[0]?.executors || 0),
        },
        newRegistrations: newUsersResult.rows,
      },
    };

    res.json(response);
  });
  /**
   * POST /api/admin/users/:id/balance
   * Top up executor balance (admin only, for testing)
   */
  topUpExecutorBalance = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id || '');
    const { amount } = req.body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      throw new AppError('INVALID_AMOUNT', 'Укажите корректную сумму пополнения', 400);
    }

    const num = Number(amount);

    // Verify user is executor
    const userResult = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [id]
    );
    if (userResult.rows.length === 0) throw new AppError('USER_NOT_FOUND', 'Пользователь не найден', 404);
    if (userResult.rows[0].role !== 'executor') throw new AppError('INVALID_ROLE', 'Пользователь не является исполнителем', 400);

    await pool.query(
      `UPDATE executor_profiles SET balance = balance + $1 WHERE user_id = $2`,
      [num, id]
    );

    const profile = await pool.query(
      'SELECT balance FROM executor_profiles WHERE user_id = $1',
      [id]
    );

    const response: APIResponse = {
      success: true,
      data: { balance: profile.rows[0]?.balance, message: `Баланс пополнен на ${num} ₽` },
    };

    res.json(response);
  });
}

export default new AdminController();
