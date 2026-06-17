import { Request, Response } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import jwtService from '../services/jwtService';
import userService from '../services/userService';
import emailService from '../services/emailService';
import loginCodeService from '../services/loginCodeService';
import {
  RegisterClientDTO,
  RegisterExecutorDTO,
  RequestLoginCodeDTO,
  VerifyLoginCodeDTO,
  APIResponse,
} from '../types';

class AuthController {

  /**
   * POST /api/auth/request-code
   * Send email confirmation code for login
   */
  requestCode = asyncHandler(async (req: Request, res: Response) => {
    const data: RequestLoginCodeDTO = req.body;
    console.log('📧 [requestCode] START', { email: data.email });

    if (!data.email) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'Email is required', 400);
    }

    const email = data.email.trim().toLowerCase();
    console.log('📧 [requestCode] EMAIL NORMALIZED', { email });

    const code = loginCodeService.generateCode();
    console.log('📧 [requestCode] CODE GENERATED', { code });

    await loginCodeService.storeCode(email, code, data.role);
    console.log('📧 [requestCode] CODE STORED');

    const delivery = await emailService.sendLoginCode(email, code, data.role);
    console.log('📧 [requestCode] EMAIL SENT', { sent: delivery.sent, hasDebugCode: !!delivery.debugCode });

    // Never expose the code in the API response in production. Even if SMTP
    // fails, leaking the login code over the API would let anyone log in as
    // any user. debugCode is only returned outside of production for local dev.
    const isProduction = process.env.NODE_ENV === 'production';

    const response: APIResponse = {
      success: true,
      data: {
        message: 'Verification code sent',
        email,
        expiresInMinutes: parseInt(process.env.LOGIN_CODE_TTL_MINUTES || '10', 10),
        ...(!isProduction && delivery.debugCode
          ? { debugCode: delivery.debugCode }
          : {}),
      },
    };

