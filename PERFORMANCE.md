# Оптимизация производительности Backend

Руководство по оптимизации производительности backend приложения.

## Обзор

Реализованные оптимизации:
- ✅ Redis кэширование
- ✅ Connection pooling для PostgreSQL
- ✅ Pagination для списков
- ✅ SQL query optimization
- ✅ Database indexing
- ✅ Query analysis tools

## Redis Кэширование

### Установка и настройка

```bash
# Установка Redis
npm install redis ioredis

# Запуск Redis (Docker)
docker run -d -p 6379:6379 redis:alpine

# Или установка локально
# Ubuntu: sudo apt-get install redis-server
# macOS: brew install redis
```

### Использование CacheService

```typescript
import { cache, CacheKeys, CacheTTL } from './utils/cache';

// Простое кэширование
await cache.set('key', { data: 'value' }, CacheTTL.MEDIUM);
const value = await cache.get('key');

// Cache-aside pattern
const user = await cache.getOrSet(
  CacheKeys.user(userId),
  async () => {
    return await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  },
  CacheTTL.LONG
);

// Инвалидация кэша
await cache.del(CacheKeys.user(userId));
await cache.delPattern('user:*'); // Удалить все ключи пользователей
```

### Стратегии кэширования

**1. Cache-Aside (Lazy Loading)**
```typescript
// Приложение проверяет кэш перед БД
const getUser = async (id: string) => {
  return await cache.getOrSet(
    CacheKeys.user(id),
    () => db.users.findById(id),
    CacheTTL.LONG
  );
};
```

**2. Write-Through**
```typescript
// Запись одновременно в кэш и БД
const updateUser = async (id: string, data: any) => {
  const user = await db.users.update(id, data);
  await cache.set(CacheKeys.user(id), user, CacheTTL.LONG);
  return user;
};
```

**3. Write-Behind (Write-Back)**
```typescript
// Запись сначала в кэш, потом асинхронно в БД
const updateUserAsync = async (id: string, data: any) => {
  await cache.set(CacheKeys.user(id), data, CacheTTL.SHORT);
  // Асинхронная запись в БД через очередь
  await queue.add('update-user', { id, data });
};
```

### Что кэшировать

**✅ Хорошие кандидаты:**
- Данные пользователей
- Справочники и настройки
- Результаты сложных вычислений
- Статистика и аналитика
- Часто запрашиваемые данные

**❌ Не кэшировать:**
- Данные в реальном времени
- Персональные финансовые данные
- Данные с высокой частотой изменений
- Большие объемы данных

### TTL (Time To Live)

```typescript
export const CacheTTL = {
  SHORT: 60,      // 1 минута - для часто меняющихся данных
  MEDIUM: 300,    // 5 минут - для умеренно меняющихся данных
  LONG: 3600,     // 1 час - для редко меняющихся данных
  DAY: 86400,     // 24 часа - для статических данных
  WEEK: 604800,   // 7 дней - для справочников
};
```

## Connection Pooling

### Настройка PostgreSQL Pool

```typescript
const pool = new Pool({
  max: 20,                    // Максимум соединений
  min: 2,                     // Минимум соединений (всегда активны)
  idleTimeoutMillis: 30000,   // Закрывать неактивные через 30 сек
  connectionTimeoutMillis: 2000, // Таймаут подключения
  statement_timeout: 10000,   // Таймаут выполнения запроса
});
```

### Best Practices

**1. Используйте пул правильно**
```typescript
// ❌ Плохо - создание нового соединения каждый раз
const client = new Client();
await client.connect();
await client.query('SELECT * FROM users');
await client.end();

// ✅ Хорошо - использование пула
const result = await pool.query('SELECT * FROM users');
```

**2. Освобождайте соединения**
```typescript
// Для транзакций
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('INSERT ...');
  await client.query('UPDATE ...');
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release(); // Важно!
}
```

**3. Мониторинг пула**
```typescript
// Проверка состояния пула
console.log('Total connections:', pool.totalCount);
console.log('Idle connections:', pool.idleCount);
console.log('Waiting requests:', pool.waitingCount);
```

## Pagination

### Использование

```typescript
import { paginationMiddleware, createPaginatedResponse } from './middleware/pagination';

// Применить middleware
router.get('/orders', paginationMiddleware, async (req, res) => {
  const { page, limit, offset } = req.pagination;

  // Получить данные с пагинацией
  const orders = await db.query(
    'SELECT * FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );

  // Получить общее количество
  const totalResult = await db.query('SELECT COUNT(*) FROM orders');
  const total = parseInt(totalResult.rows[0].count);

  // Создать ответ
  const response = createPaginatedResponse(orders.rows, total, page, limit);
  
  res.json(response);
});
```

### Cursor-based Pagination

Для больших датасетов лучше использовать cursor-based pagination:

```typescript
// Вместо OFFSET (медленно на больших данных)
SELECT * FROM orders ORDER BY id LIMIT 20 OFFSET 10000;

// Используйте cursor (быстро)
SELECT * FROM orders WHERE id > $1 ORDER BY id LIMIT 20;
```

## SQL Query Optimization

### Анализ запросов

