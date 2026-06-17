# Septik Service Backend

Backend API для приложения заказа услуг по откачке септика на Node.js + Express + TypeScript.

## Структура проекта

```
backend/
├── src/
DB_SSL=false
REDIS_URL=redis://localhost:6379
│   ├── services/       # Бизнес-логика
│   ├── models/         # Модели данных
│   ├── middleware/     # Middleware функции
│   ├── types/          # TypeScript типы
│   ├── utils/          # Утилиты
│   ├── config/         # Конфигурация
│   └── index.ts        # Точка входа
├── dist/               # Скомпилированный код
└── package.json
YOOKASSA_SHOP_ID=516027
YOOKASSA_SECRET_KEY=test_your_secret_key
YOOKASSA_TEST_MODE=true
```

## Установка

```bash
npm install
```

## Настройка

1. Создайте файл `.env` и заполните переменные окружения

2. Настройте переменные окружения в `.env`

### Минимальный набор для email-кода входа

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=septik_service
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=change_me_to_a_long_random_secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SMTP_FROM_EMAIL=no-reply@example.com
LOGIN_CODE_TTL_MINUTES=10
```

3. Создайте базу данных PostgreSQL:
```sql
CREATE DATABASE septik_service;
```

## Запуск

```bash
# Режим разработки с hot reload
npm run dev

# Сборка проекта
npm run build

# Запуск production версии
npm start
```

## Технологии

- **Node.js** + **Express.js** - веб-фреймворк
- **TypeScript** - типизация
- **PostgreSQL** - основная база данных
- **Redis** - кэширование и очереди
- **Socket.io** - real-time коммуникация
- **JWT** - аутентификация
- **bcrypt** - хеширование паролей

## API Endpoints

### Health Check
- `GET /health` - проверка работоспособности сервера

### Authentication
- `POST /api/auth/request-code` - отправка email-кода для входа
- `POST /api/auth/verify-code` - проверка email-кода и создание сессии
- `GET /api/auth/me` - текущий пользователь
- `POST /api/auth/register-client` - регистрация клиента
- `POST /api/auth/register-executor` - регистрация исполнителя
- `POST /api/auth/logout` - выход

Совместимость сохранена: `POST /api/auth/send-sms` и `POST /api/auth/verify-sms` по-прежнему работают как алиасы для email-кода.

### Orders (Client)
- `POST /api/orders` - создание заказа
- `GET /api/orders/my` - мои заказы
- `GET /api/orders/:id` - детали заказа
- `POST /api/orders/:id/pay` - оплата заказа

### Executor
- `POST /api/executor/start-work` - начать работу
- `POST /api/executor/stop-work` - закончить работу
- `GET /api/executor/orders` - доступные заказы
- `POST /api/executor/orders/:id/accept` - принять заказ
- `POST /api/executor/orders/:id/complete` - завершить заказ
- `GET /api/executor/orders/history` - история заказов

### Profile
- `GET /api/profile` - получить профиль
- `PUT /api/profile` - обновить профиль
- `DELETE /api/profile` - удалить аккаунт

### Support
- `POST /api/support/tickets` - создать тикет
- `GET /api/support/tickets` - мои тикеты
- `GET /api/support/tickets/:id` - сообщения тикета

### Notifications
- `GET /api/notifications` - получить уведомления
- `PUT /api/notifications/:id/read` - отметить как прочитанное
- `POST /api/notifications/register-token` - зарегистрировать FCM токен

### Admin
- `GET /api/admin/orders` - все заказы
- `PUT /api/admin/orders/:id` - обновить заказ
- `POST /api/admin/orders/:id/assign` - назначить исполнителя
- `GET /api/admin/users` - все пользователи
- `GET /api/admin/users/:id` - детали пользователя
- `PUT /api/admin/users/:id/block` - заблокировать пользователя
- `PUT /api/admin/users/:id/verify` - верифицировать исполнителя
- `GET /api/admin/payments` - все платежи
- `POST /api/admin/payments/:id/refund` - вернуть платеж
- `GET /api/admin/tickets` - все тикеты
- `POST /api/admin/tickets/:id/reply` - ответить на тикет
- `PUT /api/admin/tickets/:id/status` - изменить статус тикета
- `GET /api/admin/analytics` - аналитика

## Разработка

- Используйте TypeScript для всех новых файлов
- Следуйте структуре папок проекта
- Все ошибки обрабатывайте через AppError
- Используйте asyncHandler для async route handlers
