import pool from '../config/database';
import { User, RegisterClientDTO, RegisterExecutorDTO } from '../types';
import { AppError } from '../middleware/errorHandler';

class UserService {
  /**
   * Find user by phone number
   */
  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    const result = await pool.query(
      'SELECT * FROM users WHERE phone_number = $1',
      [phoneNumber]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Find user by ID
   */
  async findById(userId: string): Promise<User | null> {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Get user with profile
   */
  async getUserWithProfile(userId: string): Promise<any> {
    const user = await this.findById(userId);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    const clientProfileResult = await pool.query(
      'SELECT * FROM client_profiles WHERE user_id = $1',
      [userId]
    );
    const executorProfileResult = await pool.query(
      'SELECT * FROM executor_profiles WHERE user_id = $1',
      [userId]
    );

    return {
      ...user,
      clientProfile: clientProfileResult.rows[0] || null,
      executorProfile: executorProfileResult.rows[0] || null,
    };
  }

  async hasClientProfile(userId: string): Promise<boolean> {
    const result = await pool.query('SELECT user_id FROM client_profiles WHERE user_id = $1', [userId]);
    return result.rows.length > 0;
  }

  async hasExecutorProfile(userId: string): Promise<boolean> {
    const result = await pool.query('SELECT user_id FROM executor_profiles WHERE user_id = $1', [userId]);
    return result.rows.length > 0;
  }

  async addClientProfile(userId: string, data: RegisterClientDTO): Promise<void> {
    await pool.query(
      `INSERT INTO client_profiles (user_id, city, street, house_number)
       VALUES ($1, $2, $3, $4)`,
      [userId, data.city, data.street, data.house_number]
    );
  }

  async addExecutorProfile(userId: string, data: RegisterExecutorDTO): Promise<void> {
    await pool.query(
      `INSERT INTO executor_profiles (user_id, vehicle_number, vehicle_capacity, is_verified)
       VALUES ($1, $2, $3, false)`,
      [userId, data.vehicle_number, data.vehicle_capacity]
    );
  }

  async updateRole(userId: string, role: 'client' | 'executor'): Promise<void> {
    await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, userId]);
  }

  async updateEmail(userId: string, email: string): Promise<void> {
    await pool.query('UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2', [email, userId]);
  }

  /**
   * Register new client
   */
  async registerClient(data: RegisterClientDTO): Promise<User> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (phone_number, email, name, role)
         VALUES ($1, $2, $3, 'client')
         RETURNING *`,
        [data.phone_number, data.email, data.name]
      );

      const user = userResult.rows[0];

      // Create client profile
      await client.query(
        `INSERT INTO client_profiles (user_id, city, street, house_number) 
         VALUES ($1, $2, $3, $4)`,
        [user.id, data.city, data.street, data.house_number]
      );

      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Register new executor
   */
  async registerExecutor(data: RegisterExecutorDTO): Promise<User> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (phone_number, email, name, role)
         VALUES ($1, $2, $3, 'executor')
         RETURNING *`,
        [data.phone_number, data.email, data.name]
      );

      const user = userResult.rows[0];

      // Create executor profile (not verified by default)
      await client.query(
        `INSERT INTO executor_profiles (user_id, vehicle_number, vehicle_capacity, is_verified) 
         VALUES ($1, $2, $3, false)`,
        [user.id, data.vehicle_number, data.vehicle_capacity]
      );

      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if user is blocked
   */
  async isBlocked(userId: string): Promise<boolean> {
    const user = await this.findById(userId);
    return user?.is_blocked || false;
  }
}

export default new UserService();
