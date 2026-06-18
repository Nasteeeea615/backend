import { Request, Response } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import jwtService from '../services/jwtService';
import userService from '../services/userService';
import emailService from '../services/emailService';
import loginCodeService from '../services/loginCodeService';
import pendingRegistrationService from '../services/pendingRegistrationService';
import {
  RegisterClientDTO,
  RegisterExecutorDTO,
  RequestLoginCodeDTO,
  VerifyLoginCodeDTO,
  APIResponse,
  User,
} from '../types';

class AuthController {

  /**
   * POST /api/auth/request-code
   * Send email confirmation code for login
   */
  requestCode = asyncHandler(async (req: Request, res: Response) => {
    const data: RequestLoginCodeDTO = req.body;

    if (!data.email) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'Email is required', 400);
    }

    const email = data.email.trim().toLowerCase();

    const code = loginCodeService.generateCode();
    await loginCodeService.storeCode(email, code, data.role);

    const delivery = await emailService.sendLoginCode(email, code, data.role);

    // Never expose the code in the API response in production. Even if email
    // delivery fails, leaking the login code over the API would let anyone log
    // in as any user. debugCode is only returned outside of production.
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
   * Verify email confirmation code, creating the user from a pending
   * registration if this is a first-time sign-up.
   */
  verifyCode = asyncHandler(async (req: Request, res: Response) => {
    const data: VerifyLoginCodeDTO = req.body;

    if (!data.email || !data.code) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'Email and code are required', 400);
    }

    const email = data.email.trim().toLowerCase();

    // One row per email (unique). A user may hold both client and executor
    // profiles; the requested role selects which one to enter.
    let user = await userService.findByEmail(email);

    // First-time sign-up: data was parked in pending_registrations and the user
    // row does not exist yet.
    let pending: Record<string, any> | null = null;
    if (!user && data.role) {
      pending = await pendingRegistrationService.get(email, data.role);
    }

    if (!user && !pending) {
      throw new AppError('USER_NOT_FOUND', 'User with this email was not found', 404);
    }

    const roleForCode = data.role || user?.role;
    const verified = await loginCodeService.verifyCode(email, data.code.trim(), roleForCode);
    if (!verified) {
      throw new AppError('INVALID_TOKEN', 'Invalid or expired verification code', 401);
    }

    // Create the account now that the email is proven. data.role is guaranteed
    // truthy here because pending is only looked up when data.role is set.
    if (!user && pending) {
      user = data.role === 'executor'
        ? await this.createOrAttachExecutor(pending as RegisterExecutorDTO)
        : await this.createOrAttachClient(pending as RegisterClientDTO);
      // Store the password chosen at registration so the user can later log in
      // with email+password instead of an email code.
      if (user && pending.password) {
        await userService.setPassword(user.id, pending.password);
      }
      await pendingRegistrationService.delete(email, data.role!);
    }

    if (!user) {
      throw new AppError('SERVER_ERROR', 'Failed to create user', 500);
    }

    // Enter the requested role (must have that profile); make it the active role.
    const activeRole = await this.resolveActiveRole(user, data.role);

    const token = jwtService.generateToken({ userId: user.id, role: activeRole });
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
   * Validate client registration and park it until the email code is verified.
   * The users row is created later in verifyCode.
   */
  registerClient = asyncHandler(async (req: Request, res: Response) => {
    const data: RegisterClientDTO = req.body;
    const normalized = {
      ...data,
      email: data.email?.trim().toLowerCase(),
      phone_number: data.phone_number?.trim(),
      name: data.name?.trim(),
      city: data.city?.trim(),
      street: data.street?.trim(),
      house_number: data.house_number?.trim(),
    };

    if (!normalized.email || !normalized.phone_number || !normalized.name ||
        !normalized.city || !normalized.street || !normalized.house_number) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'All fields are required', 400);
    }

    if (!data.agreed_to_terms) {
      throw new AppError('TERMS_NOT_AGREED', 'You must agree to terms and conditions', 400);
    }

