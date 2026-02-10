import pool from '../config/database';
import { Order } from '../types';
import { AppError } from '../middleware/errorHandler';
import { io } from '../index';
import notificationService from './notificationService';

class ExecutorService {
  /**
   * Start working (set executor as available)
   */
  async startWork(executorId: string): Promise<void> {
    await pool.query(
      'UPDATE executor_profiles SET is_working = true WHERE user_id = $1',
      [executorId]
    );
  }

  /**
   * Stop working (set executor as unavailable)
   */
  async stopWork(executorId: string): Promise<void> {
    await pool.query(
      'UPDATE executor_profiles SET is_working = false WHERE user_id = $1',
      [executorId]
    );
  }

  /**
   * Get available orders for executor based on vehicle capacity
   * Returns limited info (no street/house_number) for privacy
   */
  async getAvailableOrders(executorId: string): Promise<Order[]> {
    // Get executor's vehicle capacity
    const executorResult = await pool.query(
      'SELECT vehicle_capacity FROM executor_profiles WHERE user_id = $1',
      [executorId]
    );

    if (executorResult.rows.length === 0) {
      throw new AppError('EXECUTOR_NOT_FOUND', 'Executor profile not found', 404);
    }

    const vehicleCapacity = executorResult.rows[0].vehicle_capacity;

    // Get available orders matching vehicle capacity
    // Only show city, date, time, and price - hide exact address for privacy
    const result = await pool.query(
      `SELECT 
        o.id,
        o.vehicle_capacity,
        o.city,
        o.scheduled_date,
        o.scheduled_time,
        o.is_urgent,
        o.price,
        o.created_at,
        o.status
       FROM orders o
       WHERE o.status = 'pending'
         AND o.vehicle_capacity = $1
       ORDER BY o.is_urgent DESC, o.created_at ASC`,
      [vehicleCapacity]
    );

    return result.rows;
  }

  /**
   * Accept order - returns full order details including address
   */
  async acceptOrder(executorId: string, orderId: string): Promise<Order> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if order is still available
      const orderCheck = await client.query(
        'SELECT * FROM orders WHERE id = $1 AND status = $2 FOR UPDATE',
        [orderId, 'pending']
      );

      if (orderCheck.rows.length === 0) {
        throw new AppError('ORDER_NOT_AVAILABLE', 'Order is no longer available', 400);
      }

      // Update order status and return full details including address
      const result = await client.query(
        `UPDATE orders 
         SET executor_id = $1, status = 'in_progress', accepted_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [executorId, orderId]
      );

      await client.query('COMMIT');

      const order = result.rows[0];

      // Get executor name for notification
      const executorResult = await client.query(
        'SELECT name FROM users WHERE id = $1',
        [executorId]
      );
      const executorName = executorResult.rows[0]?.name || 'Исполнитель';

      // Send push notification to client
      await notificationService.notifyOrderAccepted(order.client_id, orderId, executorName);

      // Emit WebSocket event to client
      io.emit(`client:${order.client_id}`, {
        type: 'order:accepted',
        orderId,
        message: 'Ваш заказ принят исполнителем',
      });

      return order;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Complete order
   */
  async completeOrder(executorId: string, orderId: string): Promise<Order> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if order belongs to executor
      const orderCheck = await client.query(
        'SELECT * FROM orders WHERE id = $1 AND executor_id = $2 FOR UPDATE',
        [orderId, executorId]
      );

      if (orderCheck.rows.length === 0) {
        throw new AppError('ORDER_NOT_FOUND', 'Order not found or not assigned to you', 404);
      }

      // Update order status
      const result = await client.query(
        `UPDATE orders 
         SET status = 'completed', completed_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [orderId]
      );

      // Update executor stats
      await client.query(
        `UPDATE executor_profiles 
         SET completed_orders_count = completed_orders_count + 1
         WHERE user_id = $1`,
        [executorId]
      );

      await client.query('COMMIT');

      const order = result.rows[0];

      // Send push notification to client
      await notificationService.notifyOrderCompleted(order.client_id, orderId, order.price);

      // Emit WebSocket event to client
      io.emit(`client:${order.client_id}`, {
        type: 'order:completed',
        orderId,
        message: 'Ваш заказ выполнен',
      });

      return order;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get executor's completed orders history
   */
  async getOrdersHistory(executorId: string): Promise<Order[]> {
    const result = await pool.query(
      `SELECT o.*,
        json_build_object('id', c.id, 'name', c.name, 'phone_number', c.phone_number) as client
       FROM orders o
       JOIN users c ON o.client_id = c.id
       WHERE o.executor_id = $1
         AND o.status = 'completed'
       ORDER BY o.completed_at DESC`,
      [executorId]
    );

    return result.rows;
  }

  /**
   * Get executor's current active order
   */
  async getActiveOrder(executorId: string): Promise<Order | null> {
    const result = await pool.query(
      `SELECT o.*,
        json_build_object('id', c.id, 'name', c.name, 'phone_number', c.phone_number) as client
       FROM orders o
       JOIN users c ON o.client_id = c.id
       WHERE o.executor_id = $1
         AND o.status = 'in_progress'
       LIMIT 1`,
      [executorId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }
}

export default new ExecutorService();
