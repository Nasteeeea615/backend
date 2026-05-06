/**
 * CORS Middleware Configuration
 * 
 * Настройка Cross-Origin Resource Sharing для безопасного
 * взаимодействия между frontend и backend
 */

import cors from 'cors';
import { Request } from 'express';

// Разрешенные origins для разных окружений
const allowedOrigins = {
    development: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:5173',
    ],
    staging: [
        'https://staging.yourdomain.com',
        'https://admin-staging.yourdomain.com',
        'http://localhost:3002', // для локального тестирования
        'http://localhost:3003',
    ],
    production: [
        'https://yourdomain.com',
        'https://www.yourdomain.com',
        'https://admin.yourdomain.com',
        'https://api.yourdomain.com',
    ],
};

// Получение списка разрешенных origins для текущего окружения
const getAllowedOrigins = (): string[] => {
    const env = process.env.NODE_ENV || 'development';
    return allowedOrigins[env as keyof typeof allowedOrigins] || allowedOrigins.development;
};

// CORS Options
const corsOptions: cors.CorsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        const allowed = getAllowedOrigins();
        
        // Разрешить запросы без origin (например, mobile apps, Postman)
        if (!origin) {
            return callback(null, true);
        }
        
        // Проверка origin в whitelist
        if (allowed.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Blocked request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    
    // Разрешенные HTTP методы
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    
    // Разрешенные заголовки
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'X-HTTP-Method-Override',
        'Accept',
        'Origin',
    ],
    
    // Заголовки, которые можно читать в браузере
    exposedHeaders: [
        'Content-Length',
        'Content-Type',
        'X-Request-Id',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
    ],
    
    // Разрешить отправку cookies и credentials
    credentials: true,
    
    // Кэширование preflight запросов (24 часа)
    maxAge: 86400,
    
    // Preflight continue
    preflightContinue: false,
    
    // Success status для OPTIONS
    optionsSuccessStatus: 204,
};

// Middleware для логирования CORS запросов
export const corsLogger = (req: Request, _res: any, next: any) => {
    const origin = req.headers.origin;
    const method = req.method;
    
    if (method === 'OPTIONS') {
        console.log(`[CORS] Preflight request from: ${origin}`);
    } else if (origin) {
        console.log(`[CORS] Request from: ${origin} - ${method} ${req.path}`);
    }
    
    next();
};

// Экспорт настроенного CORS middleware
export const corsMiddleware = cors(corsOptions);

// Экспорт для тестирования
export { getAllowedOrigins, corsOptions };
