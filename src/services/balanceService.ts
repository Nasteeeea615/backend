import pool from '../config/database';
import { AppError } from '../middleware/errorHandler';

interface BalanceTransaction {
  id?: string;
  executor_id: string;
  type: 'commission_fee' | 'order_earning' | 'withdrawal' | 'deposit' | 'commission_refund' | 'refund';
  amount: number; // can be negative
  order_id?: string;
  payment_id?: string;
  withdrawal_id?: string;
  description: string;
}

class BalanceService {
  /**
   * Get executor's current balance
   */
  async getBalance(executorId: string): Promise<number> {
    const result = await pool.query(
      'SELECT balance FROM executor_profiles WHERE user_id = $1',
      [executorId]
    );

    if (result.rows.length === 0) {
      throw new AppError('EXECUTOR_NOT_FOUND', 'Executor profile not found', 404);
    }

    return result.rows[0].balance || 0;
  }

  /**
   * Get balance and transaction history
   */
  async getBalanceWithHistory(executorId: string, limit: number = 50) {
    const balanceResult = await pool.query(
      'SELECT balance FROM executor_profiles WHERE user_id = $1',
      [executorId]
    );

    if (balanceResult.rows.length === 0) {
      throw new AppError('EXECUTOR_NOT_FOUND', 'Executor profile not found', 404);
    }

    const transactionResult = await pool.query(
      `SELECT * FROM balance_transactions 
       WHERE executor_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [executorId, limit]
    );

    return {
      balance: balanceResult.rows[0].balance || 0,
      transactions: transactionResult.rows,
    };
  }

  /**
   * Add transaction and update balance
   */
  async addTransaction(transaction: BalanceTransaction): Promise<any> {
    // Get current balance
    const balanceResult = await pool.query(
      'SELECT balance FROM executor_profiles WHERE user_id = $1 FOR UPDATE',
      [transaction.executor_id]
    );

    if (balanceResult.rows.length === 0) {
      throw new AppError('EXECUTOR_NOT_FOUND', 'Executor profile not found', 404);
    }

    const currentBalance = balanceResult.rows[0].balance || 0;
    const newBalance = currentBalance + transaction.amount;

    // Insert transaction record
    const txResult = await pool.query(
      `INSERT INTO balance_transactions (
        executor_id, type, amount, balance_before, balance_after,
        order_id, payment_id, withdrawal_id, description, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *`,
      [
        transaction.executor_id,
        transaction.type,
        transaction.amount,
        currentBalance,
        newBalance,
        transaction.order_id || null,
        transaction.payment_id || null,
        transaction.withdrawal_id || null,
        transaction.description,
      ]
    );

    // Update executor balance
    await pool.query(
      'UPDATE executor_profiles SET balance = $1 WHERE user_id = $2',
      [newBalance, transaction.executor_id]
    );

    return txResult.rows[0];
  }

  /**
   * Deduct commission when driver accepts order
   * 20% goes to company, 80% is earnable by driver
   */
  async deductCommission(executorId: string, orderId: string, orderPrice: number): Promise<any> {
    const commissionAmount = Math.round(orderPrice * 0.20 * 100) / 100; // 20%

    return this.addTransaction({
      executor_id: executorId,
      type: 'commission_fee',
      amount: -commissionAmount,
      order_id: orderId,
      description: `Комиссия 20% за заказ (цена: ${orderPrice}₽)`,
    });
  }

  /**
   * Credit earnings when payment is received
   * Driver gets 80% of the order price
   */
  async creditEarnings(
    executorId: string,
    orderId: string,
    paymentId: string,
    orderPrice: number
  ): Promise<any> {
    const earnings = Math.round(orderPrice * 0.80 * 100) / 100; // 80%

    return this.addTransaction({
      executor_id: executorId,
      type: 'order_earning',
      amount: earnings,
      order_id: orderId,
      payment_id: paymentId,
      description: `Заработок 80% за выполненный заказ (доход: ${earnings}₽)`,
    });
  }

  /**
   * Refund commission if order is cancelled before completion
   */
  async refundCommission(
    executorId: string,
    orderId: string,
    orderPrice: number
  ): Promise<any> {
    const commissionAmount = Math.round(orderPrice * 0.20 * 100) / 100; // 20%

    return this.addTransaction({
      executor_id: executorId,
      type: 'commission_refund',
      amount: commissionAmount,
      order_id: orderId,
      description: `Возврат комиссии за отменённый заказ (+${commissionAmount}₽)`,
    });
  }

  /**
   * Record withdrawal request
   */
  async recordWithdrawal(
    executorId: string,
    withdrawalId: string,
    amount: number
  ): Promise<any> {
    // Check if balance is sufficient
    const balance = await this.getBalance(executorId);
    if (balance < amount) {
      throw new AppError(
        'INSUFFICIENT_BALANCE',
        `Недостаточно средств. Баланс: ${balance}₽, запрос: ${amount}₽`,
        400
      );
    }

    return this.addTransaction({
      executor_id: executorId,
      type: 'withdrawal',
      amount: -amount,
      withdrawal_id: withdrawalId,
      description: `Вывод средств (-${amount}₽)`,
    });
  }

  /**
   * Record deposit (admin operation)
   */
  async recordDeposit(
    executorId: string,
    amount: number,
    description: string
  ): Promise<any> {
    return this.addTransaction({
      executor_id: executorId,
      type: 'deposit',
      amount,
      description: `Пополнение депозита: ${description}`,
    });
  }

  /**
   * Handle payment refund
   */
  async refundPayment(
    executorId: string,
    paymentId: string,
    orderPrice: number
  ): Promise<any> {
    // Refund only the earned portion (80%), not the commission
    const refundAmount = Math.round(orderPrice * 0.80 * 100) / 100;

    return this.addTransaction({
      executor_id: executorId,
      type: 'refund',
      amount: -refundAmount,
      payment_id: paymentId,
      description: `Возврат платежа (-${refundAmount}₽)`,
    });
  }
}

export default new BalanceService();
