import nodemailer from 'nodemailer';
import logger from '../utils/logger';

class EmailService {
  private transporter: nodemailer.Transporter | null;
  private fromAddress: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    this.fromAddress = process.env.SMTP_FROM_EMAIL || user || 'no-reply@septic-service.local';

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user,
          pass,
        },
      });
    } else {
      this.transporter = null;
    }
  }

  async sendLoginCode(email: string, code: string, role?: string): Promise<{ sent: boolean; debugCode?: string }> {
    if (!this.transporter) {
      logger.warn('SMTP is not configured. Login code was not sent by email.', {
        email,
        role,
        code,
      });

      return {
        sent: false,
        debugCode: code,
      };
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: email,
        subject: 'Код входа в Септик Сервис',
        text: `Ваш код входа: ${code}. Он действует 10 минут.`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
            <h2>Код входа</h2>
            <p>Ваш код подтверждения:</p>
            <div style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 16px 0;">${code}</div>
            <p>Код действует 10 минут.</p>
            ${role ? `<p>Роль: ${role}</p>` : ''}
          </div>
        `,
      });

      logger.info('Login code sent via email', { email, role });
      return { sent: true };
    } catch (error: any) {
      logger.error('Failed to send login code via email', {
        email,
        error: error.message,
      });

      // Fallback: return code for development/testing
      return {
        sent: false,
        debugCode: code,
      };
    }
  }
}

export default new EmailService();