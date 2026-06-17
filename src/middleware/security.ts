import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import { Request, Response, NextFunction } from 'express';

/**
 * Настройка Helmet для защиты HTTP headers
 */
export const helmetConfig = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  // Защита от clickjacking
  frameguard: {
    action: 'deny',
  },
  // Отключить X-Powered-By header
  hidePoweredBy: true,
  // HSTS - принудительное использование HTTPS
  hsts: {
    maxAge: 31536000, // 1 год
    includeSubDomains: true,
    preload: true,
  },
  // Защита от MIME type sniffing
  noSniff: true,
  // Защита от XSS
  xssFilter: true,
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
});

/**
 * Rate Limiting для защиты от DDoS и brute force атак
 */

// Общий rate limiter для всех запросов
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов с одного IP
  message: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Слишком много запросов с вашего IP. Попробуйте позже',
  },
  standardHeaders: true, // Возвращать rate limit info в headers
  legacyHeaders: false,
  // Пропускать успешные запросы (не считать их)
  skipSuccessfulRequests: false,
  // Пропускать неудачные запросы
  skipFailedRequests: false,
});

// Строгий rate limiter для аутентификации (защита от brute force)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // максимум 5 попыток
  message: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Слишком много попыток входа. Попробуйте через 15 минут',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Не считать успешные попытки
});

// Rate limiter для создания заказов
export const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 10, // максимум 10 заказов в час
  message: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Превышен лимит создания заказов. Попробуйте позже',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter для API в целом (более мягкий)
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 минута
  max: 60, // 60 запросов в минуту
  message: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Слишком много запросов. Попробуйте позже',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Sanitization middleware для защиты от NoSQL injection и XSS
 */

// Защита от NoSQL injection (Express 5-compatible, in-place)
export const sanitizeData = (req: Request, _res: Response, next: NextFunction) => {
  const sanitizeNoSql = (value: any): any => {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        value[i] = sanitizeNoSql(value[i]);
      }
      return value;
    }

    if (value !== null && typeof value === 'object') {
      for (const rawKey of Object.keys(value)) {
        const safeKey = rawKey.replace(/\$|\./g, '_');
        const sanitizedValue = sanitizeNoSql(value[rawKey]);

        if (safeKey !== rawKey) {
          delete value[rawKey];
          value[safeKey] = sanitizedValue;
          console.warn(`Sanitized request data: ${rawKey} -> ${safeKey} in ${req.path}`);
        } else {
          value[rawKey] = sanitizedValue;
        }
      }
    }

    return value;
  };

  sanitizeNoSql(req.body);
  sanitizeNoSql(req.query as any);
  sanitizeNoSql(req.params);
  next();
};

// Защита от HTTP Parameter Pollution
export const preventParameterPollution = hpp({
  whitelist: [
    // Параметры, которые могут быть массивами
    'status',
    'role',
    'vehicleCapacity',
  ],
});

/**
 * Input sanitization middleware
 * Очищает входные данные от потенциально опасного контента
 */
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction) => {
  // Рекурсивная функция для очистки объектов in-place
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      // Удаляем HTML теги
      return obj.replace(/<[^>]*>/g, '');
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i += 1) {
        obj[i] = sanitize(obj[i]);
      }
      return obj;
    }
    if (obj !== null && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        obj[key] = sanitize(obj[key]);
      }
      return obj;
    }
    return obj;
  };

  // Очищаем body, query и params
  sanitize(req.body);
  sanitize(req.query as any);
  sanitize(req.params);

  next();
};

/**
 * CORS configuration
 */
export const corsOptions = {
  origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    // Список разрешенных origins
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      process.env.ADMIN_URL || 'http://localhost:3001',
      'http://localhost:19006', // Expo web
    ];

    // В dev режиме разрешаем все origins
    if (process.env.NODE_ENV === 'development') {
      callback(null, true);
      return;
    }

    // Проверяем origin
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Разрешить cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
  maxAge: 86400, // 24 часа
};

/**
 * Security headers middleware
 * Добавляет дополнительные security headers
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Запретить кэширование чувствительных данных
  if (req.path.includes('/auth') || req.path.includes('/profile')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  // Дополнительные security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  next();
};

/**
 * Проверка HTTPS в production
 */
export const enforceHttps = (req: Request, res: Response, next: NextFunction) => {
  // Allow health checks over HTTP
  if (req.path === '/health') {
    return next();
  }

  if (process.env.NODE_ENV === 'production' && !req.secure && req.get('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.get('host')}${req.url}`);
  }
  next();
};