    res.json(response);
  });

  /**
   * POST /api/auth/verify-code
   * Verify email confirmation code and create access cookie
   */
  verifyCode = asyncHandler(async (req: Request, res: Response) => {
    const data: VerifyLoginCodeDTO = req.body;

    if (!data.email || !data.code) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'Email and code are required', 400);
    }

    const email = data.email.trim().toLowerCase();
    // If role is specified, find user with that specific role
    const user = data.role
      ? await userService.findByEmailAndRole(email, data.role)
      : await userService.findByEmail(email);

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User with this email was not found', 404);
    }

    if (data.role && user.role !== data.role) {
      throw new AppError('FORBIDDEN', 'This account does not have the required role', 403);
    }

    const verified = await loginCodeService.verifyCode(email, data.code.trim(), data.role || user.role);
    if (!verified) {
      throw new AppError('INVALID_TOKEN', 'Invalid or expired verification code', 401);
    }

    const token = jwtService.generateToken({ userId: user.id, role: user.role });
    res.cookie('access_token', token, buildCookieOptions());

    const response: APIResponse = {
      success: true,
      data: {
        token,
        user: await userService.getUserWithProfile(user.id),
      },
    };

    res.json(response);
  });

  /**
   * GET /api/auth/me
   * Return current authenticated user
   */
  me = asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const cookieToken = parseAccessTokenFromCookies(req.headers.cookie);
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : cookieToken;

    if (!token) {
      throw new AppError('UNAUTHORIZED', 'No token provided', 401);
    }

    const payload = jwtService.verifyToken(token);
    if (!payload) {
      throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
    }

    const user = await userService.getUserWithProfile(payload.userId);

    const response: APIResponse = {
      success: true,
      data: { user },
    };

    res.json(response);
  });

  /**
   * POST /api/auth/register-client
   * Register new client
   */
  registerClient = asyncHandler(async (req: Request, res: Response) => {
    const data: RegisterClientDTO = req.body;
    const normalizedEmail = data.email?.trim().toLowerCase();
    const normalizedPhone = data.phone_number?.trim();
    const normalizedName = data.name?.trim();
    const normalizedCity = data.city?.trim();
    const normalizedStreet = data.street?.trim();
    const normalizedHouseNumber = data.house_number?.trim();

    // Validate required fields
    if (!normalizedEmail || !normalizedPhone || !normalizedName || !normalizedCity || !normalizedStreet || !normalizedHouseNumber) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'All fields are required', 400);
    }

    if (!data.agreed_to_terms) {
      throw new AppError('TERMS_NOT_AGREED', 'You must agree to terms and conditions', 400);
    }

    const existingByEmail = await userService.findByEmail(normalizedEmail);

    // Check if user already exists
    const existingUser = await userService.findByPhoneNumber(normalizedPhone);

    if (existingByEmail) {
      const hasClientProfile = await userService.hasClientProfile(existingByEmail.id);

      if (hasClientProfile) {
        const response: APIResponse = {
          success: true,
          data: {
            user: await userService.getUserWithProfile(existingByEmail.id),
            requiresVerification: true,
            role: 'client',
            message: 'Account already exists. Continue to verification.',
          },
        };

        res.status(200).json(response);
        return;
      }

      if (existingUser && existingUser.id !== existingByEmail.id) {
        throw new AppError('PHONE_ALREADY_EXISTS', 'User with this phone number already exists', 400);
      }

      if (!existingUser || existingUser.id === existingByEmail.id) {
        await userService.addClientProfile(existingByEmail.id, {
          ...data,
          email: normalizedEmail,
          phone_number: normalizedPhone,
          name: normalizedName,
          city: normalizedCity,
          street: normalizedStreet,
          house_number: normalizedHouseNumber,
        });
        await userService.updateEmail(existingByEmail.id, normalizedEmail);
        await userService.updateRole(existingByEmail.id, 'client');

        const response: APIResponse = {
          success: true,
          data: {
            user: await userService.getUserWithProfile(existingByEmail.id),
            requiresVerification: true,
            role: 'client',
          },
        };

        res.status(201).json(response);
        return;
      }
    }

    let user;

    if (existingUser) {
      const hasClientProfile = await userService.hasClientProfile(existingUser.id);
      if (hasClientProfile) {
        throw new AppError('USER_ALREADY_EXISTS', 'User with this phone number already exists', 400);
      }

      await userService.addClientProfile(existingUser.id, {
        ...data,
        email: normalizedEmail,
        phone_number: normalizedPhone,
        name: normalizedName,
        city: normalizedCity,
        street: normalizedStreet,
        house_number: normalizedHouseNumber,
      });
      await userService.updateEmail(existingUser.id, normalizedEmail);
      await userService.updateRole(existingUser.id, 'client');

      user = await userService.findById(existingUser.id);
    } else {
      // Register new client
      user = await userService.registerClient({
        ...data,
        email: normalizedEmail,
        phone_number: normalizedPhone,
        name: normalizedName,
        city: normalizedCity,
        street: normalizedStreet,
        house_number: normalizedHouseNumber,
      });
    }

    if (!user) {
      throw new AppError('SERVER_ERROR', 'Failed to create user', 500);
    }

    // Defensive fix for legacy/dirty data states where email may still be null after registration.
    if (!user.email) {
      await userService.updateEmail(user.id, normalizedEmail);
    }

    const response: APIResponse = {
      success: true,
      data: {
        user: await userService.getUserWithProfile(user.id),
        requiresVerification: true,
        role: 'client',
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
    const normalizedEmail = data.email?.trim().toLowerCase();
    const normalizedPhone = data.phone_number?.trim();
    const normalizedName = data.name?.trim();
    const normalizedVehicleNumber = data.vehicle_number?.trim();

    // Validate required fields
    if (!normalizedEmail || !normalizedPhone || !normalizedName || !normalizedVehicleNumber || !data.vehicle_capacity) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'All fields are required', 400);
    }

    if (!data.agreed_to_terms) {
      throw new AppError('TERMS_NOT_AGREED', 'You must agree to terms and conditions', 400);
    }

    // Validate vehicle capacity
    if (![3, 5, 10].includes(data.vehicle_capacity)) {
      throw new AppError('INVALID_VEHICLE_CAPACITY', 'Vehicle capacity must be 3, 5, or 10', 400);
    }

    const existingByEmail = await userService.findByEmail(normalizedEmail);

    // Check if user already exists
    const existingUser = await userService.findByPhoneNumber(normalizedPhone);

    if (existingByEmail) {
      const hasExecutorProfile = await userService.hasExecutorProfile(existingByEmail.id);

      if (hasExecutorProfile) {
        const response: APIResponse = {
          success: true,
          data: {
            user: await userService.getUserWithProfile(existingByEmail.id),
            message: 'Account already exists. Continue to verification.',
            requiresVerification: true,
            requiresAdminApproval: !existingByEmail.is_blocked,
            role: 'executor',
          },
        };

        res.status(200).json(response);
        return;
      }

      if (existingUser && existingUser.id !== existingByEmail.id) {
        throw new AppError('PHONE_ALREADY_EXISTS', 'User with this phone number already exists', 400);
      }

      if (!existingUser || existingUser.id === existingByEmail.id) {
        await userService.addExecutorProfile(existingByEmail.id, {
          ...data,
          email: normalizedEmail,
          phone_number: normalizedPhone,
          name: normalizedName,
          vehicle_number: normalizedVehicleNumber,
        });
        await userService.updateEmail(existingByEmail.id, normalizedEmail);
        await userService.updateRole(existingByEmail.id, 'executor');

        const response: APIResponse = {
          success: true,
          data: {
            user: await userService.getUserWithProfile(existingByEmail.id),
            message: 'Registration successful. Your account is pending verification.',
            requiresVerification: true,
            requiresAdminApproval: true,
            role: 'executor',
          },
        };

        res.status(201).json(response);
        return;
      }
    }

    let user;

    if (existingUser) {
      const hasExecutorProfile = await userService.hasExecutorProfile(existingUser.id);
      if (hasExecutorProfile) {
        throw new AppError('USER_ALREADY_EXISTS', 'User with this phone number already exists', 400);
      }

      await userService.addExecutorProfile(existingUser.id, {
        ...data,
        email: normalizedEmail,
        phone_number: normalizedPhone,
        name: normalizedName,
        vehicle_number: normalizedVehicleNumber,
      });
      await userService.updateEmail(existingUser.id, normalizedEmail);
      await userService.updateRole(existingUser.id, 'executor');

      user = await userService.findById(existingUser.id);
    } else {
      // Register new executor
      user = await userService.registerExecutor({
        ...data,
        email: normalizedEmail,
        phone_number: normalizedPhone,
        name: normalizedName,
        vehicle_number: normalizedVehicleNumber,
      });
    }

    if (!user) {
      throw new AppError('SERVER_ERROR', 'Failed to create user', 500);
    }

    // Defensive fix for legacy/dirty data states where email may still be null after registration.
    if (!user.email) {
      await userService.updateEmail(user.id, normalizedEmail);
    }

    const response: APIResponse = {
      success: true,
      data: {
        user: await userService.getUserWithProfile(user.id),
        message: 'Registration successful. Your account is pending verification.',
        requiresVerification: true,
        requiresAdminApproval: true,
        role: 'executor',
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

function buildCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: parseDurationToMs(process.env.JWT_EXPIRES_IN || '15m'),
  };
}

function parseAccessTokenFromCookies(cookieHeader?: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map(part => part.trim());
  const accessToken = cookies.find(cookie => cookie.startsWith('access_token='));

  if (!accessToken) {
    return null;
  }

  return decodeURIComponent(accessToken.substring('access_token='.length));
}
