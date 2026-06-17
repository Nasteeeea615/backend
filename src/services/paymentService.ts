import pool from '../config/database';
import { Payment } from '../types';
import { AppError } from '../middleware/errorHandler';
import { io } from '../index';
import notificationService from './notificationService';
import yookassaService from './yookassaService';
import { randomUUID } from 'crypto';
import balanceService from './balanceService';
import logger from '../utils/logger';

class PaymentService {
  private timeoutJobStarted = false;
  private pollingJobStarted = false;
  private readonly sbpTimeoutMinutes = Number(process.env.SBP_PAYMENT_TIMEOUT_MINUTES || 15);
  private readonly pollingIntervalMs = Number(process.env.YOOKASSA_POLL_INTERVAL_MS || 30_000);

  /**
   * Start background job that expires stale SBP payments.
   */
  startSbpTimeoutScheduler(): void {
    if (this.timeoutJobStarted) {
      return;
    }

    this.timeoutJobStarted = true;

    // Run once at startup to clean stale pending payments.
    this.expireTimedOutSbpPayments().catch((error: any) => {
      logger.error('Initial SBP timeout sweep failed', {
        error: error?.message,
      });
    });

    // Sweep every minute.
    setInterval(() => {
      this.expireTimedOutSbpPayments().catch((error: any) => {
        logger.error('SBP timeout sweep failed', {
          error: error?.message,
        });
      });
    }, 60 * 1000);

    logger.info('SBP timeout scheduler started', {
      timeoutMinutes: this.sbpTimeoutMinutes,
      intervalSeconds: 60,
    });
  }

  /**
   * Mark pending SBP payments older than timeout as failed.
   */
  async expireTimedOutSbpPayments(): Promise<number> {
    const result = await pool.query(
      `WITH expired AS (
         UPDATE payments p
         SET status = 'failed',
             yookassa_status = COALESCE(p.yookassa_status, 'canceled'),
             error_message = $1
         FROM orders o
         WHERE p.order_id = o.id
           AND p.status = 'pending'
           AND o.payment_type = 'sbp'
           AND p.created_at <= NOW() - ($2::text || ' minutes')::interval
         RETURNING p.order_id, p.id
       )
       UPDATE orders o
       SET payment_status = 'cancelled'
       FROM expired e
       WHERE o.id = e.order_id
       RETURNING e.id`,
      [`Истекло время оплаты (${this.sbpTimeoutMinutes} минут)`, String(this.sbpTimeoutMinutes)]
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info('Expired stale SBP payments', {
        count: result.rowCount,
        timeoutMinutes: this.sbpTimeoutMinutes,
      });
    }

    return result.rowCount || 0;
  }

  /**
   * Start background poller that syncs pending YooKassa payment statuses.
   * Used as a fallback when webhooks are not configured / not reachable.
   */
  startYooKassaPolling(): void {
    if (this.pollingJobStarted) return;
    this.pollingJobStarted = true;

    const poll = async () => {
      try {
        // Find pending payments that have a yookassa_payment_id
        const result = await pool.query(
          `SELECT id, yookassa_payment_id
           FROM payments
           WHERE status = 'pending'
             AND yookassa_payment_id IS NOT NULL
           ORDER BY created_at ASC
           LIMIT 50`
        );

        for (const row of result.rows) {
          try {
            const yk = await yookassaService.getPaymentStatus(row.yookassa_payment_id);
            if (yk.status === 'succeeded') {
              logger.info('Poller: payment succeeded', { paymentId: row.id, ykId: row.yookassa_payment_id });
              await this.handlePaymentSuccess(yk);
            } else if (yk.status === 'canceled') {
              logger.info('Poller: payment canceled', { paymentId: row.id, ykId: row.yookassa_payment_id });
              await this.handlePaymentFailed(yk);
            }
          } catch (inner: any) {
            logger.warn('Poller: failed to check payment', {
              paymentId: row.id,
              error: inner?.message,
            });
          }
        }
      } catch (error: any) {
        logger.error('YooKassa poller sweep failed', { error: error?.message });
      }
    };

    // First run after 10 seconds, then every pollingIntervalMs
    setTimeout(() => {
      poll();
      setInterval(poll, this.pollingIntervalMs);
    }, 10_000);

    logger.info('YooKassa payment poller started', { intervalMs: this.pollingIntervalMs });
  }

