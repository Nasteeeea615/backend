import { Request, Response } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import smsService from '../services/smsService';
import jwtService from '../services/jwtService';
import userService from '../services/userService';
import { RegisterClientDTO, RegisterExecutorDTO, APIResponse } from '../types';

class AuthController {
  /**
   * POST /api/auth/send-sms
   * Send SMS verification code
   */
  sendSMS = asyncHandler(async (req: Request, res: Response) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'Phone number is required', 400);
    }

    // Validate phone number format (basic validation)
    const phoneRegex = /^\+?[1-9]\d{10,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      throw new AppError('INVALID_PHONE_NUMBER', 'Invalid phone number format', 400);
    }

    // Generate and store code
    const code = smsService.generateCode();
    await smsService.storeCode(phoneNumber, code);

    // Send SMS
    const result = await smsService.sendSMS(phoneNumber, code);

    if (!result.success) {
      throw new AppError('SMS_SEND_FAILED', result.message || 'Failed to send SMS', 500);
    }

    const response: APIResponse = {
      success: true,
      data: { message: 'SMS code sent successfully' },
    };

    res.json(response);
  });

  /**
   * POST /api/auth/verify-sms
   * Verify SMS code and return JWT token
   */
  verifySMS = asyncHandler(async (req: Request, res: Response) => {
    const { phoneNumber, code } = req.body;

    if (!phoneNumber || !code) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'Phone number and code are required', 400);
    }

    // Verify code
    const isValid = await smsService.verifyCode(phoneNumber, code);
    if (!isValid) {
      throw new AppError('INVALID_SMS_CODE', 'Invalid or expired SMS code', 400);
    }

    // Check if user exists
    const user = await userService.findByPhoneNumber(phoneNumber);

    if (user) {
      // Check if user is blocked
      if (user.is_blocked) {
        throw new AppError('USER_BLOCKED', 'Your account has been blocked', 403);
      }

      // Generate token
      const token = jwtService.generateToken({
        userId: user.id,
        role: user.role,
      });

      const userWithProfile = await userService.getUserWithProfile(user.id);
      
      const response: APIResponse = {
        success: true,
        data: {
          token,
          isNewUser: false,
          user: userWithProfile,
        },
      };

      return res.json(response);
    }

    // User doesn't exist - return flag to show registration
    const response: APIResponse = {
      success: true,
      data: {
        isNewUser: true,
        phoneNumber,
      },
    };

    return res.json(response);
  });

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

    // Generate token
    const token = jwtService.generateToken({
      userId: user.id,
      role: user.role,
    });

    const response: APIResponse = {
      success: true,
      data: {
        token,
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

    // Generate token
    const token = jwtService.generateToken({
      userId: user.id,
      role: user.role,
    });

    const response: APIResponse = {
      success: true,
      data: {
        token,
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
    // In JWT-based auth, logout is handled client-side by removing the token
    // Here we just confirm the logout
    const response: APIResponse = {
      success: true,
      data: { message: 'Logged out successfully' },
    };

    res.json(response);
  });
}

export default new AuthController();
