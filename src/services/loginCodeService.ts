import { randomInt } from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../config/database';

class LoginCodeService {
  private readonly codeTtlMinutes = parseInt(process.env.LOGIN_CODE_TTL_MINUTES || '10', 10);

  generateCode(): string {
    return randomInt(100000, 999999).toString();
  }

  async storeCode(email: string, code: string, role?: string): Promise<void> {
    const codeHash = await bcrypt.hash(code, 10);

    if (role) {
      await pool.query(
        `DELETE FROM login_verification_codes WHERE email = $1 AND role = $2`,
        [email, role]
      );
    } else {
      await pool.query(
        `DELETE FROM login_verification_codes WHERE email = $1`,
        [email]
      );
    }

    await pool.query(
      `INSERT INTO login_verification_codes (email, role, code_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 minute'))`,
      [email, role || null, codeHash, this.codeTtlMinutes]
    );
  }

  async verifyCode(email: string, code: string, role?: string): Promise<boolean> {
    const params: any[] = [email];
    let query = `
      SELECT *
      FROM login_verification_codes
      WHERE email = $1
        AND is_used = FALSE
        AND expires_at > NOW()
    `;

    if (role) {
      params.push(role);
      query += ` AND role = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC LIMIT 1';

    const result = await pool.query(query, params);
    const record = result.rows[0];

    if (!record) {
      return false;
    }

    const matches = await bcrypt.compare(code, record.code_hash);
    if (!matches) {
      await pool.query(
        `UPDATE login_verification_codes
         SET attempts = attempts + 1
         WHERE id = $1`,
        [record.id]
      );

      return false;
    }

    await pool.query(
      `UPDATE login_verification_codes
       SET is_used = TRUE, verified_at = NOW()
       WHERE id = $1`,
      [record.id]
    );

    return true;
  }
}

export default new LoginCodeService();