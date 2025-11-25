# Безопасность Backend

Документация по настройкам безопасности backend приложения.

## Обзор

Реализованные меры безопасности:
- ✅ HTTPS enforcement
- ✅ Helmet.js для защиты HTTP headers
- ✅ Rate limiting для защиты от DDoS и brute force
- ✅ CORS configuration
- ✅ Input sanitization
- ✅ SQL injection protection
- ✅ NoSQL injection protection
- ✅ XSS protection
- ✅ HPP (HTTP Parameter Pollution) protection
- ✅ Security headers
- ✅ Secure session management

## Helmet.js

Helmet автоматически устанавливает безопасные HTTP headers.

### Настроенные защиты:

**Content Security Policy (CSP)**
- Ограничивает источники контента
- Защищает от XSS атак

**Frameguard**
- Защита от clickjacking
- X-Frame-Options: DENY

**HSTS (HTTP Strict Transport Security)**
- Принудительное использование HTTPS
- max-age: 1 год
- includeSubDomains: true

**Hide Powered-By**
- Скрывает информацию о технологиях сервера

**X-Content-Type-Options**
- Защита от MIME type sniffing
- nosniff

**XSS Filter**
- Включает встроенный XSS фильтр браузера

**Referrer Policy**
- strict-origin-when-cross-origin

### Использование:

```typescript
import { helmetConfig } from './middleware/security';

app.use(helmetConfig);
```

## Rate Limiting

Защита от DDoS атак и brute force.

### Типы лимитов:

**General Limiter** (все запросы)
- 100 запросов за 15 минут с одного IP
- Применяется ко всем endpoints

**Auth Limiter** (аутентификация)
- 5 попыток за 15 минут
- Не считает успешные попытки
- Защита от brute force атак на логин

**Order Limiter** (создание заказов)
- 10 заказов в час
- Предотвращает спам заказами

**API Limiter** (общий API)
- 60 запросов в минуту
- Более мягкий лимит для обычных операций

### Использование:

```typescript
import { authLimiter, orderLimiter, apiLimiter } from './middleware/security';

// Для всего API
app.use('/api', apiLimiter);

// Для аутентификации
app.post('/api/auth/login', authLimiter, loginHandler);

// Для создания заказов
app.post('/api/orders', orderLimiter, createOrderHandler);
```

### Настройка лимитов:

Лимиты можно настроить через переменные окружения:

```env
RATE_LIMIT_WINDOW_MS=900000  # 15 минут
RATE_LIMIT_MAX=100           # максимум запросов
```

## CORS

Контроль доступа к API с разных доменов.

### Настройки:

**Разрешенные origins:**
- Frontend URL (из env)
- Admin URL (из env)
- Expo web (localhost:19006)
- В dev режиме - все origins

**Credentials:**
- Разрешены cookies и авторизационные headers

**Методы:**
- GET, POST, PUT, DELETE, PATCH, OPTIONS

**Headers:**
- Content-Type, Authorization, X-Requested-With, Accept

**Max Age:**
- 24 часа (кэширование preflight запросов)

### Использование:

```typescript
import cors from 'cors';
import { corsOptions } from './middleware/security';

app.use(cors(corsOptions));
```

### Настройка через env:

```env
FRONTEND_URL=https://app.example.com
ADMIN_URL=https://admin.example.com
NODE_ENV=production
```

## Input Sanitization

Очистка входных данных от потенциально опасного контента.

### Защиты:

**NoSQL Injection Protection**
- Удаляет операторы MongoDB ($, .)
- Заменяет на безопасные символы

**XSS Protection**
- Удаляет HTML теги из строк
- Очищает все входные данные (body, query, params)

**HPP Protection**
- Защита от HTTP Parameter Pollution
- Whitelist для параметров-массивов

### Использование:

```typescript
import { sanitizeData, sanitizeInput, preventParameterPollution } from './middleware/security';

// Применить ко всему приложению
app.use(sanitizeData);
app.use(sanitizeInput);
app.use(preventParameterPollution);
```

### Whitelist для HPP:

```typescript
// Параметры, которые могут быть массивами
whitelist: ['status', 'role', 'vehicleCapacity']
```

## SQL Injection Protection

Защита через параметризованные запросы.

### ❌ НЕБЕЗОПАСНО:

```typescript
// Никогда не делайте так!
const query = `SELECT * FROM users WHERE email = '${email}'`;
await db.query(query);
```

### ✅ БЕЗОПАСНО:

```typescript
// Всегда используйте параметризованные запросы
import { query } from './utils/database';

const result = await query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);
```

### Примеры:

```typescript
// SELECT с параметрами
const users = await query(
  'SELECT * FROM users WHERE role = $1 AND is_active = $2',
  ['client', true]
);

// INSERT с возвратом
const newUser = await query(
  'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
  [name, email]
);

// UPDATE
await query(
  'UPDATE orders SET status = $1 WHERE id = $2',
  ['completed', orderId]
);

// DELETE
await query(
  'DELETE FROM sessions WHERE user_id = $1',
  [userId]
);
```

### Транзакции:

```typescript
import { transaction } from './utils/database';

await transaction(async (client) => {
  await client.query('INSERT INTO orders (...) VALUES ($1, $2)', [val1, val2]);
  await client.query('UPDATE users SET ... WHERE id = $1', [userId]);
  // Автоматический COMMIT или ROLLBACK
});
```

## HTTPS Enforcement

Принудительное использование HTTPS в production.

### Настройка:

```typescript
import { enforceHttps } from './middleware/security';

// Применить перед всеми routes
app.use(enforceHttps);
```

### Как работает:

- В production перенаправляет HTTP → HTTPS (301)
- В development не применяется
- Проверяет заголовок x-forwarded-proto (для прокси/load balancer)

### Настройка сервера:

**Nginx:**
```nginx
server {
    listen 80;
    server_name api.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Современные SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Let's Encrypt (бесплатный SSL):**
```bash
# Установка certbot
sudo apt-get install certbot python3-certbot-nginx

# Получение сертификата
sudo certbot --nginx -d api.example.com

# Автоматическое обновление
sudo certbot renew --dry-run
```

## Security Headers

Дополнительные security headers для защиты.

### Установленные headers:

```
Cache-Control: no-store, no-cache, must-revalidate, private (для /auth и /profile)
Pragma: no-cache
Expires: 0
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### Использование:

```typescript
import { securityHeaders } from './middleware/security';

app.use(securityHeaders);
```

## Полная настройка

Пример полной настройки безопасности в app.ts:

```typescript
import express from 'express';
import cors from 'cors';
import {
  helmetConfig,
  corsOptions,
  apiLimiter,
  sanitizeData,
  sanitizeInput,
  preventParameterPollution,
  securityHeaders,
  enforceHttps,
} from './middleware/security';
import { httpLogger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

// 1. HTTPS enforcement (первым!)
app.use(enforceHttps);

// 2. Security headers
app.use(helmetConfig);
app.use(securityHeaders);

// 3. CORS
app.use(cors(corsOptions));

// 4. Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Input sanitization
app.use(sanitizeData);
app.use(sanitizeInput);
app.use(preventParameterPollution);

// 6. Logging
app.use(httpLogger);

// 7. Rate limiting
app.use('/api', apiLimiter);

// 8. Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/orders', orderLimiter, orderRoutes);
// ... другие routes

// 9. Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
```

## Environment Variables

Необходимые переменные окружения для безопасности:

```env
# Node environment
NODE_ENV=production

# URLs
FRONTEND_URL=https://app.example.com
ADMIN_URL=https://admin.example.com

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=septik_db
DB_USER=postgres
DB_PASSWORD=strong_password_here

# JWT
JWT_SECRET=very_strong_secret_key_here
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=another_strong_secret_key
JWT_REFRESH_EXPIRES_IN=7d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info
```

## Best Practices

### 1. Всегда используйте HTTPS в production

```typescript
// ❌ Плохо
const API_URL = 'http://api.example.com';

// ✅ Хорошо
const API_URL = process.env.NODE_ENV === 'production'
  ? 'https://api.example.com'
  : 'http://localhost:3000';
```

### 2. Никогда не храните секреты в коде

```typescript
// ❌ Плохо
const JWT_SECRET = 'my-secret-key';

// ✅ Хорошо
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}
```

### 3. Используйте параметризованные запросы

```typescript
// ❌ Плохо - SQL injection!
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ Хорошо
const query = 'SELECT * FROM users WHERE id = $1';
const result = await db.query(query, [userId]);
```

### 4. Валидируйте все входные данные

```typescript
// ✅ Всегда валидируйте
import { validateBody } from './middleware/validate';
import { createOrderSchema } from './validation/schemas';

app.post('/orders',
  validateBody(createOrderSchema),
  createOrderHandler
);
```

### 5. Логируйте security события

```typescript
// Неудачные попытки входа
logger.warn('Failed login attempt', { phoneNumber, ip });

// Подозрительная активность
logger.warn('Suspicious activity detected', { userId, action });

// Изменения в безопасности
logger.info('Password changed', { userId });
```

### 6. Регулярно обновляйте зависимости

```bash
# Проверка уязвимостей
npm audit

# Автоматическое исправление
npm audit fix

# Обновление зависимостей
npm update
```

### 7. Используйте strong passwords для БД

```bash
# Генерация сильного пароля
openssl rand -base64 32
```

## Security Checklist

- [ ] HTTPS настроен и работает
- [ ] Helmet.js установлен и настроен
- [ ] Rate limiting применен ко всем endpoints
- [ ] CORS правильно настроен
- [ ] Input sanitization включен
- [ ] Все SQL запросы параметризованы
- [ ] JWT секреты сильные и в env
- [ ] Пароли БД сильные
- [ ] Security headers установлены
- [ ] Логирование security событий работает
- [ ] Зависимости обновлены (npm audit)
- [ ] .env файлы в .gitignore
- [ ] Backup БД настроен
- [ ] Мониторинг ошибок настроен (Sentry)
- [ ] SSL сертификаты валидны

## Мониторинг безопасности

### Что отслеживать:

1. **Failed login attempts** - попытки brute force
2. **Rate limit hits** - DDoS атаки
3. **SQL errors** - попытки SQL injection
4. **Unauthorized access** - попытки доступа без авторизации
5. **Suspicious patterns** - необычная активность

### Алерты:

Настройте алерты для:
- Более 10 неудачных попыток входа за минуту
- Превышение rate limits
- Ошибки базы данных
- 500 ошибки сервера

## Incident Response

При обнаружении security инцидента:

1. **Изолировать** - заблокировать IP/пользователя
2. **Логировать** - сохранить все логи
3. **Анализировать** - понять масштаб проблемы
4. **Исправить** - закрыть уязвимость
5. **Уведомить** - сообщить пользователям если нужно
6. **Документировать** - записать инцидент и решение

## Дополнительные ресурсы

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Helmet.js Documentation](https://helmetjs.github.io/)
