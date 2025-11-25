# Обработка ошибок и валидация (Backend)

Документация по системе обработки ошибок и валидации данных на backend.

## Обзор

Система включает:
- **Кастомные классы ошибок** - типизированные ошибки
- **Централизованный error handler** - единая точка обработки
- **Joi валидация** - валидация входных данных
- **Winston logger** - структурированное логирование
- **Async handler** - обработка async ошибок

## Типы ошибок

### Базовый класс AppError

```typescript
import { AppError, ErrorCode } from './types/errors';

throw new AppError(
  ErrorCode.INVALID_INPUT,
  'Неверные данные',
  400,  // HTTP status code
  true, // isOperational (ожидаемая ошибка)
  { field: 'email' } // дополнительные детали
);
```

### Специализированные классы

```typescript
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  InternalServerError,
  ServiceUnavailableError,
} from './types/errors';

// Валидация (400)
throw new ValidationError('Неверный формат email', { field: 'email' });

// Неавторизован (401)
throw new UnauthorizedError('Токен истек');

// Доступ запрещен (403)
throw new ForbiddenError('Недостаточно прав');

// Не найдено (404)
throw new NotFoundError('Заказ не найден');

// Конфликт (409)
throw new ConflictError('Пользователь уже существует');

// Слишком много запросов (429)
throw new TooManyRequestsError();

// Внутренняя ошибка (500)
throw new InternalServerError('Ошибка базы данных', { query: 'SELECT...' });

// Сервис недоступен (503)
throw new ServiceUnavailableError('SMS сервис недоступен');
```

## Error Handler Middleware

### Использование

```typescript
import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

// ... другие middleware и routes

// 404 handler (должен быть перед errorHandler)
app.use(notFoundHandler);

// Error handler (должен быть последним)
app.use(errorHandler);
```

### Что обрабатывает

- Кастомные AppError
- Joi ValidationError
- JWT ошибки (JsonWebTokenError, TokenExpiredError)
- Ошибки базы данных
- Неизвестные ошибки

### Формат ответа

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Ошибка валидации данных",
  "details": [
    {
      "field": "email",
      "message": "Неверный формат email"
    }
  ],
  "stack": "Error: ...\n    at ..." // только в dev режиме
}
```

## Async Handler

Оборачивает async route handlers для автоматической обработки ошибок:

```typescript
import { asyncHandler } from './middleware/errorHandler';

// ❌ Без asyncHandler - нужен try-catch
router.get('/orders', async (req, res) => {
  try {
    const orders = await orderService.getOrders();
    res.json(orders);
  } catch (error) {
    // Нужно вручную передать в next
    next(error);
  }
});

// ✅ С asyncHandler - автоматическая обработка
router.get('/orders', asyncHandler(async (req, res) => {
  const orders = await orderService.getOrders();
  res.json(orders);
}));
```

## Валидация с Joi

### Middleware валидации

```typescript
import { validateBody, validateQuery, validateParams } from './middleware/validate';
import { createOrderSchema } from './validation/schemas';

// Валидация body
router.post('/orders', 
  validateBody(createOrderSchema),
  asyncHandler(async (req, res) => {
    // req.body уже валидирован
    const order = await orderService.createOrder(req.body);
    res.json(order);
  })
);

// Валидация query параметров
router.get('/orders',
  validateQuery(orderFilterSchema),
  asyncHandler(async (req, res) => {
    // req.query валидирован
    const orders = await orderService.getOrders(req.query);
    res.json(orders);
  })
);

// Валидация params
router.get('/orders/:id',
  validateParams(Joi.object({ id: Joi.string().uuid().required() })),
  asyncHandler(async (req, res) => {
    // req.params валидирован
    const order = await orderService.getOrder(req.params.id);
    res.json(order);
  })
);
```

### Доступные схемы

См. `src/validation/schemas.ts`:
- Authentication: `sendSmsSchema`, `verifySmsSchema`, `registerClientSchema`, `registerExecutorSchema`
- Orders: `createOrderSchema`, `updateOrderStatusSchema`
- Profile: `updateProfileSchema`
- Support: `createTicketSchema`, `replyTicketSchema`, `updateTicketStatusSchema`
- Payment: `createPaymentSchema`
- Admin: `assignExecutorSchema`, `blockUserSchema`, `verifyExecutorSchema`
- Filters: `paginationSchema`, `dateRangeSchema`, `orderFilterSchema`, `userFilterSchema`

### Кастомная валидация

```typescript
import Joi from 'joi';

