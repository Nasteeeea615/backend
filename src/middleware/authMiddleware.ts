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
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'No token provided', 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

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
