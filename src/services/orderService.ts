import pool from '../config/database';
import { Order, CreateOrderDTO } from '../types';
import { AppError } from '../middleware/errorHandler';
import { io } from '../index';
import notificationService from './notificationService';

class OrderService {
  /**
   * Calculate order price based on vehicle capacity
   */
  calculatePrice(vehicleCapacity: 3 | 5 | 10): number {
    return vehicleCapacity * 600;
  }

  /**
   * Create new order
   */
  async createOrder(clientId: string, data: CreateOrderDTO): Promise<Order> {
    const price = this.calculatePrice(data.vehicle_capacity);

    const result = await pool.query(
      `INSERT INTO orders (
        client_id, status, vehicle_capacity, city, street, house_number,
        scheduled_date, scheduled_time, comment, price, payment_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        clientId,
        'pending',
        data.vehicle_capacity,
        data.city,
        data.street,
        data.house_number,
        data.scheduled_date,
        data.scheduled_time,
        data.comment || null,
        price,
        data.payment_type || 'cash',
      ]
    );

    const order = result.rows[0];

    // Notify available executors about new order
    await this.notifyAvailableExecutors(order.id, data.vehicle_capacity);

    return order;
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string): Promise<Order | null> {
    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Get orders by client ID
   */
  async getOrdersByClientId(clientId: string): Promise<Order[]> {
    const result = await pool.query(
      `SELECT o.*, 
        json_build_object('id', e.id, 'name', e.name) as executor
       FROM orders o
       LEFT JOIN users e ON o.executor_id = e.id
       WHERE o.client_id = $1
       ORDER BY o.created_at DESC`,
      [clientId]
    );

    return result.rows;
  }

  /**
   * Get order details with client and executor info
   */
  async getOrderDetails(orderId: string): Promise<any> {
    const result = await pool.query(
      `SELECT o.*,
        json_build_object('id', c.id, 'name', c.name, 'phone_number', c.phone_number) as client,
        json_build_object('id', e.id, 'name', e.name, 'phone_number', e.phone_number) as executor
       FROM orders o
       JOIN users c ON o.client_id = c.id
       LEFT JOIN users e ON o.executor_id = e.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (result.rows.length === 0) {
      throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
    }

    return result.rows[0];
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    orderId: string,
    status: Order['status'],
    executorId?: string
  ): Promise<Order> {
    let query = 'UPDATE orders SET status = $1';
    const params: any[] = [status, orderId];

    if (status === 'assigned' && executorId) {
      query += ', executor_id = $3, accepted_at = NOW()';
      params.splice(2, 0, executorId);
    } else if (status === 'completed') {
      query += ', completed_at = NOW()';
    }

    query += ' WHERE id = $2 RETURNING *';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
    }

    const order = result.rows[0];

    // Emit WebSocket event
    io.emit(`order:${orderId}`, {
      type: 'order:status_updated',
      order,
    });

    return order;
  }

  /**
   * Check if order belongs to client
   */
  async isOrderOwnedByClient(orderId: string, clientId: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT id FROM orders WHERE id = $1 AND client_id = $2',
      [orderId, clientId]
    );

    return result.rows.length > 0;
  }

  /**
   * Notify available executors about new order
   */
  async notifyAvailableExecutors(orderId: string, vehicleCapacity: 3 | 5 | 10): Promise<void> {
    try {
      // Find all available executors with matching vehicle capacity
      const result = await pool.query(
        `SELECT u.id
         FROM users u
         JOIN executor_profiles ep ON u.id = ep.user_id
         WHERE u.role = 'executor'
           AND u.is_blocked = false
           AND ep.is_verified = true
           AND ep.is_working = true
           AND ep.vehicle_capacity = $1`,
        [vehicleCapacity]
      );

      // Get order details for notification
      const orderDetails = await this.getOrderById(orderId);
      if (!orderDetails) return;

      const address = `${orderDetails.city}, ${orderDetails.street}, ${orderDetails.house_number}`;

      // Send push notification to each executor
      for (const executor of result.rows) {
        await notificationService.notifyNewOrder(executor.id, orderId, address, vehicleCapacity);
      }

      console.log(`Notified ${result.rows.length} executors about new order ${orderId}`);
    } catch (error) {
      console.error('Error notifying executors:', error);
    }
  }
}

export default new OrderService();