  /**
   * Create payment for order
   */
  async createPayment(orderId: string, clientId: string, paymentMethod: any): Promise<any> {
    // Get order details
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);

    if (orderResult.rows.length === 0) {
      throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
    }

    const order = orderResult.rows[0];

    // Check if order belongs to client
    if (order.client_id !== clientId) {
      throw new AppError('FORBIDDEN', 'This order does not belong to you', 403);
    }

    // Allow payment when order is active or completed (SBP is paid before executor marks complete)
    const payableStatuses = ['in_progress', 'awaiting_payment', 'completed'];
    if (!payableStatuses.includes(order.status)) {
      throw new AppError('ORDER_NOT_READY', 'Заказ ещё не принят исполнителем', 400);
    }

    // Check if payment already exists
    const existingPayment = await pool.query(
      'SELECT * FROM payments WHERE order_id = $1 AND status IN ($2, $3, $4)',
      [orderId, 'completed', 'pending', 'pending_cash']
    );

    if (existingPayment.rows.length > 0) {
      const existing = existingPayment.rows[0];
      if (existing.status === 'completed') {
        throw new AppError('PAYMENT_ALREADY_EXISTS', 'Order has already been paid', 400);
      }
      // Return existing pending payment
      return {
        payment: existing,
        confirmation_url: existing.confirmation_url,
      };
    }

    const idempotencyKey = randomUUID();