```typescript
import { explainQuery, getOptimizationRecommendations } from './utils/queryOptimizer';

// Анализ конкретного запроса
await explainQuery(
  'SELECT * FROM orders WHERE status = $1',
  ['pending']
);

// Получить рекомендации
const recommendations = await getOptimizationRecommendations();
console.log('Unused indexes:', recommendations.unusedIndexes);
console.log('Slow queries:', recommendations.slowQueries);
```

### Оптимизация запросов

**1. Используйте индексы**
```sql
-- Создание индексов
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_client_id ON orders(client_id);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- Составной индекс
CREATE INDEX idx_orders_status_date ON orders(status, created_at DESC);

-- Частичный индекс
CREATE INDEX idx_orders_pending ON orders(created_at) WHERE status = 'pending';
```

**2. Избегайте N+1 проблемы**
```typescript
// ❌ Плохо - N+1 запросов
const orders = await db.query('SELECT * FROM orders');
for (const order of orders.rows) {
  const client = await db.query('SELECT * FROM users WHERE id = $1', [order.client_id]);
}

// ✅ Хорошо - один запрос с JOIN
const orders = await db.query(`
  SELECT o.*, u.name as client_name
  FROM orders o
  LEFT JOIN users u ON o.client_id = u.id
`);
```

**3. Выбирайте только нужные поля**
```typescript
// ❌ Плохо - SELECT *
SELECT * FROM orders;

// ✅ Хорошо - только нужные поля
SELECT id, status, created_at FROM orders;
```

**4. Используйте LIMIT**
```typescript
// ❌ Плохо - без лимита
SELECT * FROM orders;

// ✅ Хорошо - с лимитом
SELECT * FROM orders LIMIT 20;
```

**5. Оптимизируйте WHERE условия**
```typescript
// ❌ Плохо - функция в WHERE (не использует индекс)
SELECT * FROM users WHERE LOWER(email) = 'user@example.com';

// ✅ Хорошо - прямое сравнение
SELECT * FROM users WHERE email = 'user@example.com';

// Или создайте функциональный индекс
CREATE INDEX idx_users_email_lower ON users(LOWER(email));
```

### Maintenance

```typescript
// Обновление статистики
await analyzeTable('orders');

// Очистка мертвых строк
await vacuumTable('orders');

// Регулярное обслуживание (cron job)
// 0 2 * * * - каждый день в 2:00
```

## Мониторинг производительности

### Метрики для отслеживания

**Database:**
- Connection pool usage
- Query execution time
- Slow queries (> 1s)
- Cache hit rate
- Index usage

**API:**
- Response time
- Requests per second
- Error rate
- Memory usage
- CPU usage

### Инструменты

**1. pg_stat_statements**
```sql
-- Включить расширение
CREATE EXTENSION pg_stat_statements;

-- Просмотр медленных запросов
SELECT query, calls, mean_time, max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

**2. Redis monitoring**
```bash
# Redis CLI
redis-cli INFO stats
redis-cli SLOWLOG GET 10
```

**3. Application monitoring**
```typescript
import { perfMonitor } from './utils/performance';

// Измерение времени выполнения
perfMonitor.start('api-call');
await fetchData();
const duration = perfMonitor.end('api-call');
```

## Best Practices

### 1. Кэшируйте агрессивно, инвалидируйте аккуратно

```typescript
// Кэшировать
await cache.set(key, data, TTL);

// Инвалидировать при изменении
await updateData();
await cache.del(key);
```

### 2. Используйте batch операции

```typescript
// ❌ Плохо - множество запросов
for (const user of users) {
  await db.query('INSERT INTO users VALUES ($1, $2)', [user.id, user.name]);
}

// ✅ Хорошо - один batch запрос
await db.query(
  'INSERT INTO users (id, name) VALUES ' +
  users.map((_, i) => `($${i*2+1}, $${i*2+2})`).join(','),
  users.flatMap(u => [u.id, u.name])
);
```

### 3. Оптимизируйте JSON операции

```typescript
// ❌ Плохо - парсинг JSON в приложении
const users = await db.query('SELECT data FROM users');
const parsed = users.rows.map(u => JSON.parse(u.data));

// ✅ Хорошо - парсинг в PostgreSQL
const users = await db.query(`
  SELECT data->>'name' as name, data->>'email' as email
  FROM users
`);
```

### 4. Используйте prepared statements

```typescript
// Prepared statements кэшируются и выполняются быстрее
const statement = await pool.prepare('SELECT * FROM users WHERE id = $1');
const result = await statement.execute([userId]);
```

### 5. Мониторьте и профилируйте

```typescript
// Логируйте медленные запросы
if (duration > 1000) {
  logger.warn('Slow query detected', { query, duration });
}
```

## Checklist оптимизации

- [ ] Redis настроен и используется
- [ ] Connection pooling настроен правильно
- [ ] Pagination реализована для всех списков
- [ ] Индексы созданы для часто используемых полей
- [ ] N+1 проблемы устранены
- [ ] SELECT * заменены на конкретные поля
- [ ] Медленные запросы оптимизированы
- [ ] EXPLAIN ANALYZE выполнен для критичных запросов
- [ ] Кэш инвалидируется при изменениях
- [ ] Мониторинг производительности настроен
- [ ] Регулярное обслуживание БД настроено

## Дополнительные ресурсы

- [PostgreSQL Performance Tips](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Redis Best Practices](https://redis.io/topics/optimization)
- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)
