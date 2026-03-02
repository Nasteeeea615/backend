import axios from 'axios';

/**
 * Expo Push Notification Service
 * Отправка Push-уведомлений через Expo Push API
 */

interface ExpoPushMessage {
  to: string | string[];
  title?: string;
  body?: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  categoryId?: string;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: any;
}

interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: any;
}

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPT_URL = 'https://exp.host/--/api/v2/push/getReceipts';

/**
 * Проверка валидности Expo Push Token
 */
export function isValidExpoPushToken(token: string): boolean {
  return (
    token.startsWith('ExponentPushToken[') ||
    token.startsWith('ExpoPushToken[') ||
    token.startsWith('F5FZT')
  );
}

/**
 * Отправка одного Push-уведомления
 */
export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<ExpoPushTicket> {
  if (!isValidExpoPushToken(token)) {
    throw new Error('Invalid Expo Push Token');
  }

  const message: ExpoPushMessage = {
    to: token,
    title,
    body,
    data,
    sound: 'default',
    priority: 'high',
  };

  try {
    const response = await axios.post<{ data: ExpoPushTicket[] }>(
      EXPO_PUSH_API_URL,
      message,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.data[0];
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
}

/**
 * Отправка нескольких Push-уведомлений (batch)
 * Expo рекомендует отправлять до 100 уведомлений за раз
 */
export async function sendBatchPushNotifications(
  messages: ExpoPushMessage[]
): Promise<ExpoPushTicket[]> {
  // Разбиваем на батчи по 100 сообщений
  const chunks: ExpoPushMessage[][] = [];
  const chunkSize = 100;

  for (let i = 0; i < messages.length; i += chunkSize) {
    chunks.push(messages.slice(i, i + chunkSize));
  }

  const allTickets: ExpoPushTicket[] = [];

  for (const chunk of chunks) {
    try {
      const response = await axios.post<{ data: ExpoPushTicket[] }>(
        EXPO_PUSH_API_URL,
        chunk,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      allTickets.push(...response.data.data);
    } catch (error) {
      console.error('Error sending batch push notifications:', error);
      // Продолжаем отправку остальных батчей
    }
  }

  return allTickets;
}

/**
 * Получение статуса доставки уведомлений
 */
export async function getPushNotificationReceipts(
  ticketIds: string[]
): Promise<Record<string, ExpoPushReceipt>> {
  try {
    const response = await axios.post<{ data: Record<string, ExpoPushReceipt> }>(
      EXPO_PUSH_RECEIPT_URL,
      { ids: ticketIds },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.data;
  } catch (error) {
    console.error('Error getting push notification receipts:', error);
    throw error;
  }
}

/**
 * Отправка уведомления о новом заказе
 */
export async function sendNewOrderNotification(
  token: string,
  orderId: string,
  orderNumber: string
): Promise<ExpoPushTicket> {
  return sendPushNotification(
    token,
    'Новый заказ',
    `Заказ #${orderNumber} создан и ожидает подтверждения`,
    {
      type: 'new_order',
      orderId,
      orderNumber,
      screen: 'OrderDetails',
    }
  );
}

/**
 * Отправка уведомления о подтверждении заказа
 */
export async function sendOrderConfirmedNotification(
  token: string,
  orderId: string,
  orderNumber: string,
  scheduledDate: string
): Promise<ExpoPushTicket> {
  return sendPushNotification(
    token,
    'Заказ подтвержден',
    `Заказ #${orderNumber} подтвержден. Дата выполнения: ${scheduledDate}`,
    {
      type: 'order_confirmed',
      orderId,
      orderNumber,
      scheduledDate,
      screen: 'OrderDetails',
    }
  );
}

/**
 * Отправка уведомления о том, что водитель в пути
 */
export async function sendDriverEnRouteNotification(
  token: string,
  orderId: string,
  orderNumber: string,
  driverName: string
): Promise<ExpoPushTicket> {
  return sendPushNotification(
    token,
    'Водитель в пути',
    `${driverName} выехал к вам. Заказ #${orderNumber}`,
    {
      type: 'driver_en_route',
      orderId,
      orderNumber,
      driverName,
      screen: 'OrderTracking',
    }
  );
}

/**
 * Отправка уведомления о завершении заказа
 */
export async function sendOrderCompletedNotification(
  token: string,
  orderId: string,
  orderNumber: string
): Promise<ExpoPushTicket> {
  return sendPushNotification(
    token,
    'Заказ выполнен',
    `Заказ #${orderNumber} успешно выполнен. Спасибо за использование нашего сервиса!`,
    {
      type: 'order_completed',
      orderId,
      orderNumber,
      screen: 'OrderDetails',
    }
  );
}

/**
 * Отправка уведомления с просьбой оставить отзыв
 */
export async function sendReviewRequestNotification(
  token: string,
  orderId: string,
  orderNumber: string
): Promise<ExpoPushTicket> {
  return sendPushNotification(
    token,
    'Оцените наш сервис',
    `Как вам обслуживание по заказу #${orderNumber}? Оставьте отзыв!`,
    {
      type: 'review_request',
      orderId,
      orderNumber,
      screen: 'ReviewForm',
    }
  );
}

/**
 * Отправка уведомления об отмене заказа
 */
export async function sendOrderCancelledNotification(
  token: string,
  orderId: string,
  orderNumber: string,
  reason?: string
): Promise<ExpoPushTicket> {
  const body = reason
    ? `Заказ #${orderNumber} отменен. Причина: ${reason}`
    : `Заказ #${orderNumber} отменен`;

  return sendPushNotification(
    token,
    'Заказ отменен',
    body,
    {
      type: 'order_cancelled',
      orderId,
      orderNumber,
      reason,
      screen: 'OrderDetails',
    }
  );
}

/**
 * Отправка уведомления о платеже
 */
export async function sendPaymentNotification(
  token: string,
  orderId: string,
  orderNumber: string,
  amount: number,
  status: 'succeeded' | 'failed'
): Promise<ExpoPushTicket> {
  const title = status === 'succeeded' ? 'Оплата прошла успешно' : 'Ошибка оплаты';
  const body = status === 'succeeded'
    ? `Оплата ${amount} ₽ по заказу #${orderNumber} прошла успешно`
    : `Не удалось провести оплату по заказу #${orderNumber}. Попробуйте еще раз`;

  return sendPushNotification(
    token,
    title,
    body,
    {
      type: 'payment',
      orderId,
      orderNumber,
      amount,
      status,
      screen: 'OrderDetails',
    }
  );
}

/**
 * Отправка промо-уведомления
 */
export async function sendPromoNotification(
  token: string,
  title: string,
  body: string,
  promoCode?: string
): Promise<ExpoPushTicket> {
  return sendPushNotification(
    token,
    title,
    body,
    {
      type: 'promo',
      promoCode,
      screen: 'Promotions',
    }
  );
}

/**
 * Массовая отправка уведомлений всем пользователям
 */
export async function sendBroadcastNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<ExpoPushTicket[]> {
  const validTokens = tokens.filter(isValidExpoPushToken);

  const messages: ExpoPushMessage[] = validTokens.map(token => ({
    to: token,
    title,
    body,
    data,
    sound: 'default',
    priority: 'normal',
  }));

  return sendBatchPushNotifications(messages);
}

/**
 * Обработка ошибок доставки уведомлений
 * Вызывайте эту функцию периодически (например, раз в час)
 */
export async function processNotificationReceipts(
  ticketIds: string[]
): Promise<{
  successful: string[];
  failed: string[];
  invalidTokens: string[];
}> {
  const receipts = await getPushNotificationReceipts(ticketIds);

  const successful: string[] = [];
  const failed: string[] = [];
  const invalidTokens: string[] = [];

  for (const [ticketId, receipt] of Object.entries(receipts)) {
    if (receipt.status === 'ok') {
      successful.push(ticketId);
    } else {
      failed.push(ticketId);

      // Если токен невалиден, нужно удалить его из БД
      if (
        receipt.details?.error === 'DeviceNotRegistered' ||
        receipt.details?.error === 'InvalidCredentials'
      ) {
        invalidTokens.push(ticketId);
      }
    }
  }

  return { successful, failed, invalidTokens };
}
