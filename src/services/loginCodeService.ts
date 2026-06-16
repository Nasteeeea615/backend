import { randomInt } from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../config/database';

class LoginCodeService {
  private readonly codeTtlMinutes = parseInt(process.env.LOGIN_CODE_TTL_MINUTES || '10', 10);
  private schemaChecked = false;
  private hasRoleColumn = true;

  private async ensureSchemaCompatibility(): Promise<void> {
    if (this.schemaChecked) {
      return;
    }

    const columnCheck = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'login_verification_codes' AND column_name = 'role'
       LIMIT 1`
    );

    this.hasRoleColumn = columnCheck.rows.length > 0;
    this.schemaChecked = true;
  }

  generateCode(): string {
    return randomInt(100000, 999999).toString();
  }

  async storeCode(email: string, code: string, role?: string): Promise<void> {
    await this.ensureSchemaCompatibility();

    const codeHash = await bcrypt.hash(code, 10);

    if (role && this.hasRoleColumn) {
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

    if (this.hasRoleColumn) {
      await pool.query(
        `INSERT INTO login_verification_codes (email, role, code_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 minute'))`,
        [email, role || null, codeHash, this.codeTtlMinutes]
      );
      return;
    }

    await pool.query(
      `INSERT INTO login_verification_codes (email, code_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 minute'))`,
      [email, codeHash, this.codeTtlMinutes]
    );
  }

  async verifyCode(email: string, code: string, role?: string): Promise<boolean> {
    await this.ensureSchemaCompatibility();

    // Try with role first, fall back to role-less code (sent from login screen before role is known)
    let record: any = null;

    if (role && this.hasRoleColumn) {
      const res = await pool.query(
        `SELECT * FROM login_verification_codes
         WHERE email = $1 AND role = $2 AND is_used = FALSE AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email, role]
      );
      record = res.rows[0];
    }

    if (!record) {
      const res = await pool.query(
        `SELECT * FROM login_verification_codes
         WHERE email = $1 AND (role IS NULL OR role = $2)
           AND is_used = FALSE AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email, role || null]
      );
      record = res.rows[0];
    }

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