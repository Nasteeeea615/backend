/**
 * Типы ошибок приложения
 */
export enum ErrorCode {
  // Authentication errors
  INVALID_PHONE_NUMBER = 'INVALID_PHONE_NUMBER',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_BLOCKED = 'USER_BLOCKED',
  USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  NOT_REGISTERED = 'NOT_REGISTERED',
  TERMS_NOT_AGREED = 'TERMS_NOT_AGREED',
  INVALID_USER_ROLE = 'INVALID_USER_ROLE',

  // Order errors
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  ORDER_ALREADY_ASSIGNED = 'ORDER_ALREADY_ASSIGNED',
  ORDER_NOT_AVAILABLE = 'ORDER_NOT_AVAILABLE',
  INVALID_ORDER_STATUS = 'INVALID_ORDER_STATUS',
  NO_AVAILABLE_EXECUTORS = 'NO_AVAILABLE_EXECUTORS',
  CANNOT_ACCEPT_ORDER = 'CANNOT_ACCEPT_ORDER',
  CANNOT_COMPLETE_ORDER = 'CANNOT_COMPLETE_ORDER',
  ORDER_NOT_COMPLETED = 'ORDER_NOT_COMPLETED',
  INVALID_VEHICLE_CAPACITY = 'INVALID_VEHICLE_CAPACITY',

  // Payment errors
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',
  INVALID_PAYMENT_METHOD = 'INVALID_PAYMENT_METHOD',
  PAYMENT_ALREADY_PROCESSED = 'PAYMENT_ALREADY_PROCESSED',
  PAYMENT_ALREADY_EXISTS = 'PAYMENT_ALREADY_EXISTS',
  PAYMENT_NOT_COMPLETED = 'PAYMENT_NOT_COMPLETED',
  PAYMENT_CREATION_FAILED = 'PAYMENT_CREATION_FAILED',
  PAYMENT_STATUS_FAILED = 'PAYMENT_STATUS_FAILED',
  REFUND_CREATION_FAILED = 'REFUND_CREATION_FAILED',
  PAYOUT_CREATION_FAILED = 'PAYOUT_CREATION_FAILED',

  // Executor errors
  EXECUTOR_NOT_FOUND = 'EXECUTOR_NOT_FOUND',
  EXECUTOR_NOT_VERIFIED = 'EXECUTOR_NOT_VERIFIED',
  INVALID_EXECUTOR = 'INVALID_EXECUTOR',

  // Support ticket errors
  TICKET_NOT_FOUND = 'TICKET_NOT_FOUND',
  TICKET_CREATION_FAILED = 'TICKET_CREATION_FAILED',
  TICKET_FETCH_FAILED = 'TICKET_FETCH_FAILED',
  TICKET_UPDATE_FAILED = 'TICKET_UPDATE_FAILED',
  TICKETS_FETCH_FAILED = 'TICKETS_FETCH_FAILED',
  MESSAGE_ADD_FAILED = 'MESSAGE_ADD_FAILED',
  MESSAGES_FETCH_FAILED = 'MESSAGES_FETCH_FAILED',
  INVALID_STATUS = 'INVALID_STATUS',

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
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    code: string,
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
