import { Response } from 'express';
import { AuthRequest, APIResponse } from '../types';
import { AppError, ErrorCode } from '../types/errors';
import { asyncHandler } from '../middleware/errorHandler';
import userService from '../services/userService';
import jwtService from '../services/jwtService';
import pool from '../config/database';

class ProfileController {
  /**
   * GET /api/profile
   * Get current user profile
   */
  getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
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
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
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
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
    }

    // Soft-delete the account so foreign keys from orders and payments stay valid.
    await pool.query(
      `UPDATE users
       SET is_blocked = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [req.user.id]
    );

    const response: APIResponse = {
      success: true,
      data: { message: 'Account deactivated successfully' },
    };

    res.json(response);
  });

  /**
   * DELETE /api/account
   * Delete user account (alias for deleteProfile)
   */
  deleteAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
    }

    await pool.query(
      `UPDATE users
       SET is_blocked = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [req.user.id]
    );

    const response: APIResponse = {
      success: true,
      data: { message: 'Account deactivated successfully' },
    };

    res.json(response);
  });

  /**
   * GET /api/check-role/:role
   * Check if user is registered in a specific role
   */
  checkRole = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
    }

    const role = Array.isArray(req.params.role) ? req.params.role[0] : (req.params.role || '');

    if (role !== 'client' && role !== 'executor') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid role', 400);
    }

    try {
      let isRegistered = false;

      if (role === 'client') {
        const result = await pool.query(
          'SELECT user_id FROM client_profiles WHERE user_id = $1',
          [req.user.id]
        );
        isRegistered = result.rows.length > 0;
      } else if (role === 'executor') {
        const result = await pool.query(
          'SELECT user_id FROM executor_profiles WHERE user_id = $1',
          [req.user.id]
        );
        isRegistered = result.rows.length > 0;
      }

      const response: APIResponse = {
        success: true,
        data: { isRegistered },
      };

      res.json(response);
    } catch (error) {
      console.error('profileController.checkRole error', {
        userId: req.user?.id,
        role,
        error: (error as Error).stack || error,
      });
      throw error;
    }
  });

  /**
   * POST /api/switch-role
   * Switch user role between client and executor
   */
  switchRole = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
    }

    const { newRole } = req.body;

    if (newRole !== 'client' && newRole !== 'executor') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid role', 400);
    }

    // Check if user is registered in the new role
    let isRegistered = false;

    if (newRole === 'client') {
      const result = await pool.query(
        'SELECT user_id FROM client_profiles WHERE user_id = $1',
        [req.user.id]
      );
      isRegistered = result.rows.length > 0;
    } else if (newRole === 'executor') {
      const result = await pool.query(
        'SELECT user_id FROM executor_profiles WHERE user_id = $1',
        [req.user.id]
      );
      isRegistered = result.rows.length > 0;
    }

    if (!isRegistered) {
      throw new AppError(
        ErrorCode.NOT_REGISTERED,
        `User is not registered as ${newRole}`,
        400
      );
    }

    // Update user role
    await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [
      newRole,
      req.user.id,
    ]);

    // Get updated user with profile
    const user = await userService.getUserWithProfile(req.user.id);

    // Generate new JWT token with updated role
    const token = jwtService.generateToken({ userId: user.id, role: newRole });

    const response: APIResponse = {
      success: true,
      data: {
        token,
        user,
      },
    };

    res.json(response);
  });
}

export default new ProfileController();
