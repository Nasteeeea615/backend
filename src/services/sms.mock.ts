/**
 * Mock SMS Service для разработки и тестирования
 * Выводит SMS-коды в консоль вместо реальной отправки
 */

export class MockSMSService {
  /**
   * Отправка SMS (mock)
   * @param phoneNumber - номер телефона
   * @param message - текст сообщения
   */
  async sendSMS(phoneNumber: string, message: string): Promise<boolean> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 MOCK SMS SERVICE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📞 Телефон: ${phoneNumber}`);
    console.log(`💬 Сообщение: ${message}`);
    
    // Извлекаем код из сообщения
    const code = message.match(/\d{4,6}/)?.[0];
    if (code) {
      console.log(`\n✅ КОД ДЛЯ ВХОДА: ${code}`);
      console.log(`\n💡 Скопируйте этот код и введите в приложении`);
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Имитируем небольшую задержку
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return true;
  }

  /**
   * Отправка кода верификации
   * @param phoneNumber - номер телефона
   * @param code - код верификации
   */
  async sendVerificationCode(phoneNumber: string, code: string): Promise<boolean> {
    const message = `Ваш код подтверждения: ${code}. Никому не сообщайте этот код.`;
    return this.sendSMS(phoneNumber, message);
  }

  /**
   * Отправка уведомления о заказе
   * @param phoneNumber - номер телефона
   * @param orderId - ID заказа
   */
  async sendOrderNotification(phoneNumber: string, orderId: string): Promise<boolean> {
    const message = `Новый заказ #${orderId}. Проверьте приложение.`;
    return this.sendSMS(phoneNumber, message);
  }
}

export default new MockSMSService();