const customSchema = Joi.object({
  email: Joi.string().email().required(),
  age: Joi.number().min(18).max(100).required(),
  role: Joi.string().valid('admin', 'user').required(),
});

router.post('/users', validateBody(customSchema), asyncHandler(async (req, res) => {
  // ...
}));
```

## Логирование

### Winston Logger

```typescript
import logger from './utils/logger';

// Уровни логирования
logger.error('Критическая ошибка', { userId, error });
logger.warn('Предупреждение', { action: 'login_attempt' });
logger.info('Информация', { orderId });
logger.http('HTTP запрос'); // автоматически через middleware
logger.debug('Отладка', { query });
```

### HTTP Logger Middleware

```typescript
import { httpLogger } from './utils/logger';

app.use(httpLogger);
```

Логирует все HTTP запросы:
```
2024-01-15 10:30:45 [http]: GET /api/orders 200 - 45ms
2024-01-15 10:30:46 [warn]: POST /api/orders 400 - 12ms
2024-01-15 10:30:47 [error]: GET /api/orders/123 500 - 234ms
```

### Логи в файлы (Production)

В production логи автоматически пишутся в файлы:
- `logs/combined.log` - все логи
- `logs/error.log` - только ошибки

Ротация файлов:
- Максимальный размер: 5MB
- Максимум файлов: 5

## Примеры использования

### Пример контроллера с обработкой ошибок

```typescript
import { asyncHandler } from '../middleware/errorHandler';
import { NotFoundError, ValidationError } from '../types/errors';
import logger from '../utils/logger';

export const getOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await orderService.getOrder(id);

  if (!order) {
    throw new NotFoundError('Заказ не найден');
  }

  // Проверка прав доступа
  if (order.clientId !== req.user.id && req.user.role !== 'admin') {
    throw new ForbiddenError('Нет доступа к этому заказу');
  }

  logger.info('Order retrieved', { orderId: id, userId: req.user.id });

  res.json(order);
});

export const createOrder = asyncHandler(async (req, res) => {
  const orderData = req.body; // Уже валидирован middleware

  // Дополнительная бизнес-логика валидация
  if (orderData.scheduledDate < new Date()) {
    throw new ValidationError('Дата не может быть в прошлом');
  }

  const order = await orderService.createOrder({
    ...orderData,
    clientId: req.user.id,
  });

  logger.info('Order created', { orderId: order.id, userId: req.user.id });

  res.status(201).json(order);
});
```

### Пример сервиса с обработкой ошибок

```typescript
import { NotFoundError, ConflictError, InternalServerError } from '../types/errors';
import logger from '../utils/logger';

class OrderService {
  async createOrder(data: CreateOrderDTO) {
    try {
      // Проверка на дубликаты
      const existingOrder = await this.findDuplicate(data);
      if (existingOrder) {
        throw new ConflictError('Заказ с такими параметрами уже существует');
      }

      const order = await db.orders.create(data);
      
      logger.info('Order created in database', { orderId: order.id });
      
      return order;
    } catch (error) {
      if (error instanceof AppError) {
        throw error; // Пробрасываем наши ошибки
      }

      // Логируем неожиданные ошибки
      logger.error('Failed to create order', { error, data });
      
      throw new InternalServerError('Не удалось создать заказ', { 
        originalError: error.message 
      });
    }
  }

  async getOrder(id: string) {
    const order = await db.orders.findById(id);
    
    if (!order) {
      throw new NotFoundError('Заказ не найден');
    }

    return order;
  }
}
```

### Пример интеграции с внешним сервисом

```typescript
import axios from 'axios';
import { ServiceUnavailableError } from '../types/errors';
import logger from '../utils/logger';

