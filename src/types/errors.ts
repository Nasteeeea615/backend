/**
 * Типы ошибок приложения
 */
export enum ErrorCode {
  // Authentication errors
  INVALID_PHONE_NUMBER = 'INVALID_PHONE_NUMBER',
  INVALID_SMS_CODE = 'INVALID_SMS_CODE',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_BLOCKED = 'USER_BLOCKED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Order errors
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  ORDER_ALREADY_ASSIGNED = 'ORDER_ALREADY_ASSIGNED',
  INVALID_ORDER_STATUS = 'INVALID_ORDER_STATUS',
  NO_AVAILABLE_EXECUTORS = 'NO_AVAILABLE_EXECUTORS',
  CANNOT_ACCEPT_ORDER = 'CANNOT_ACCEPT_ORDER',
  CANNOT_COMPLETE_ORDER = 'CANNOT_COMPLETE_ORDER',

  // Payment errors
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',
  INVALID_PAYMENT_METHOD = 'INVALID_PAYMENT_METHOD',
  PAYMENT_ALREADY_PROCESSED = 'PAYMENT_ALREADY_PROCESSED',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_INPUT = 'INVALID_INPUT',

  // Permission errors
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // Resource errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',

  // Server errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',

  // Rate limiting
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
}

/**
 * Базовый класс для ошибок приложения
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);

    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this);
  }
}

/**
 * Ошибка валидации (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(ErrorCode.VALIDATION_ERROR, message, 400, true, details);
  }
}

/**
 * Ошибка аутентификации (401)
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Необходима авторизация', code: ErrorCode = ErrorCode.UNAUTHORIZED) {
    super(code, message, 401, true);
  }
}

/**
 * Ошибка доступа (403)
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Доступ запрещен', code: ErrorCode = ErrorCode.FORBIDDEN) {
    super(code, message, 403, true);
  }
}

/**
 * Ресурс не найден (404)
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Ресурс не найден', code: ErrorCode = ErrorCode.RESOURCE_NOT_FOUND) {
    super(code, message, 404, true);
  }
}

/**
 * Конфликт (409)
 */
export class ConflictError extends AppError {
  constructor(message: string, code: ErrorCode = ErrorCode.RESOURCE_ALREADY_EXISTS) {
    super(code, message, 409, true);
  }
}

/**
 * Слишком много запросов (429)
 */
export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Слишком много запросов. Попробуйте позже') {
    super(ErrorCode.TOO_MANY_REQUESTS, message, 429, true);
  }
}

/**
 * Внутренняя ошибка сервера (500)
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Внутренняя ошибка сервера', details?: any) {
    super(ErrorCode.INTERNAL_SERVER_ERROR, message, 500, false, details);
  }
}

/**
 * Сервис недоступен (503)
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Сервис временно недоступен') {
    super(ErrorCode.SERVICE_UNAVAILABLE, message, 503, true);
  }
}
