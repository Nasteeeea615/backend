// @ts-nocheck
/**
 * Примеры использования Push-уведомлений в контроллерах
 * 
 * Этот файл показывает, как интегрировать Push-уведомления
 * в различные части вашего приложения
 */

import {
  sendNewOrderNotification,
  sendOrderConfirmedNotification,
  sendDriverEnRouteNotification,
  sendOrderCompletedNotification,
  sendReviewRequestNotification,
  sendOrderCancelledNotification,
  sendPaymentNotification,
  sendPromoNotification,
  sendBroadcastNotification,
} from '../services/expoPushNotifications';

// ============================================
// ПРИМЕР 1: Создание нового заказа
// ============================================

async function handleNewOrder(userId: string, orderId: string, orderNumber: string) {
  try {
    // 1. Создаем заказ в БД
    // const order = await createOrder(...);

    // 2. Получаем Expo Push Token пользователя из БД
    const user = await getUserById(userId);
    
    if (user.expoPushToken) {
      // 3. Отправляем уведомление
      const ticket = await sendNewOrderNotification(
        user.expoPushToken,
        orderId,
        orderNumber
      );

      // 4. Сохраняем ticket ID для проверки доставки
      if (ticket.status === 'ok' && ticket.id) {
        await saveNotificationTicket(userId, ticket.id, 'new_order');
      }

      console.log('Push notification sent:', ticket);
    }
  } catch (error) {
    console.error('Error sending new order notification:', error);
    // Не прерываем выполнение, если уведомление не отправилось
  }
}

// ============================================
// ПРИМЕР 2: Подтверждение заказа администратором
// ============================================

async function handleOrderConfirmation(
  orderId: string,
  scheduledDate: string
) {
  try {
    // 1. Обновляем статус заказа
    // const order = await updateOrderStatus(orderId, 'confirmed');

    // 2. Получаем информацию о заказе и пользователе
    const order = await getOrderById(orderId);
    const user = await getUserById(order.userId);

    if (user.expoPushToken) {
      // 3. Отправляем уведомление
      await sendOrderConfirmedNotification(
        user.expoPushToken,
        orderId,
        order.orderNumber,
        scheduledDate
      );
    }
  } catch (error) {
    console.error('Error sending order confirmation notification:', error);
  }
}

// ============================================
// ПРИМЕР 3: Водитель выехал к клиенту
// ============================================

async function handleDriverEnRoute(
  orderId: string,
  driverId: string
) {
  try {
    // 1. Обновляем статус заказа
    // await updateOrderStatus(orderId, 'en_route');

    // 2. Получаем информацию
    const order = await getOrderById(orderId);
    const user = await getUserById(order.userId);
    const driver = await getDriverById(driverId);

    if (user.expoPushToken) {
      // 3. Отправляем уведомление
      await sendDriverEnRouteNotification(
        user.expoPushToken,
        orderId,
        order.orderNumber,
        driver.name
      );
    }
  } catch (error) {
    console.error('Error sending driver en route notification:', error);
  }
}

// ============================================
// ПРИМЕР 4: Заказ выполнен
// ============================================

async function handleOrderCompletion(orderId: string) {
  try {
    // 1. Обновляем статус заказа
    // await updateOrderStatus(orderId, 'completed');

    // 2. Получаем информацию
    const order = await getOrderById(orderId);
    const user = await getUserById(order.userId);

    if (user.expoPushToken) {
      // 3. Отправляем уведомление о завершении
      await sendOrderCompletedNotification(
        user.expoPushToken,
        orderId,
        order.orderNumber
      );

      // 4. Через 1 час отправляем просьбу оставить отзыв
      setTimeout(async () => {
        try {
          await sendReviewRequestNotification(
            user.expoPushToken!,
            orderId,
            order.orderNumber
          );
        } catch (error) {
          console.error('Error sending review request:', error);
        }
      }, 60 * 60 * 1000); // 1 час
    }
  } catch (error) {
    console.error('Error sending order completion notification:', error);
  }
}

// ============================================
// ПРИМЕР 5: Отмена заказа
// ============================================

async function handleOrderCancellation(
  orderId: string,
  reason?: string
) {
  try {
    // 1. Обновляем статус заказа
    // await updateOrderStatus(orderId, 'cancelled');

    // 2. Получаем информацию
    const order = await getOrderById(orderId);
    const user = await getUserById(order.userId);

    if (user.expoPushToken) {
      // 3. Отправляем уведомление
      await sendOrderCancelledNotification(
        user.expoPushToken,
        orderId,
        order.orderNumber,
        reason
      );
    }
  } catch (error) {
    console.error('Error sending order cancellation notification:', error);
  }
}

// ============================================
// ПРИМЕР 6: Обработка платежа
// ============================================

