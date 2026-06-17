import nodemailer from 'nodemailer';
import dns from 'dns';
import logger from '../utils/logger';

/**
 * Resolve a hostname to its real IP using Google DNS (8.8.8.8).
 * Bypasses local fake-IP DNS (e.g. Clash proxy in fake-IP mode).
 */
function resolveRealIP(hostname: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const resolver = new dns.Resolver();
    resolver.setServers(['8.8.8.8', '1.1.1.1']);
    resolver.resolve(hostname, (err, addresses) => {
      if (err || !addresses?.length) {
        reject(err || new Error(`No addresses for ${hostname}`));
      } else {
        resolve(addresses[0]);
      }
    });
  });
}

class EmailService {
  private smtpHost: string | undefined;
  private smtpUser: string | undefined;
  private smtpPass: string | undefined;
  private smtpPort: number;
  private smtpSecure: boolean;
  private fromAddress: string;

  constructor() {
    this.smtpHost = process.env.SMTP_HOST;
    this.smtpUser = process.env.SMTP_USER;
    this.smtpPass = process.env.SMTP_PASS;
    this.smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    this.smtpSecure = process.env.SMTP_SECURE === 'true';
    this.fromAddress = process.env.SMTP_FROM_EMAIL || this.smtpUser || 'no-reply@septic-service.local';

    // transporter is created lazily in getTransporter() with real IP resolution
  }

  private async getTransporter(): Promise<nodemailer.Transporter | null> {
    if (!this.smtpHost || !this.smtpUser || !this.smtpPass) return null;

    // Resolve real IP to bypass fake-IP proxies (Clash etc.)
    let host = this.smtpHost;
    try {
      host = await resolveRealIP(this.smtpHost);
      logger.info(`SMTP: resolved ${this.smtpHost} → ${host}`);
    } catch {
      logger.warn(`SMTP: failed to resolve ${this.smtpHost} via Google DNS, using hostname`);
    }

    return nodemailer.createTransport({
      host,
      port: this.smtpPort,
      secure: this.smtpSecure,
      auth: { user: this.smtpUser, pass: this.smtpPass },
      tls: { servername: this.smtpHost },
      connectionTimeout: 10000,
      socketTimeout: 10000,
    });
  }

  async sendLoginCode(email: string, code: string, role?: string): Promise<{ sent: boolean; debugCode?: string }> {
    const transporter = await this.getTransporter();

    if (!transporter) {
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
      // Wrap sendMail with a timeout promise
      const sendPromise = transporter.sendMail({
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

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Email send timeout (10s)')), 10000)
      );

      await Promise.race([sendPromise, timeoutPromise]);

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