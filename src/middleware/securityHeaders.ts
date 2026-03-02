/**
 * Security Headers Middleware
 * 
 * Настройка заголовков безопасности для защиты от:
 * - XSS (Cross-Site Scripting)
 * - Clickjacking
 * - MIME-type sniffing
 * - Information disclosure
 */

import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

// Базовая конфигурация Helmet
export const helmetMiddleware = helmet({
    // Content Security Policy
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline для React
            imgSrc: ["'self'", 'data:', 'https:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            manifestSrc: ["'self'"],
            workerSrc: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            upgradeInsecureRequests: [],
        },
    },
    
    // X-DNS-Prefetch-Control
    dnsPrefetchControl: {
        allow: false,
    },
    
// Expect-CT is deprecated in newer helmet versions; may be skipped
    
    // X-Frame-Options
    frameguard: {
        action: 'deny',
    },
    
    // Hide Powered-By
    hidePoweredBy: true,
    
    // HSTS (HTTP Strict Transport Security)
    hsts: {
        maxAge: 31536000, // 1 год
        includeSubDomains: true,
        preload: true,
    },
    
    // IE No Open
    ieNoOpen: true,
    
    // X-Content-Type-Options
    noSniff: true,
    
    // Permissions Policy
    permittedCrossDomainPolicies: {
        permittedPolicies: 'none',
    },
    
    // Referrer Policy
    referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
    },
    
    // X-XSS-Protection
    xssFilter: true,
});

// Кастомные security headers
export const customSecurityHeaders = (req: Request, res: Response, next: NextFunction) => {
    // Permissions Policy (Feature Policy)
    res.setHeader('Permissions-Policy', [
        'geolocation=(self)',
        'microphone=()',
        'camera=()',
        'payment=(self)',
        'usb=()',
        'magnetometer=()',
        'gyroscope=()',
        'accelerometer=()',
    ].join(', '));
    
    // X-Request-ID для трейсинга
    const requestId = req.headers['x-request-id'] || generateRequestId();
    res.setHeader('X-Request-ID', requestId as string);
    
    // X-Response-Time
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        res.setHeader('X-Response-Time', `${duration}ms`);
    });
    
    next();
};

// Генерация уникального Request ID
function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Security headers для API responses
export const apiSecurityHeaders = (_req: Request, res: Response, next: NextFunction) => {
    // Запретить кэширование для API endpoints
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    // Content-Type для JSON API
    if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    
    next();
};

// Security headers для статических файлов
export const staticSecurityHeaders = (req: Request, res: Response, next: NextFunction) => {
    // Кэширование для статических файлов
    const ext = req.path.split('.').pop();
    const cacheableExtensions = ['js', 'css', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'woff', 'woff2', 'ttf', 'eot'];
    
    if (ext && cacheableExtensions.includes(ext)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    
    next();
};

// Middleware для удаления чувствительных заголовков
export const removeSensitiveHeaders = (_req: Request, res: Response, next: NextFunction) => {
    // Удалить заголовки, которые могут раскрыть информацию о системе
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    res.removeHeader('X-AspNet-Version');
    res.removeHeader('X-AspNetMvc-Version');
    
    next();
};

// CSP Nonce generator для inline scripts
export const cspNonceMiddleware = (_req: Request, res: Response, next: NextFunction) => {
    const nonce = Buffer.from(randomBytes(16)).toString('base64');
    res.locals.cspNonce = nonce;
    
    // Обновить CSP с nonce
    const csp = res.getHeader('Content-Security-Policy') as string;
    if (csp) {
        res.setHeader('Content-Security-Policy', csp.replace("'unsafe-inline'", `'nonce-${nonce}'`));
    }
    
    next();
};

// Логирование security events
export const securityLogger = (req: Request, _res: Response, next: NextFunction) => {
    // Логировать подозрительные запросы
    const suspiciousPatterns = [
        /\.\./,  // Path traversal
        /<script/i,  // XSS
        /union.*select/i,  // SQL injection
        /javascript:/i,  // XSS
        /on\w+=/i,  // Event handlers
    ];
    
    const url = req.url;
    const body = JSON.stringify(req.body);
    
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(url) || pattern.test(body)) {
            console.warn('[Security] Suspicious request detected:', {
                ip: req.ip,
                method: req.method,
                url: req.url,
                userAgent: req.headers['user-agent'],
                pattern: pattern.toString(),
            });
            break;
        }
    }
    
    next();
};

// Экспорт всех middleware
export default {
    helmet: helmetMiddleware,
    custom: customSecurityHeaders,
    api: apiSecurityHeaders,
    static: staticSecurityHeaders,
    removeSensitive: removeSensitiveHeaders,
    cspNonce: cspNonceMiddleware,
    logger: securityLogger,
};