async function handlePaymentWebhook(
  orderId: string,
  amount: number,
  status: 'succeeded' | 'failed'
) {
  try {
    // 1. Обновляем статус платежа
    // await updatePaymentStatus(orderId, status);

    // 2. Получаем информацию
    const order = await getOrderById(orderId);
    const user = await getUserById(order.userId);

    if (user.expoPushToken) {
      // 3. Отправляем уведомление
      await sendPaymentNotification(
        user.expoPushToken,
        orderId,
        order.orderNumber,
        amount,
        status
      );
    }
  } catch (error) {
    console.error('Error sending payment notification:', error);
  }
}

// ============================================
// ПРИМЕР 7: Промо-акция
// ============================================

async function sendPromoToUser(
  userId: string,
  title: string,
  body: string,
  promoCode?: string
) {
  try {
    const user = await getUserById(userId);

    if (user.expoPushToken) {
      await sendPromoNotification(
        user.expoPushToken,
        title,
        body,
        promoCode
      );
    }
  } catch (error) {
    console.error('Error sending promo notification:', error);
  }
}

// ============================================
// ПРИМЕР 8: Массовая рассылка
// ============================================

async function sendBroadcastToAllUsers(
  title: string,
  body: string
) {
  try {
    // 1. Получаем всех пользователей с Push токенами
    const users = await getAllUsersWithPushTokens();
    const tokens = users.map(u => u.expoPushToken).filter(Boolean) as string[];

    // 2. Отправляем уведомления батчами
    const tickets = await sendBroadcastNotification(
      tokens,
      title,
      body,
      { type: 'broadcast' }
    );

    // 3. Сохраняем ticket IDs для проверки доставки
    const successfulTickets = tickets.filter(t => t.status === 'ok' && t.id);
    await saveNotificationTickets(successfulTickets);

    console.log(`Sent ${successfulTickets.length} notifications`);
  } catch (error) {
    console.error('Error sending broadcast notification:', error);
  }
}

// ============================================
// ПРИМЕР 9: Сохранение Expo Push Token
// ============================================

async function saveUserPushToken(
  userId: string,
  expoPushToken: string
) {
  try {
    // Обновляем токен в БД
    await updateUser(userId, { expoPushToken });

    console.log(`Push token saved for user ${userId}`);
  } catch (error) {
    console.error('Error saving push token:', error);
    throw error;
  }
}

// ============================================
// ПРИМЕР 10: Удаление невалидных токенов
// ============================================

async function cleanupInvalidTokens() {
  try {
    // 1. Получаем все ticket IDs за последние 24 часа
    const tickets = await getRecentNotificationTickets(24);

    // 2. Проверяем статус доставки
    const { invalidTokens } = await processNotificationReceipts(
      tickets.map(t => t.ticketId)
    );

    // 3. Удаляем невалидные токены из БД
    for (const ticketId of invalidTokens) {
      const ticket = tickets.find(t => t.ticketId === ticketId);
      if (ticket) {
        await removeUserPushToken(ticket.userId);
        console.log(`Removed invalid token for user ${ticket.userId}`);
      }
    }

    console.log(`Cleaned up ${invalidTokens.length} invalid tokens`);
  } catch (error) {
    console.error('Error cleaning up invalid tokens:', error);
  }
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (заглушки)
// Замените их на реальные функции из вашего кода
// ============================================

async function getUserById(_userId: string): Promise<any> {
  // Реализуйте получение пользователя из БД
  throw new Error('Not implemented');
}

async function getOrderById(_orderId: string): Promise<any> {
  // Реализуйте получение заказа из БД
  throw new Error('Not implemented');
}

async function getDriverById(_driverId: string): Promise<any> {
  // Реализуйте получение водителя из БД
  throw new Error('Not implemented');
}

async function saveNotificationTicket(
  userId: string,
  ticketId: string,
  type: string
): Promise<void> {
  // Реализуйте сохранение ticket в БД
  throw new Error('Not implemented');
}

async function saveNotificationTickets(tickets: any[]): Promise<void> {
  // Реализуйте сохранение tickets в БД
  throw new Error('Not implemented');
}

async function getAllUsersWithPushTokens(): Promise<any[]> {
  // Реализуйте получение пользователей с токенами
  throw new Error('Not implemented');
}

async function updateUser(_userId: string, _data: any): Promise<void> {
  // Реализуйте обновление пользователя
  throw new Error('Not implemented');
}

async function getRecentNotificationTickets(_hours: number): Promise<any[]> {
  // Реализуйте получение недавних tickets
  throw new Error('Not implemented');
}

async function removeUserPushToken(_userId: string): Promise<void> {
  // Реализуйте удаление токена пользователя
  throw new Error('Not implemented');
}

// ============================================
// ЭКСПОРТ
// ============================================

export {
  handleNewOrder,
  handleOrderConfirmation,
  handleDriverEnRoute,
  handleOrderCompletion,
  handleOrderCancellation,
  handlePaymentWebhook,
  sendPromoToUser,
  sendBroadcastToAllUsers,
  saveUserPushToken,
  cleanupInvalidTokens,
};
