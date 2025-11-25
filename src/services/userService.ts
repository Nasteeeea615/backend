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

    if (user.role === 'client') {
      const profileResult = await pool.query(
        'SELECT * FROM client_profiles WHERE user_id = $1',
        [userId]
      );
      return {
        ...user,
        clientProfile: profileResult.rows[0] || null,
      };
    } else if (user.role === 'executor') {
      const profileResult = await pool.query(
        'SELECT * FROM executor_profiles WHERE user_id = $1',
        [userId]
      );
      return {
        ...user,
        executorProfile: profileResult.rows[0] || null,
      };
    }

    return user;
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
        `INSERT INTO users (phone_number, name, role) 
         VALUES ($1, $2, 'client') 
         RETURNING *`,
        [data.phone_number, data.name]
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
        `INSERT INTO users (phone_number, name, role) 
         VALUES ($1, $2, 'executor') 
         RETURNING *`,
        [data.phone_number, data.name]
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