class SmsService {
  async sendSms(phoneNumber: string, code: string) {
    try {
      await axios.post('https://sms-api.com/send', {
        phone: phoneNumber,
        message: `Ваш код: ${code}`,
      }, {
        timeout: 5000,
      });

      logger.info('SMS sent', { phoneNumber });
    } catch (error) {
      logger.error('Failed to send SMS', { phoneNumber, error });

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new ServiceUnavailableError('SMS сервис не отвечает');
        }
        if (error.response?.status === 429) {
          throw new TooManyRequestsError('Превышен лимит отправки SMS');
        }
      }

      throw new ServiceUnavailableError('Не удалось отправить SMS');
    }
  }
}
```

## Best Practices

### 1. Используйте специализированные классы ошибок

```typescript
// ❌ Плохо
throw new Error('User not found');

// ✅ Хорошо
throw new NotFoundError('Пользователь не найден');
```

### 2. Всегда используйте asyncHandler

```typescript
// ❌ Плохо - ошибки не будут обработаны
router.get('/orders', async (req, res) => {
  const orders = await orderService.getOrders();
  res.json(orders);
});

// ✅ Хорошо
router.get('/orders', asyncHandler(async (req, res) => {
  const orders = await orderService.getOrders();
  res.json(orders);
}));
```

### 3. Валидируйте все входные данные

```typescript
// ✅ Всегда используйте валидацию
router.post('/orders',
  validateBody(createOrderSchema),
  asyncHandler(async (req, res) => {
    // req.body гарантированно валиден
  })
);
```

### 4. Логируйте важные события

```typescript
// Успешные операции
logger.info('Order created', { orderId, userId });

// Предупреждения
logger.warn('Failed login attempt', { phoneNumber, ip });

// Ошибки
logger.error('Database connection failed', { error });
```

### 5. Не раскрывайте внутренние детали в production

```typescript
// ❌ Плохо
throw new InternalServerError(error.stack);

// ✅ Хорошо
logger.error('Database error', { error });
throw new InternalServerError('Ошибка базы данных');
```

### 6. Используйте isOperational для разделения ошибок

```typescript
// Операционные ошибки (ожидаемые) - isOperational: true
throw new ValidationError('Неверный email');
throw new NotFoundError('Заказ не найден');

// Программные ошибки (неожиданные) - isOperational: false
throw new InternalServerError('Unexpected null pointer');
```

## Мониторинг и алерты

### Интеграция с Sentry (опционально)

```typescript
import * as Sentry from '@sentry/node';

// Инициализация
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});

// В error handler
if (!err.isOperational) {
  Sentry.captureException(err);
}
```

### Метрики ошибок

Рекомендуется отслеживать:
- Количество ошибок по типам
- Частота ошибок по endpoints
- Время ответа при ошибках
- Процент успешных/неуспешных запросов

## Тестирование

### Тестирование error handler

```typescript
import request from 'supertest';
import app from './app';

describe('Error Handler', () => {
  it('should return 404 for unknown routes', async () => {
    const response = await request(app).get('/unknown');
    
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('should return 400 for validation errors', async () => {
    const response = await request(app)
      .post('/api/orders')
      .send({ invalidData: true });
    
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});
```

### Тестирование валидации

```typescript
import { createOrderSchema } from './validation/schemas';

describe('Order Validation', () => {
  it('should validate correct order data', () => {
    const validData = {
      vehicleCapacity: 5,
      city: 'Москва',
      street: 'Ленина',
      houseNumber: '1',
      scheduledDate: new Date(),
      scheduledTime: '14:00',
    };

    const { error } = createOrderSchema.validate(validData);
    expect(error).toBeUndefined();
  });

  it('should reject invalid vehicle capacity', () => {
    const invalidData = {
      vehicleCapacity: 7,
    };

    const { error } = createOrderSchema.validate(invalidData);
    expect(error).toBeDefined();
  });
});
```