    // Cash payments are confirmed in-app without YooKassa redirect
    if (paymentMethod?.type === 'cash' || order.payment_type === 'cash') {
      const cashResult = await pool.query(
        `INSERT INTO payments (
          order_id, client_id, amount, status, payment_method,
          idempotency_key, yookassa_payment_id, yookassa_status
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          orderId,
          clientId,
          order.price,
          'pending_cash',
          JSON.stringify({ type: 'cash' }),
          idempotencyKey,
          null,
          null,
        ]
      );

      const cashPayment = cashResult.rows[0];
      await this.processPayment(cashPayment.id);

      const completedCashPayment = await pool.query('SELECT * FROM payments WHERE id = $1', [
        cashPayment.id,
      ]);

      return {
        payment: completedCashPayment.rows[0],
        confirmation_url: null,
      };
    }

    // Create payment record in database first
    const result = await pool.query(
      `INSERT INTO payments (
        order_id, client_id, amount, status, payment_method,
        idempotency_key, yookassa_payment_id, yookassa_status
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [orderId, clientId, order.price, 'pending', JSON.stringify(paymentMethod), idempotencyKey, null, null]
    );

    const payment = result.rows[0];

    // Create payment in YooKassa
    try {
      const yookassaPayment = await yookassaService.createPayment({
        amount: order.price,
        description: `Оплата заказа #${orderId.substring(0, 8)}`,
        orderId: orderId,
        metadata: {
          payment_id: payment.id,
          client_id: clientId,
        },
      });

      // Update payment with YooKassa data
      await pool.query(
        `UPDATE payments 
         SET yookassa_payment_id = $1, 
             yookassa_status = $2,
             confirmation_url = $3
         WHERE id = $4`,
        [yookassaPayment.id, yookassaPayment.status, yookassaPayment.confirmation.confirmation_url, payment.id]
      );

      await pool.query(
        `UPDATE orders
         SET payment_status = 'pending'
         WHERE id = $1`,
        [orderId]
      );

      return {
        payment: {
          ...payment,
          yookassa_payment_id: yookassaPayment.id,
          confirmation_url: yookassaPayment.confirmation.confirmation_url,
        },
        confirmation_url: yookassaPayment.confirmation.confirmation_url,
      };
    } catch (error: any) {
      // Mark payment as failed
      await pool.query(
        `UPDATE payments SET status = $1, error_message = $2 WHERE id = $3`,
        ['failed', (error as Error).message, payment.id]
      );
      throw error;
    }
  }

  /**
   * Process payment (simulate payment gateway)
   */
  async processPayment(paymentId: string): Promise<void> {
    // In production, this would call payment gateway API
    // For development, we'll simulate successful payment

    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await pool.query(
      `UPDATE payments 
       SET status = 'completed', transaction_id = $1, completed_at = NOW()
       WHERE id = $2`,
      [transactionId, paymentId]
    );

    // Get payment details
    const result = await pool.query(
      `SELECT p.*, o.client_id, o.executor_id 
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       WHERE p.id = $1`,
      [paymentId]
    );

    const payment = result.rows[0];

    await pool.query(
      `UPDATE orders
       SET payment_status = 'paid'
       WHERE id = $1`,
      [payment.order_id]
    );

    // Send push notifications
    await notificationService.notifyPaymentSuccess(payment.client_id, payment.order_id, payment.amount);
    
    if (payment.executor_id) {
      await notificationService.notifyPaymentSuccess(payment.executor_id, payment.order_id, payment.amount);
    }

    // Send WebSocket notifications
    io.emit(`client:${payment.client_id}`, {
      type: 'payment:success',
      paymentId,
      message: 'Оплата прошла успешно',
    });

    if (payment.executor_id) {
      io.emit(`executor:${payment.executor_id}`, {
        type: 'payment:received',
        paymentId,
        message: 'Клиент оплатил заказ',
      });
    }
  }

  /**
   * Process webhook from YooKassa
   */
  async processWebhook(webhookData: any): Promise<void> {
    const { type, object } = webhookData;

    if (type === 'payment.succeeded') {
      await this.handlePaymentSuccess(object);
    } else if (type === 'payment.canceled') {
      await this.handlePaymentFailed(object);
    } else if (type === 'refund.succeeded') {
      await this.handleRefundSuccess(object);
    }
  }

  /**
   * Handle successful payment from YooKassa
   */
  private async handlePaymentSuccess(paymentData: any): Promise<void> {
    const yookassaPaymentId = paymentData.id;

    // Find payment by YooKassa ID
    const result = await pool.query(
      'SELECT * FROM payments WHERE yookassa_payment_id = $1',
      [yookassaPaymentId]
    );

    if (result.rows.length === 0) {
      // Handle executor balance top-up payments that are not tied to orders.
      const metadata = paymentData?.metadata || {};
      if (metadata.kind === 'executor_deposit' && metadata.executor_id) {
        const existingTopup = await pool.query(
          `SELECT id
           FROM balance_transactions
           WHERE executor_id = $1
             AND type = 'deposit'
             AND description = $2
           LIMIT 1`,
          [metadata.executor_id, `Пополнение через YooKassa ${yookassaPaymentId}`]
        );

        if (existingTopup.rows.length === 0) {
          await balanceService.recordDeposit(
            metadata.executor_id,
            Number(paymentData?.amount?.value || metadata.amount || 0),
            `Пополнение через YooKassa ${yookassaPaymentId}`
          );
        }

        return;
      }

      throw new AppError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
    }

    const payment = result.rows[0];

    // Update payment status
    await pool.query(
      `UPDATE payments 
       SET status = 'completed', 
           yookassa_status = $1,
           transaction_id = $2,
           completed_at = NOW()
       WHERE id = $3`,
      [paymentData.status, yookassaPaymentId, payment.id]
    );

    await pool.query(
      `UPDATE orders
       SET payment_status = 'paid'
       WHERE id = $1`,
      [payment.order_id]
    );

    // Get order details
    const orderResult = await pool.query(
      `SELECT p.*, o.client_id, o.executor_id 
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       WHERE p.id = $1`,
      [payment.id]
    );

    const updatedPayment = orderResult.rows[0];

    // Send notifications
    await notificationService.notifyPaymentSuccess(
      updatedPayment.client_id,
      updatedPayment.order_id,
      updatedPayment.amount
    );

    if (updatedPayment.executor_id) {
      await notificationService.notifyPaymentSuccess(
        updatedPayment.executor_id,
        updatedPayment.order_id,
        updatedPayment.amount
      );
    }

    // Send WebSocket notifications
    io.emit(`client:${updatedPayment.client_id}`, {
      type: 'payment:success',
      paymentId: payment.id,
      message: 'Оплата прошла успешно',
    });

    if (updatedPayment.executor_id) {
      io.emit(`executor:${updatedPayment.executor_id}`, {
        type: 'payment:received',
        paymentId: payment.id,
        message: 'Клиент оплатил заказ',
      });
    }
  }

  /**
   * Handle failed payment from YooKassa
   */
  private async handlePaymentFailed(paymentData: any): Promise<void> {
    const yookassaPaymentId = paymentData.id;
    const cancellationReason = paymentData.cancellation_details?.reason || 'Payment canceled';

    await pool.query(
      `UPDATE payments 
       SET status = 'failed',
           yookassa_status = $1,
           error_message = $2
       WHERE yookassa_payment_id = $3`,
      [paymentData.status, cancellationReason, yookassaPaymentId]
    );

    await pool.query(
      `UPDATE orders
       SET payment_status = 'cancelled'
       WHERE id IN (
         SELECT order_id
         FROM payments
         WHERE yookassa_payment_id = $1
       )`,
      [yookassaPaymentId]
    );
  }

  /**
   * Handle successful refund from YooKassa
   */
  private async handleRefundSuccess(refundData: any): Promise<void> {
    const yookassaPaymentId = refundData.payment_id;

    await pool.query(
      `UPDATE payments 
       SET status = 'refunded'
       WHERE yookassa_payment_id = $1`,
      [yookassaPaymentId]
    );

    await pool.query(
      `UPDATE orders
       SET payment_status = 'refunded'
       WHERE id IN (
         SELECT order_id
         FROM payments
         WHERE yookassa_payment_id = $1
       )`,
      [yookassaPaymentId]
    );
  }

  /**
   * Get payment by order ID
   */
  async getPaymentByOrderId(orderId: string): Promise<Payment | null> {
    const result = await pool.query('SELECT * FROM payments WHERE order_id = $1', [orderId]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }
  /**
   * Process refund
   */
  async refundPayment(paymentId: string): Promise<Payment> {
    const result = await pool.query('SELECT * FROM payments WHERE id = $1', [paymentId]);

    if (result.rows.length === 0) {
      throw new AppError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
    }

    const payment = result.rows[0];

    if (payment.status !== 'completed') {
      throw new AppError('PAYMENT_NOT_COMPLETED', 'Only completed payments can be refunded', 400);
    }

    // In production, call payment gateway refund API
    const updateResult = await pool.query(
      'UPDATE payments SET status = $1 WHERE id = $2 RETURNING *',
      ['refunded', paymentId]
    );

    const refundedPayment = updateResult.rows[0];

    // Get order details for notification
    const orderResult = await pool.query('SELECT client_id FROM orders WHERE id = $1', [
      payment.order_id,
    ]);

    if (orderResult.rows.length > 0) {
      io.emit(`client:${orderResult.rows[0].client_id}`, {
        type: 'payment:refunded',
        paymentId,
        message: 'Платеж возвращен',
      });
    }

    return refundedPayment;
  }
}

export default new PaymentService();
