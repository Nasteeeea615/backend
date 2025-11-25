# Septik Service Backend

Backend API для приложения заказа услуг по откачке септика на Node.js + Express + TypeScript.

## Структура проекта

```
backend/
├── src/
│   ├── routes/         # API маршруты
│   ├── controllers/    # Контроллеры
│   ├── services/       # Бизнес-логика
│   ├── models/         # Модели данных
│   ├── middleware/     # Middleware функции
│   ├── types/          # TypeScript типы
│   ├── utils/          # Утилиты
│   ├── config/         # Конфигурация
│   └── index.ts        # Точка входа
├── dist/               # Скомпилированный код
└── package.json
```

## Установка

```bash
npm install
```

## Настройка

1. Скопируйте `.env.example` в `.env`:
```bash
cp .env.example .env
```

2. Настройте переменные окружения в `.env`

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
- `POST /api/auth/send-sms` - отправка SMS-кода
- `POST /api/auth/verify-sms` - проверка SMS-кода
- `POST /api/auth/register-client` - регистрация клиента
- `POST /api/auth/register-executor` - регистрация исполнителя
- `POST /api/auth/logout` - выход

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
Полная документация: [ADMIN_API.md](./ADMIN_API.md)

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
