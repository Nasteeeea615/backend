import { Response } from 'express';
import { AuthRequest, APIResponse } from '../types';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import userService from '../services/userService';
import pool from '../config/database';

class ProfileController {
  /**
   * GET /api/profile
   * Get current user profile
   */
  getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const user = await userService.getUserWithProfile(req.user.id);

    const response: APIResponse = {
      success: true,
      data: { user },
    };

    res.json(response);
  });

  /**
   * PUT /api/profile
   * Update user profile
   */
  updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const { name, city, street, house_number, vehicle_number } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update user name
      if (name) {
        await client.query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [
          name,
          req.user.id,
        ]);
      }

      // Update client profile if user is a client
      if (req.user.role === 'client' && (city || street || house_number)) {
        await client.query(
          `UPDATE client_profiles 
           SET city = COALESCE($1, city),
               street = COALESCE($2, street),
               house_number = COALESCE($3, house_number)
           WHERE user_id = $4`,
          [city, street, house_number, req.user.id]
        );
      }

      // Update executor profile if user is an executor
      if (req.user.role === 'executor' && vehicle_number) {
        await client.query(
          `UPDATE executor_profiles 
           SET vehicle_number = $1
           WHERE user_id = $2`,
          [vehicle_number, req.user.id]
        );
      }

      await client.query('COMMIT');

      const user = await userService.getUserWithProfile(req.user.id);

      const response: APIResponse = {
        success: true,
        data: { user },
      };

      res.json(response);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  /**
   * DELETE /api/profile
   * Delete user account
   */
  deleteProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    // Delete user (cascade will delete profiles)
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);

    const response: APIResponse = {
      success: true,
      data: { message: 'Account deleted successfully' },
    };

    res.json(response);
  });
}

export default new ProfileController();
