import pool from '../config/database';

/**
 * Stores registration data submitted by a user *before* their email code is
 * verified. The real `users` row is only created on successful verify-code.
 * This prevents abandoned/half-finished registrations from leaving orphan
 * accounts that block the phone/email for later attempts.
 */
class PendingRegistrationService {
  private schemaReady = false;

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pending_registrations (
        email      VARCHAR(255) NOT NULL,
        role       VARCHAR(32)  NOT NULL,
        payload    JSONB        NOT NULL,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        PRIMARY KEY (email, role)
      )
    `);
    this.schemaReady = true;
  }

  async save(email: string, role: string, payload: Record<string, any>): Promise<void> {
    await this.ensureSchema();
    await pool.query(
      `INSERT INTO pending_registrations (email, role, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (email, role)
       DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW()`,
      [email, role, JSON.stringify(payload)]
    );
  }

  async get(email: string, role: string): Promise<Record<string, any> | null> {
    await this.ensureSchema();
    const res = await pool.query(
      `SELECT payload FROM pending_registrations WHERE email = $1 AND role = $2 LIMIT 1`,
      [email, role]
    );
    return res.rows[0]?.payload ?? null;
  }

  async delete(email: string, role: string): Promise<void> {
    await this.ensureSchema();
    await pool.query(
      `DELETE FROM pending_registrations WHERE email = $1 AND role = $2`,
      [email, role]
    );
  }
}

export default new PendingRegistrationService();
