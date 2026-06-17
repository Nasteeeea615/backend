import nodemailer from 'nodemailer';
import dns from 'dns';
import axios from 'axios';
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
  private resendApiKey: string | undefined;
  private resendFrom: string;
  private smtpHost: string | undefined;
  private smtpUser: string | undefined;
  private smtpPass: string | undefined;
  private smtpPort: number;
  private smtpSecure: boolean;
  private fromAddress: string;

  constructor() {
    // Resend HTTP API (preferred on hosts like Render that block outbound SMTP).
    this.resendApiKey = process.env.RESEND_API_KEY;
    // For Resend the sender must be on a verified domain or the shared
    // onboarding domain. onboarding@resend.dev only delivers to the account
    // owner's email until a domain is verified.
    this.resendFrom = process.env.EMAIL_FROM || 'Septik Service <onboarding@resend.dev>';

    this.smtpHost = process.env.SMTP_HOST;
    this.smtpUser = process.env.SMTP_USER;
    this.smtpPass = process.env.SMTP_PASS;
    this.smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    this.smtpSecure = process.env.SMTP_SECURE === 'true';
    this.fromAddress = process.env.SMTP_FROM_EMAIL || this.smtpUser || 'no-reply@septic-service.local';

    // transporter is created lazily in getTransporter() with real IP resolution
  }

  /**
   * Send via Resend HTTP API (port 443). Throws on failure.
   */
  private async sendViaResend(
    to: string,
    subject: string,
    text: string,
    html: string
  ): Promise<void> {
    await axios.post(
      'https://api.resend.com/emails',
      { from: this.resendFrom, to: [to], subject, text, html },
      {
        headers: {
          Authorization: `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
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
    const subject = 'Код входа в Септик Сервис';
    const text = `Ваш код входа: ${code}. Он действует 10 минут.`;
    const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
            <h2>Код входа</h2>
            <p>Ваш код подтверждения:</p>
            <div style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 16px 0;">${code}</div>
            <p>Код действует 10 минут.</p>
            ${role ? `<p>Роль: ${role}</p>` : ''}
          </div>
        `;

    // 1) Preferred: Resend HTTP API. Works behind hosts (Render) that block
    // outbound SMTP ports, since it goes over HTTPS (443).
    if (this.resendApiKey) {
      try {
        await this.sendViaResend(email, subject, text, html);
        logger.info('Login code sent via Resend', { email, role });
        return { sent: true };
      } catch (error: any) {
        const detail = error?.response?.data || error?.message;
        logger.error('Failed to send login code via Resend', { email, error: detail });
        // fall through to SMTP fallback below
      }
    }

    // 2) Fallback: SMTP (useful for local development).
    const transporter = await this.getTransporter();

    if (!transporter) {
      logger.warn('Email is not configured (no Resend/SMTP). Login code was not sent.', {
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
        subject,
        text,
        html,
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