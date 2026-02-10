# Production Setup Guide

## Предварительные требования

- Node.js 18+
- PostgreSQL 15+
- Redis (опционально, есть fallback)
- YooKassa аккаунт (для платежей)
- Firebase проект (для push-уведомлений)

## Шаг 1: Установка зависимостей

```bash
cd backend
npm install
```

## Шаг 2: Настройка базы данных

1. Создайте базу данных PostgreSQL:
```sql
CREATE DATABASE septik_service;
```

2. Создайте пользователя (опционально):
```sql
CREATE USER septik_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE septik_service TO septik_user;
```

## Шаг 3: Настройка Environment Variables

1. Скопируйте `.env.example` в `.env`:
```bash
cp .env.example .env
```

2. Заполните обязательные переменные:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=septik_service
DB_USER=postgres
DB_PASSWORD=your_secure_password

# JWT (сгенерируйте случайную строку)
JWT_SECRET=your_very_long_random_secret_key_change_this_in_production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

3. Настройте YooKassa (см. [YooKassa Setup](#yookassa-setup))

4. Настройте Firebase (см. [Firebase Setup](./FIREBASE_SETUP.md))

## Шаг 4: Запуск миграций

```bash
npm run migrate
```

Это создаст все необходимые таблицы:
- users
- client_profiles
- executor_profiles
- orders
- payments
- withdrawals
- balance_transactions
- fcm_tokens
- notifications
- support_tickets
- ticket_messages
- webhook_logs

## Шаг 5: Запуск сервера

### Development:
```bash
npm run dev
```

### Production:
```bash
npm run build
npm start
```

## Шаг 6: Проверка работоспособности

Откройте в браузере: `http://localhost:3000/health`

Вы должны увидеть:
```json
{
  "status": "ok",
  "message": "Server is running",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "database": "connected",
    "firebase": "initialized",
    "yookassa": "configured"
  }
}
```

## YooKassa Setup

### 1. Регистрация

1. Перейдите на [yookassa.ru](https://yookassa.ru/)
2. Зарегистрируйтесь как юридическое лицо или ИП
3. Пройдите верификацию

### 2. Получение credentials

1. Войдите в [личный кабинет](https://yookassa.ru/my)
2. Перейдите в **Настройки** → **Интеграция**
3. Скопируйте:
   - **shopId** (идентификатор магазина)
   - **Секретный ключ** (нажмите "Показать")

### 3. Настройка в .env

```env
YOOKASSA_SHOP_ID=123456
YOOKASSA_SECRET_KEY=live_xxxxxxxxxxxxxxxxxxxxxxxx
YOOKASSA_API_URL=https://api.yookassa.ru/v3
YOOKASSA_RETURN_URL=septikservice://payment/return
```

### 4. Настройка Webhook

1. В личном кабинете YooKassa перейдите в **Настройки** → **Уведомления**
2. Добавьте URL: `https://your-domain.com/api/webhooks/yookassa`
3. Выберите события:
   - `payment.succeeded`
   - `payment.canceled`
   - `refund.succeeded`

### 5. Тестирование

Используйте тестовые карты:
- **Успешная оплата:** 5555 5555 5555 4477
- **Отклонена:** 5555 5555 5555 5599
- **3DS:** 5555 5555 5555 4444

## Firebase Setup

См. подробную инструкцию в [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)

Краткая версия:
1. Создайте проект в [Firebase Console](https://console.firebase.google.com/)
2. Получите Service Account JSON
3. Добавьте в `.env`:
```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

## Redis Setup (опционально)

### Локальная установка:

**Windows:**
```bash
# Используйте WSL или Docker
docker run -d -p 6379:6379 redis:alpine
```

**Linux/Mac:**
```bash
# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# Mac
brew install redis
brew services start redis
```

### Настройка в .env:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

**Примечание:** Если Redis не настроен, система автоматически использует in-memory cache.

## Безопасность

### Обязательно в Production:

1. **Смените JWT_SECRET** на длинную случайную строку:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

2. **Используйте HTTPS** для всех запросов

3. **Настройте CORS** только для вашего домена:
```typescript
app.use(cors({
  origin: 'https://your-domain.com',
  credentials: true
}));
```

4. **Настройте Rate Limiting** (уже включен)

5. **Регулярно обновляйте зависимости**:
```bash
npm audit
npm audit fix
```

6. **Не коммитьте .env** в git (уже в .gitignore)

## Мониторинг

### Логи

Логи сохраняются в:
- `error.log` - только ошибки
- `combined.log` - все логи

### Health Check

Настройте мониторинг endpoint `/health`:
```bash
curl http://localhost:3000/health
```

### Метрики

Рекомендуется настроить:
- Uptime monitoring (UptimeRobot, Pingdom)
- Error tracking (Sentry)
- Performance monitoring (New Relic, DataDog)

## Troubleshooting

### Ошибка подключения к БД

```
❌ Failed to start server: connect ECONNREFUSED
```

**Решение:**
1. Проверьте что PostgreSQL запущен
2. Проверьте credentials в `.env`
3. Проверьте что база данных создана

### Firebase не инициализируется

```
⚠️ Firebase Admin SDK not initialized
```

**Решение:**
1. Проверьте формат `FIREBASE_SERVICE_ACCOUNT` (должен быть валидный JSON в одну строку)
2. Убедитесь что все поля присутствуют (project_id, private_key, client_email)
3. Проверьте что нет лишних пробелов

### YooKassa ошибки

```
PAYMENT_CREATION_FAILED
```

**Решение:**
1. Проверьте что `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY` правильные
2. Убедитесь что используете правильный ключ (test/live)
3. Проверьте что магазин активирован в YooKassa

## Deployment

### Docker (рекомендуется)

```bash
# Build
docker build -t septik-backend .

# Run
docker run -p 3000:3000 --env-file .env septik-backend
```

### PM2 (для VPS)

```bash
# Install PM2
npm install -g pm2

# Start
pm2 start dist/index.js --name septik-backend

# Monitor
pm2 monit

# Logs
pm2 logs septik-backend

# Restart
pm2 restart septik-backend
```

### Systemd (для Linux)

Создайте `/etc/systemd/system/septik-backend.service`:
```ini
[Unit]
Description=Septik Service Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/septik-backend
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Запустите:
```bash
sudo systemctl enable septik-backend
sudo systemctl start septik-backend
sudo systemctl status septik-backend
```

## Поддержка

Если возникли проблемы:
1. Проверьте логи: `tail -f combined.log`
2. Проверьте health check: `curl http://localhost:3000/health`
3. Проверьте environment variables: все ли заполнены?
4. Проверьте документацию: README.md, FIREBASE_SETUP.md
