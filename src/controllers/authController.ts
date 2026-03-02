import { Request, Response } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import jwtService from '../services/jwtService';
import userService from '../services/userService';
import { RegisterClientDTO, RegisterExecutorDTO, APIResponse } from '../types';

class AuthController {

  /**
   * POST /api/auth/register-client
   * Register new client
   */
  registerClient = asyncHandler(async (req: Request, res: Response) => {
    const data: RegisterClientDTO = req.body;

    // Validate required fields
    if (!data.phone_number || !data.name || !data.city || !data.street || !data.house_number) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'All fields are required', 400);
    }

    if (!data.agreed_to_terms) {
      throw new AppError('TERMS_NOT_AGREED', 'You must agree to terms and conditions', 400);
    }

    // Check if user already exists
    const existingUser = await userService.findByPhoneNumber(data.phone_number);
    if (existingUser) {
      throw new AppError('USER_ALREADY_EXISTS', 'User with this phone number already exists', 400);
    }

    // Register client
    const user = await userService.registerClient(data);

    // Generate access token and set as HttpOnly cookie
    const token = jwtService.generateToken({ userId: user.id, role: user.role });

    // Cookie options
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
      // Set maxAge based on JWT_EXPIRES_IN (approximate)
      maxAge: parseDurationToMs(process.env.JWT_EXPIRES_IN || '15m'),
    };

    res.cookie('access_token', token, cookieOptions);

    const response: APIResponse = {
      success: true,
      data: {
        user: await userService.getUserWithProfile(user.id),
      },
    };

    res.status(201).json(response);
  });

  /**
   * POST /api/auth/register-executor
   * Register new executor
   */
  registerExecutor = asyncHandler(async (req: Request, res: Response) => {
    const data: RegisterExecutorDTO = req.body;

    // Validate required fields
    if (!data.phone_number || !data.name || !data.vehicle_number || !data.vehicle_capacity) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'All fields are required', 400);
    }

    if (!data.agreed_to_terms) {
      throw new AppError('TERMS_NOT_AGREED', 'You must agree to terms and conditions', 400);
    }

    // Validate vehicle capacity
    if (![3, 5, 10].includes(data.vehicle_capacity)) {
      throw new AppError('INVALID_VEHICLE_CAPACITY', 'Vehicle capacity must be 3, 5, or 10', 400);
    }

    // Check if user already exists
    const existingUser = await userService.findByPhoneNumber(data.phone_number);
    if (existingUser) {
      throw new AppError('USER_ALREADY_EXISTS', 'User with this phone number already exists', 400);
    }

    // Register executor
    const user = await userService.registerExecutor(data);

    // Generate access token and set as HttpOnly cookie
    const token = jwtService.generateToken({ userId: user.id, role: user.role });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
      maxAge: parseDurationToMs(process.env.JWT_EXPIRES_IN || '15m'),
    };

    res.cookie('access_token', token, cookieOptions);

    const response: APIResponse = {
      success: true,
      data: {
        user: await userService.getUserWithProfile(user.id),
        message: 'Registration successful. Your account is pending verification.',
      },
    };

    res.status(201).json(response);
  });

  /**
   * POST /api/auth/logout
   * Logout user (client-side token removal)
   */
  logout = asyncHandler(async (_req: Request, res: Response) => {
    // Clear the access_token cookie
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    const response: APIResponse = {
      success: true,
      data: { message: 'Logged out successfully' },
    };

    res.json(response);
  });
}

export default new AuthController();

/**
 * Parse simple duration strings like '15m', '7d' to milliseconds.
 */
function parseDurationToMs(value: string): number {
  const match = /^([0-9]+)\s*(s|m|h|d)?$/i.exec(value);
  if (!match) return 0;
  const n = parseInt(match[1], 10);
  const unit = (match[2] || 'ms').toLowerCase();
  switch (unit) {
    case 's':
      return n * 1000;
    case 'm':
      return n * 60 * 1000;
    case 'h':
      return n * 60 * 60 * 1000;
    case 'd':
      return n * 24 * 60 * 60 * 1000;
    default:
      return n;
  }
}