    await this.assertPhoneAvailableForRole(normalized.email, normalized.phone_number, 'client');

    await pendingRegistrationService.save(normalized.email, 'client', normalized);

    const response: APIResponse = {
      success: true,
      data: {
        requiresVerification: true,
        role: 'client',
        message: 'Continue to verification.',
      },
    };

    res.status(201).json(response);
  });

  /**
   * POST /api/auth/register-executor
   * Validate executor registration and park it until the email code is verified.
   */
  registerExecutor = asyncHandler(async (req: Request, res: Response) => {
    const data: RegisterExecutorDTO = req.body;
    const normalized = {
      ...data,
      email: data.email?.trim().toLowerCase(),
      phone_number: data.phone_number?.trim(),
      name: data.name?.trim(),
      vehicle_number: data.vehicle_number?.trim(),
    };

    if (!normalized.email || !normalized.phone_number || !normalized.name ||
        !normalized.vehicle_number || !data.vehicle_capacity) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'All fields are required', 400);
    }

    if (!data.agreed_to_terms) {
      throw new AppError('TERMS_NOT_AGREED', 'You must agree to terms and conditions', 400);
    }

    if (![3, 5, 10].includes(data.vehicle_capacity)) {
      throw new AppError('INVALID_VEHICLE_CAPACITY', 'Vehicle capacity must be 3, 5, or 10', 400);
    }

    await this.assertPhoneAvailableForRole(normalized.email, normalized.phone_number, 'executor');

    await pendingRegistrationService.save(normalized.email, 'executor', normalized);

    const response: APIResponse = {
      success: true,
      data: {
        requiresVerification: true,
        requiresAdminApproval: true,
        role: 'executor',
        message: 'Registration received. Your account is pending verification.',
      },
    };

    res.status(201).json(response);
  });

  /**
   * POST /api/auth/logout
   */
  logout = asyncHandler(async (_req: Request, res: Response) => {
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

  /**
   * POST /api/auth/login-password
   * Log in with email + password (set during registration).
   */
  loginWithPassword = asyncHandler(async (req: Request, res: Response) => {
    const { email, password, role } = req.body as { email?: string; password?: string; role?: string };

    if (!email || !password) {
      throw new AppError('MISSING_REQUIRED_FIELD', 'Email and password are required', 400);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await userService.findByEmail(normalizedEmail);

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User with this email was not found', 404);
    }

    const ok = await userService.verifyPassword(user, password);
    if (!ok) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // Enter the requested role (must have that profile); make it active.
    const activeRole = await this.resolveActiveRole(user, role);

    const token = jwtService.generateToken({ userId: user.id, role: activeRole });
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
   * Ensure the user can enter the requested role and make it their active role.
   * With the single-user/dual-profile model, "logging in as executor" means the
   * user must own an executor profile; we then flip the active role column.
   */
  private async resolveActiveRole(user: User, requestedRole?: string): Promise<string> {
    if (!requestedRole || requestedRole === user.role) {
      return user.role;
    }
    if (requestedRole !== 'client' && requestedRole !== 'executor') {
      return user.role;
    }

    const hasProfile = requestedRole === 'client'
      ? await userService.hasClientProfile(user.id)
      : await userService.hasExecutorProfile(user.id);

    if (!hasProfile) {
      const roleName = requestedRole === 'client' ? 'заказчик' : 'исполнитель';
      throw new AppError('NOT_REGISTERED', `Вы не зарегистрированы как ${roleName}`, 400);
    }

    await userService.updateRole(user.id, requestedRole);
    return requestedRole;
  }


  /**
   * Reject registration early if the phone number already belongs to a
   * different verified user with the same role (real duplicate).
   */
  private async assertPhoneAvailableForRole(
    email: string,
    phone: string,
    role: 'client' | 'executor'
  ): Promise<void> {
    const existingByPhone = await userService.findByPhoneNumber(phone);
    if (!existingByPhone) return;

    const existingByEmail = await userService.findByEmail(email);
    const samePerson = existingByEmail && existingByEmail.id === existingByPhone.id;
    if (samePerson) return; // same account adding/confirming a profile

    const hasProfile = role === 'client'
      ? await userService.hasClientProfile(existingByPhone.id)
      : await userService.hasExecutorProfile(existingByPhone.id);

    if (hasProfile) {
      throw new AppError('PHONE_ALREADY_EXISTS', 'User with this phone number already exists', 400);
    }
  }

  /**
   * Create a client user (or attach a client profile to an existing user for
   * dual-role accounts). Mirrors the original registration logic, now run only
   * after the email code is verified.
   */
  private async createOrAttachClient(data: RegisterClientDTO): Promise<User> {
    const email = data.email!.trim().toLowerCase();
    const phone = data.phone_number!.trim();

    const existingByEmail = await userService.findByEmail(email);
    const existingByPhone = await userService.findByPhoneNumber(phone);

    if (existingByEmail) {
      if (await userService.hasClientProfile(existingByEmail.id)) {
        return existingByEmail;
      }
      if (existingByPhone && existingByPhone.id !== existingByEmail.id) {
        throw new AppError('PHONE_ALREADY_EXISTS', 'User with this phone number already exists', 400);
      }
      await userService.addClientProfile(existingByEmail.id, data);
      await userService.updateEmail(existingByEmail.id, email);
      await userService.updateRole(existingByEmail.id, 'client');
      return (await userService.findById(existingByEmail.id)) as User;
    }

    let user: User | null;
    if (existingByPhone) {
      if (await userService.hasClientProfile(existingByPhone.id)) {
        throw new AppError('USER_ALREADY_EXISTS', 'User with this phone number already exists', 400);
      }
      await userService.addClientProfile(existingByPhone.id, data);
      await userService.updateEmail(existingByPhone.id, email);
      await userService.updateRole(existingByPhone.id, 'client');
      user = await userService.findById(existingByPhone.id);
    } else {
      user = await userService.registerClient(data);
    }

    if (!user) {
      throw new AppError('SERVER_ERROR', 'Failed to create user', 500);
    }
    if (!user.email) {
      await userService.updateEmail(user.id, email);
    }
    return user;
  }

  /**
   * Create an executor user (or attach an executor profile to an existing
   * user). Run only after the email code is verified.
   */
  private async createOrAttachExecutor(data: RegisterExecutorDTO): Promise<User> {
    const email = data.email!.trim().toLowerCase();
    const phone = data.phone_number!.trim();

    const existingByEmail = await userService.findByEmail(email);
    const existingByPhone = await userService.findByPhoneNumber(phone);

    if (existingByEmail) {
      if (await userService.hasExecutorProfile(existingByEmail.id)) {
        return existingByEmail;
      }
      if (existingByPhone && existingByPhone.id !== existingByEmail.id) {
        throw new AppError('PHONE_ALREADY_EXISTS', 'User with this phone number already exists', 400);
      }
      await userService.addExecutorProfile(existingByEmail.id, data);
      await userService.updateEmail(existingByEmail.id, email);
      await userService.updateRole(existingByEmail.id, 'executor');
      return (await userService.findById(existingByEmail.id)) as User;
    }

    let user: User | null;
    if (existingByPhone) {
      if (await userService.hasExecutorProfile(existingByPhone.id)) {
        throw new AppError('USER_ALREADY_EXISTS', 'User with this phone number already exists', 400);
      }
      await userService.addExecutorProfile(existingByPhone.id, data);
      await userService.updateEmail(existingByPhone.id, email);
      await userService.updateRole(existingByPhone.id, 'executor');
      user = await userService.findById(existingByPhone.id);
    } else {
      user = await userService.registerExecutor(data);
    }

    if (!user) {
      throw new AppError('SERVER_ERROR', 'Failed to create user', 500);
    }
    if (!user.email) {
      await userService.updateEmail(user.id, email);
    }
    return user;
  }
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
