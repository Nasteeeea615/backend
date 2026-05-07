import pool from '../config/database';
import logger from '../utils/logger';
import {
  isValidExpoPushToken,
  processNotificationReceipts,
  sendBatchPushNotifications,
} from './expoPushNotifications';

export interface NotificationPayload {
  userId: string;
  type: 'order_accepted' | 'order_completed' | 'payment_success' | 'new_order' | 'ticket_reply';
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface FCMTokenData {
  userId: string;
  token: string;
  deviceType: 'ios' | 'android';
  deviceId?: string;
}

class NotificationService {
  /**
  * Save push token for a user
   */
  async saveFCMToken(tokenData: FCMTokenData): Promise<void> {
    const { userId, token, deviceType, deviceId } = tokenData;

    try {
      // Deactivate old tokens for this device if deviceId is provided
      if (deviceId) {
        await pool.query(
          `UPDATE fcm_tokens 
           SET is_active = FALSE 
           WHERE user_id = $1 AND device_id = $2 AND token != $3`,
          [userId, deviceId, token]
        );
      }

      // Insert or update the token
      await pool.query(
        `INSERT INTO fcm_tokens (user_id, token, device_type, device_id, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (user_id, token) 
         DO UPDATE SET 
           is_active = TRUE,
           device_type = EXCLUDED.device_type,
           device_id = EXCLUDED.device_id,
           updated_at = NOW()`,
        [userId, token, deviceType, deviceId]
      );

      console.log(`Push token saved for user ${userId}`);
    } catch (error) {
      console.error('Error saving push token:', error);
      throw error;
    }
  }

  /**
   * Remove push token
   */
  async removeFCMToken(userId: string, token: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE fcm_tokens 
         SET is_active = FALSE 
         WHERE user_id = $1 AND token = $2`,
        [userId, token]
      );

      console.log(`Push token removed for user ${userId}`);
    } catch (error) {
      console.error('Error removing push token:', error);
      throw error;
    }
  }

  /**
   * Get active push tokens for a user
   */
  async getUserTokens(userId: string): Promise<string[]> {
    try {
      const result = await pool.query(
        `SELECT token FROM fcm_tokens 
         WHERE user_id = $1 AND is_active = TRUE`,
        [userId]
      );

      return result.rows.map((row: any) => row.token);
    } catch (error) {
      console.error('Error getting user tokens:', error);
      return [];
    }
  }

  /**
   * Save notification to database
   */
  async saveNotification(payload: NotificationPayload): Promise<string> {
    const { userId, type, title, body, data } = payload;

    try {
      const result = await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [userId, type, title, body, data ? JSON.stringify(data) : null]
      );

      return result.rows[0].id;
    } catch (error) {
      console.error('Error saving notification:', error);
      throw error;
    }
  }

  /**
   * Send push notification to a user
   */
  async sendPushNotification(payload: NotificationPayload): Promise<void> {
    const { userId, title, body, data } = payload;

    try {
      // Save notification to database (always save, even if push fails)
      const notificationId = await this.saveNotification(payload);

      // Get user's Expo push tokens
      const tokens = (await this.getUserTokens(userId)).filter(isValidExpoPushToken);

      if (tokens.length === 0) {
        logger.debug(`No active Expo push tokens found for user ${userId}`);
        return;
      }

      // Send notifications via official Expo Push API
      const tickets = await sendBatchPushNotifications(
        tokens.map(token => ({
          to: token,
          title,
          body,
          data: {
            ...data,
            notificationId,
            type: payload.type,
          },
          sound: 'default',
          priority: 'high',
        }))
      );

      const ticketIds = tickets
        .filter(ticket => ticket.status === 'ok' && ticket.id)
        .map(ticket => ticket.id as string);

      if (ticketIds.length > 0) {
        const receipts = await processNotificationReceipts(ticketIds);

        if (receipts.invalidTokens.length > 0) {
          logger.warn('Removing invalid Expo push tokens', {
            userId,
            count: receipts.invalidTokens.length,
          });

          for (const token of receipts.invalidTokens) {
            await this.removeFCMToken(userId, token);
          }
        }
      }

      logger.info(`Push notification sent to user ${userId}`, {
        type: payload.type,
        tokenCount: tokens.length,
      });
    } catch (error: any) {
      logger.error('Error sending push notification:', {
        error: error.message,
        userId,
        type: payload.type,
      });
      // Don't throw - we don't want to break the flow if push fails
    }
  }

  /**
   * Send notification when order is accepted by executor
   */
  async notifyOrderAccepted(clientId: string, orderId: string, executorName: string): Promise<void> {
    await this.sendPushNotification({
      userId: clientId,
      type: 'order_accepted',
      title: 'Заказ принят',
      body: `Исполнитель ${executorName} принял ваш заказ`,
      data: {
        orderId,
        screen: 'OrderDetails',
      },
    });
  }

  /**
   * Send notification when order is completed
   */
  async notifyOrderCompleted(clientId: string, orderId: string, amount: number): Promise<void> {
    await this.sendPushNotification({
      userId: clientId,
      type: 'order_completed',
      title: 'Заказ выполнен',
      body: `Ваш заказ выполнен. Сумма к оплате: ${amount}₽`,
      data: {
        orderId,
        amount: amount.toString(),
        screen: 'Payment',
      },
    });
  }

  /**
   * Send notification when payment is successful
   */
  async notifyPaymentSuccess(userId: string, orderId: string, amount: number): Promise<void> {
    await this.sendPushNotification({
      userId,
      type: 'payment_success',
      title: 'Оплата прошла успешно',
      body: `Платеж на сумму ${amount}₽ успешно обработан`,
      data: {
        orderId,
        amount: amount.toString(),
        screen: 'OrderDetails',
      },
    });
  }

  /**
   * Send notification to executor about new available order
   */
  async notifyNewOrder(executorId: string, orderId: string, address: string, capacity: number): Promise<void> {
    await this.sendPushNotification({
      userId: executorId,
      type: 'new_order',
      title: 'Новый заказ',
      body: `Доступен новый заказ: ${address}, ${capacity}м³`,
      data: {
        orderId,
        screen: 'ExecutorHome',
      },
    });
  }

  /**
   * Send notification about support ticket reply
   */
  async notifyTicketReply(userId: string, ticketId: string, subject: string): Promise<void> {
    await this.sendPushNotification({
      userId,
      type: 'ticket_reply',
      title: 'Ответ от поддержки',
      body: `Получен ответ на ваше обращение: ${subject}`,
      data: {
        ticketId,
        screen: 'Support',
      },
    });
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId: string, limit: number = 50): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT id, type, title, body, data, is_read, created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('Error getting user notifications:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE notifications
         SET is_read = TRUE
         WHERE id = $1 AND user_id = $2`,
        [notificationId, userId]
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE notifications
         SET is_read = TRUE
         WHERE user_id = $1 AND is_read = FALSE`,
        [userId]
      );
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Check if Firebase is initialized and ready
   */
  isFirebaseInitialized(): boolean {
    return firebaseInitialized;
  }

  /**
   * Get Firebase initialization status for health checks
   */
  getStatus(): { initialized: boolean; message: string } {
    if (firebaseInitialized) {
      return {
        initialized: true,
        message: 'Firebase Admin SDK is initialized and ready',
      };
    }
    return {
      initialized: false,
      message: 'Firebase Admin SDK is not initialized. Push notifications will not work.',
    };
  }
}

export default new NotificationService();
