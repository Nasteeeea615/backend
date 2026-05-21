/**
 * Rate Limiting Middleware
 * 
 * Защита от:
 * - DDoS атак
 * - Brute-force атак
 * - API abuse
 */

import rateLimit from 'express-rate-limit';
// @ts-ignore - untyped module
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';
import { initRedis, getRedis } from '../utils/cache';

const shouldUseRedisStore = process.env.RATE_LIMIT_STORE === 'redis' || process.env.NODE_ENV === 'production';

// Initialize or reuse the shared Redis client from cache utils when using Redis for rate limiting
let redis: Redis | null = null;
if (shouldUseRedisStore) {
    try {
        // Ensure a single Redis client is initialized for the app
        initRedis();
        redis = getRedis();
        redis.on('error', (err) => {
            console.error('[Rate Limiter] Redis error:', err);
        });

        if ((redis as any).status !== 'ready') {
            console.warn('[Rate Limiter] Redis client not ready, falling back to in-memory store', { status: (redis as any).status });
            redis = null;
        }
    } catch (e: any) {
        console.warn('[Rate Limiter] Failed to initialize shared Redis client, using in-memory store', e?.message || e);
        redis = null;
    }
} else {
    console.warn('[Rate Limiter] Using in-memory store (Redis disabled in this environment)');
}

// Базовая конфигурация
const baseConfig = {
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    
    // Кастомный обработчик ошибок
    handler: (_req: any, res: any) => {
        res.status(429).json({
            success: false,
            error: {
                message: 'Слишком много запросов. Пожалуйста, попробуйте позже.',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: res.getHeader('Retry-After'),
            },
        });
    },
    
    // Пропускать успешные запросы (не считать их в лимите)
    skipSuccessfulRequests: false,
    
    // Пропускать неудачные запросы
    skipFailedRequests: false,
};

const storeCache = new Map<string, any>();

const createRedisStore = (prefix: string) => {
    if (!redis) throw new Error('No redis client');
    if (storeCache.has(prefix)) return storeCache.get(prefix);

    // Prefer passing the shared ioredis client to avoid creating new connections
    const store = new RedisStore({
        client: redis as any,
        prefix,
    } as any);

    storeCache.set(prefix, store);
    return store;
};

const withStore = (prefix: string) => {
    if (!redis) {
        return {};
    }
    // Только если клиент готов
    if ((redis as any).status !== 'ready') {
        return {};
    }
    try {
        return { store: createRedisStore(prefix) };
    } catch (err: any) {
        console.warn('[Rate Limiter] Failed to create RedisStore, using in-memory store', err?.message || err);
        return {};
    }
};

// 1. Глобальный rate limiter (для всех запросов)
export const globalLimiter = rateLimit({
    ...baseConfig,
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 1000, // 1000 запросов на IP
    message: 'Слишком много запросов с вашего IP',
    
    // Использование Redis для распределенного rate limiting
    ...withStore('rl:global:'),
});

// 2. API rate limiter (для /api/* endpoints)
export const apiLimiter = rateLimit({
    ...baseConfig,
    windowMs: 1 * 60 * 1000, // 1 минута
    max: 60, // 60 запросов в минуту
    message: 'Слишком много API запросов',
    
    ...withStore('rl:api:'),
});

// 3. Auth rate limiter (для /api/auth/* endpoints)
export const authLimiter = rateLimit({
    ...baseConfig,
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5, // 5 попыток входа
    message: 'Слишком много попыток входа. Попробуйте через 15 минут.',
    
    // Считать только неудачные попытки
    skipSuccessfulRequests: true,
    
    ...withStore('rl:auth:'),
});

// 4. Registration rate limiter
export const registrationLimiter = rateLimit({
    ...baseConfig,
    windowMs: 60 * 60 * 1000, // 1 час
    max: 3, // 3 регистрации в час с одного IP
    message: 'Слишком много попыток регистрации',
    
    ...withStore('rl:register:'),
});

// 5. Password reset rate limiter
export const passwordResetLimiter = rateLimit({
    ...baseConfig,
    windowMs: 60 * 60 * 1000, // 1 час
    max: 3, // 3 запроса на сброс пароля
    message: 'Слишком много запросов на сброс пароля',
    
    ...withStore('rl:password:'),
});

// 6. Order creation rate limiter
export const orderLimiter = rateLimit({
    ...baseConfig,
    windowMs: 5 * 60 * 1000, // 5 минут
    max: 10, // 10 заказов за 5 минут
    message: 'Слишком много заказов. Подождите немного.',
    
    ...withStore('rl:order:'),
});

// 7. File upload rate limiter
export const uploadLimiter = rateLimit({
    ...baseConfig,
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 20, // 20 загрузок файлов
    message: 'Слишком много загрузок файлов',
    
    ...withStore('rl:upload:'),
});

// 8. Webhook rate limiter (более мягкий)
export const webhookLimiter = rateLimit({
    ...baseConfig,
    windowMs: 1 * 60 * 1000, // 1 минута
    max: 100, // 100 webhook запросов в минуту
    message: 'Слишком много webhook запросов',
    
    ...withStore('rl:webhook:'),
});

// 9. Search rate limiter
export const searchLimiter = rateLimit({
    ...baseConfig,
    windowMs: 1 * 60 * 1000, // 1 минута
    max: 30, // 30 поисковых запросов в минуту
    message: 'Слишком много поисковых запросов',
    
    ...withStore('rl:search:'),
});

// 10. Admin rate limiter (более мягкий для админов)
export const adminLimiter = rateLimit({
    ...baseConfig,
    windowMs: 1 * 60 * 1000, // 1 минута
    max: 120, // 120 запросов в минуту
    message: 'Слишком много запросов',
    
    ...withStore('rl:admin:'),
});

// Middleware для логирования rate limit events
export const rateLimitLogger = (req: any, res: any, next: any) => {
    const originalSend = res.send;
    
    res.send = function (data: any) {
        if (res.statusCode === 429) {
            console.warn('[Rate Limit] Blocked request:', {
                ip: req.ip,
                path: req.path,
                method: req.method,
                userAgent: req.headers['user-agent'],
            });
        }
        
        return originalSend.call(this, data);
    };
    
    next();
};

// Экспорт Redis client для тестирования
export { redis };
