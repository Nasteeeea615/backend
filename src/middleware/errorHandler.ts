import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../types/errors';
import logger from '../utils/logger';

// Re-export AppError for convenience
export { AppError } from '../types/errors';

/**
 * Интерфейс ответа с ошибкой
 */
interface ErrorResponse {
  code: string;
  message: string;
  details?: any;
  stack?: string;
}

/**
 * Централизованный обработчик ошибок
 * Должен быть последним middleware в цепочке
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Если ответ уже отправлен, передаем ошибку дальше
  if (res.headersSent) {
    return next(err);
  }

  // Логируем ошибку
  logError(err, req);

  // Если это наша кастомная ошибка
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      code: err.code,
      message: err.message,
      details: err.details,
    };

    // Добавляем stack trace в dev режиме
    if (process.env.NODE_ENV === 'development') {
      response.stack = err.stack;
    }

    return res.status(err.statusCode).json(response);
  }

  // Обработка ошибок Joi валидации
  if (err.name === 'ValidationError') {
    const response: ErrorResponse = {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Ошибка валидации данных',
      details: (err as any).details,
    };

    return res.status(400).json(response);
  }

  // Обработка ошибок JWT
  if (err.name === 'JsonWebTokenError') {
    const response: ErrorResponse = {
      code: ErrorCode.INVALID_TOKEN,
      message: 'Неверный токен авторизации',
    };

    return res.status(401).json(response);
  }

  if (err.name === 'TokenExpiredError') {
    const response: ErrorResponse = {
      code: ErrorCode.TOKEN_EXPIRED,
      message: 'Токен авторизации истек',
    };

    return res.status(401).json(response);
  }

  // Обработка ошибок базы данных
  if (err.name === 'QueryFailedError' || (err as any).code?.startsWith('23')) {
    logger.error('Database error:', err);

    const response: ErrorResponse = {
      code: ErrorCode.DATABASE_ERROR,
      message: 'Ошибка базы данных',
    };

    if (process.env.NODE_ENV === 'development') {
      response.details = err.message;
    }

    return res.status(500).json(response);
  }

  // Неизвестная ошибка
  logger.error('Unhandled error:', err);

  const response: ErrorResponse = {
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    message: process.env.NODE_ENV === 'production' 
      ? 'Внутренняя ошибка сервера' 
      : err.message,
  };

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  return res.status(500).json(response);
};

/**
 * Логирование ошибок
 */
function logError(err: Error | AppError, req: Request) {
  const errorInfo = {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userId: (req as any).user?.id,
  };

  if (err instanceof AppError) {
    if (err.isOperational) {
      // Операционные ошибки (ожидаемые)
      logger.warn('Operational error:', {
        ...errorInfo,
        code: err.code,
        statusCode: err.statusCode,
        details: err.details,
      });
    } else {
      // Программные ошибки (неожиданные)
      logger.error('Programming error:', {
        ...errorInfo,
        code: err.code,
        statusCode: err.statusCode,
        details: err.details,
      });
    }
  } else {
    // Неизвестные ошибки
    logger.error('Unknown error:', errorInfo);
  }
}

/**
 * Обработчик для несуществующих роутов (404)
 */
export const notFoundHandler = (req: Request, res: Response) => {
  const response: ErrorResponse = {
    code: ErrorCode.RESOURCE_NOT_FOUND,
    message: `Маршрут ${req.method} ${req.url} не найден`,
  };

  res.status(404).json(response);
};

/**
 * Обработчик для async функций
 * Оборачивает async route handlers и передает ошибки в errorHandler
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
