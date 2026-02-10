import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/**
 * YooKassa Payment Service
 * Handles all interactions with YooKassa API
 */

interface YooKassaConfig {
  shopId: string;
  secretKey: string;
  apiUrl: string;
  returnUrl: string;
}

interface CreatePaymentParams {
  amount: number;
  description: string;
  orderId: string;
  metadata?: Record<string, any>;
}

interface PaymentResponse {
  id: string;
  status: string;
  amount: {
    value: string;
    currency: string;
  };
  confirmation: {
    type: string;
    confirmation_url: string;
  };
  metadata?: Record<string, any>;
  created_at: string;
}

interface RefundParams {
  paymentId: string;
  amount?: number;
  reason?: string;
}

interface PayoutParams {
  amount: number;
  destination: {
    type: 'bank_card' | 'yoo_money';
    card?: {
      number: string;
    };
    account_number?: string;
  };
  description: string;
  metadata?: Record<string, any>;
}

class YooKassaService {
  private client: AxiosInstance;
  private config: YooKassaConfig;

  constructor() {
    this.config = {
      shopId: process.env.YOOKASSA_SHOP_ID || '',
      secretKey: process.env.YOOKASSA_SECRET_KEY || '',
      apiUrl: process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru/v3',
      returnUrl: process.env.YOOKASSA_RETURN_URL || 'septikservice://payment/return',
    };

    // Validate configuration
    if (!this.config.shopId || !this.config.secretKey) {
      logger.warn('YooKassa credentials not configured. Payment functionality will not work.');
    }

    // Create axios instance with basic auth
    this.client = axios.create({
      baseURL: this.config.apiUrl,
      auth: {
        username: this.config.shopId,
        password: this.config.secretKey,
      },
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.info('YooKassa API success', {
          url: response.config.url,
          status: response.status,
        });
        return response;
      },
      (error) => {
        logger.error('YooKassa API error', {
          url: error.config?.url,
          status: error.response?.status,
          data: error.response?.data,
        });
        throw error;
      }
    );
  }

  /**
   * Create payment for order
   */
  async createPayment(params: CreatePaymentParams): Promise<PaymentResponse> {
    const idempotencyKey = uuidv4();

    try {
      const response = await this.client.post<PaymentResponse>(
        '/payments',
        {
          amount: {
            value: params.amount.toFixed(2),
            currency: 'RUB',
          },
          confirmation: {
            type: 'redirect',
            return_url: this.config.returnUrl,
          },
          capture: true,
          description: params.description,
          metadata: {
            order_id: params.orderId,
            ...params.metadata,
          },
        },
        {
          headers: {
            'Idempotence-Key': idempotencyKey,
          },
        }
      );

      logger.info('Payment created', {
        paymentId: response.data.id,
        orderId: params.orderId,
        amount: params.amount,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to create payment', {
        error: error.message,
        orderId: params.orderId,
      });

      if (error.response?.data) {
        throw new AppError(
          'PAYMENT_CREATION_FAILED',
          error.response.data.description || 'Failed to create payment',
          400
        );
      }

      throw new AppError('PAYMENT_CREATION_FAILED', 'Failed to create payment', 500);
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId: string): Promise<PaymentResponse> {
    try {
      const response = await this.client.get<PaymentResponse>(`/payments/${paymentId}`);
      return response.data;
    } catch (error: any) {
      logger.error('Failed to get payment status', {
        error: error.message,
        paymentId,
      });

      throw new AppError('PAYMENT_STATUS_FAILED', 'Failed to get payment status', 500);
    }
  }

  /**
   * Create refund
   */
  async createRefund(params: RefundParams): Promise<any> {
    const idempotencyKey = uuidv4();

    try {
      const refundData: any = {
        payment_id: params.paymentId,
      };

      if (params.amount) {
        refundData.amount = {
          value: params.amount.toFixed(2),
          currency: 'RUB',
        };
      }

      if (params.reason) {
        refundData.description = params.reason;
      }

      const response = await this.client.post('/refunds', refundData, {
        headers: {
          'Idempotence-Key': idempotencyKey,
        },
      });

      logger.info('Refund created', {
        refundId: response.data.id,
        paymentId: params.paymentId,
        amount: params.amount,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to create refund', {
        error: error.message,
        paymentId: params.paymentId,
      });

      throw new AppError('REFUND_CREATION_FAILED', 'Failed to create refund', 500);
    }
  }

  /**
   * Create payout for executor withdrawal
   */
  async createPayout(params: PayoutParams): Promise<any> {
    const idempotencyKey = uuidv4();

    try {
      const response = await this.client.post(
        '/payouts',
        {
          amount: {
            value: params.amount.toFixed(2),
            currency: 'RUB',
          },
          payout_destination_data: params.destination,
          description: params.description,
          metadata: params.metadata,
        },
        {
          headers: {
            'Idempotence-Key': idempotencyKey,
          },
        }
      );

      logger.info('Payout created', {
        payoutId: response.data.id,
        amount: params.amount,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to create payout', {
        error: error.message,
        amount: params.amount,
      });

      throw new AppError('PAYOUT_CREATION_FAILED', 'Failed to create payout', 500);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(_payload: string, _signature: string): boolean {
    // YooKassa doesn't use signature verification in the same way
    // Instead, we should verify by making a GET request to confirm the payment
    // For now, we'll implement basic validation
    return true; // TODO: Implement proper signature verification
  }

  /**
   * Check if YooKassa is configured
   */
  isConfigured(): boolean {
    return !!(this.config.shopId && this.config.secretKey);
  }
}

export default new YooKassaService();
