import axios from 'axios';

interface SMSResponse {
  success: boolean;
  message?: string;
}

class SMSService {
  private apiKey: string;
  private apiUrl: string;

  constructor() {
    this.apiKey = process.env.SMS_GATEWAY_API_KEY || '';
    this.apiUrl = process.env.SMS_GATEWAY_URL || 'https://api.sms.ru/sms/send';
  }

  /**
   * Generate a random 4-digit SMS code
   */
  generateCode(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Send SMS code to phone number
   */
  async sendSMS(phoneNumber: string, code: string): Promise<SMSResponse> {
    try {
      // In development mode, just log the code
      if (process.env.NODE_ENV === 'development') {
        console.log(`📱 SMS Code for ${phoneNumber}: ${code}`);
        return { success: true, message: 'SMS sent (dev mode)' };
      }

      // Production: Send actual SMS via SMS.ru or other gateway
      const response = await axios.post(this.apiUrl, {
        api_id: this.apiKey,
        to: phoneNumber,
        msg: `Ваш код подтверждения: ${code}`,
        json: 1,
      });

      if (response.data.status === 'OK') {
        return { success: true, message: 'SMS sent successfully' };
      } else {
        return { success: false, message: response.data.status_text };
      }
    } catch (error) {
      console.error('SMS sending error:', error);
      return { success: false, message: 'Failed to send SMS' };
    }
  }

  /**
   * Store SMS code in Redis with expiration (5 minutes)
   */
  async storeCode(phoneNumber: string, code: string): Promise<void> {
    // TODO: Implement Redis storage
    // For now, we'll use in-memory storage (not production-ready)
    const key = `sms:${phoneNumber}`;
    (global as any).smsCodeStorage = (global as any).smsCodeStorage || {};
    (global as any).smsCodeStorage[key] = {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };
  }

  /**
   * Verify SMS code
   */
  async verifyCode(phoneNumber: string, code: string): Promise<boolean> {
    // TODO: Implement Redis verification
    const key = `sms:${phoneNumber}`;
    const storage = (global as any).smsCodeStorage || {};
    const stored = storage[key];

    if (!stored) {
      return false;
    }

    if (Date.now() > stored.expiresAt) {
      delete storage[key];
      return false;
    }

    if (stored.code !== code) {
      return false;
    }

    // Code is valid, delete it
    delete storage[key];
    return true;
  }
}

export default new SMSService();
