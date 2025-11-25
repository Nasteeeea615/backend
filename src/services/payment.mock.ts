/**
 * Mock Payment Service для разработки и тестирования
 * Имитирует работу платежного шлюза без реальных транзакций
 */

interface PaymentResult {
  id: string;
  status: 'pending' | 'succeeded' | 'failed';
  amount: number;
  currency: string;
  created_at: string;
  confirmation_url?: string;
}

interface RefundResult {
  id: string;
  status: 'succeeded' | 'failed';
  amount: number;
  created_at: string;
}

export class MockPaymentService {
  /**
   * Создание платежа (mock)
   * @param orderId - ID заказа
   * @param amount - сумма платежа
   * @param clientId - ID клиента
   */
  async createPayment(
    orderId: string,
    amount: number,
    clientId: string
  ): Promise<PaymentResult> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💳 MOCK PAYMENT SERVICE - Создание платежа');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 Заказ: ${orderId}`);
    console.log(`💰 Сумма: ${amount}₽`);
    console.log(`👤 Клиент: ${clientId}`);
    
    // Имитируем обработку платежа
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const mockTransaction: PaymentResult = {
      id: `mock_txn_${Date.now()}`,
      status: 'succeeded',
      amount: amount,
      currency: 'RUB',
      created_at: new Date().toISOString(),
    };
    
    console.log(`\n✅ Платеж успешно обработан (MOCK)`);
    console.log(`🔑 Transaction ID: ${mockTransaction.id}`);
    console.log(`📊 Статус: ${mockTransaction.status}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return mockTransaction;
  }

  /**
   * Проверка статуса платежа (mock)
   * @param transactionId - ID транзакции
   */
  async checkPaymentStatus(transactionId: string): Promise<string> {
    console.log(`\n💳 Проверка статуса платежа: ${transactionId}`);
    
    // В mock всегда возвращаем успешный статус
    const status = 'succeeded';
    
    console.log(`✅ Статус: ${status}\n`);
    
    return status;
  }

  /**
   * Возврат платежа (mock)
   * @param transactionId - ID транзакции
   * @param amount - сумма возврата
   */
  async refundPayment(
    transactionId: string,
    amount: number
  ): Promise<RefundResult> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💸 MOCK PAYMENT SERVICE - Возврат платежа');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔑 Transaction: ${transactionId}`);
    console.log(`💰 Сумма возврата: ${amount}₽`);
    
    // Имитируем обработку возврата
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const mockRefund: RefundResult = {
      id: `mock_refund_${Date.now()}`,
      status: 'succeeded',
      amount: amount,
      created_at: new Date().toISOString(),
    };
    
    console.log(`\n✅ Возврат успешно обработан (MOCK)`);
    console.log(`🔑 Refund ID: ${mockRefund.id}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return mockRefund;
  }

  /**
   * Получение информации о платеже (mock)
   * @param transactionId - ID транзакции
   */
  async getPaymentInfo(transactionId: string): Promise<PaymentResult> {
    console.log(`\n💳 Получение информации о платеже: ${transactionId}\n`);
    
    return {
      id: transactionId,
      status: 'succeeded',
      amount: 0,
      currency: 'RUB',
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Создание платежа с сохраненной картой (mock)
   * @param orderId - ID заказа
   * @param amount - сумма платежа
   * @param clientId - ID клиента
   * @param savedCardId - ID сохраненной карты
   */
  async createPaymentWithSavedCard(
    orderId: string,
    amount: number,
    clientId: string,
    savedCardId: string
  ): Promise<PaymentResult> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💳 MOCK PAYMENT - Оплата сохраненной картой');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 Заказ: ${orderId}`);
    console.log(`💰 Сумма: ${amount}₽`);
    console.log(`👤 Клиент: ${clientId}`);
    console.log(`💳 Карта: **** **** **** ${savedCardId.slice(-4)}`);
    
    // Имитируем обработку
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const mockTransaction: PaymentResult = {
      id: `mock_txn_saved_${Date.now()}`,
      status: 'succeeded',
      amount: amount,
      currency: 'RUB',
      created_at: new Date().toISOString(),
    };
    
    console.log(`\n✅ Платеж успешно обработан (MOCK)`);
    console.log(`🔑 Transaction ID: ${mockTransaction.id}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return mockTransaction;
  }
}

export default new MockPaymentService();
