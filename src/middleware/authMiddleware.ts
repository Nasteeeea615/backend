import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { AppError } from './errorHandler';
import jwtService from '../services/jwtService';
import userService from '../services/userService';

/**
 * Middleware to verify JWT token
 */
export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;
    const cookieToken = parseAccessTokenFromCookies(req.headers.cookie);
    const token = bearerToken || cookieToken;

    if (!token) {
      throw new AppError('UNAUTHORIZED', 'No token provided', 401);
    }

    // Verify token
    const payload = jwtService.verifyToken(token);
    if (!payload) {
      throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
    }

    // Check if user exists and is not blocked
    const user = await userService.findById(payload.userId);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    if (user.is_blocked) {
      throw new AppError('USER_BLOCKED', 'Your account has been blocked', 403);
    }

    // Attach user info to request
    req.user = {
      id: payload.userId,
      role: payload.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if user has specific role
 */
export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError('FORBIDDEN', 'You do not have permission to access this resource', 403);
    }

    next();
  };
};

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
