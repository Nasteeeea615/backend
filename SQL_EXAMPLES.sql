-- ========================================
-- SEPTIK SERVICE APP - SQL EXAMPLES
-- Примеры запросов для работы с БД
-- ========================================

-- ========================================
-- 1. ПРИМЕРЫ - СОЗДАНИЕ ДАННЫХ
-- ========================================

-- Создать клиента
INSERT INTO users (phone_number, name, role)
VALUES ('+7 (999) 123-45-67', 'Иван Петров', 'client')
RETURNING id;

-- Создать исполнителя
INSERT INTO users (phone_number, name, role)
VALUES ('+7 (999) 234-56-78', 'Сергей Иванов', 'executor')
RETURNING id;

-- Заполнить профиль клиента
INSERT INTO client_profiles (user_id, city, street, house_number)
VALUES ('CLIENT_UUID_HERE', 'Москва', 'Ул. Красная', '42');

-- Заполнить профиль исполнителя
INSERT INTO executor_profiles (user_id, vehicle_number, vehicle_capacity, is_verified)
VALUES ('EXECUTOR_UUID_HERE', 'АБ 123 РФ', 5, true);

-- ========================================
-- 2. ПРИМЕРЫ - СОЗДАНИЕ ЗАКАЗОВ
-- ========================================

-- Создать заказ
INSERT INTO orders (
  client_id,
  status,
  vehicle_capacity,
  city,
  street,
  house_number,
  scheduled_date,
  scheduled_time,
  comment,
  is_urgent,
  price
)
VALUES (
  'CLIENT_UUID_HERE',
  'pending',
  5,
  'Москва',
  'Ул. Красная',
  '42',
  CURRENT_DATE + INTERVAL '1 day',
  '10:00:00',
  'Срочно нужна откачка',
  true,
  5000
)
RETURNING id;

-- Принять заказ исполнителем
UPDATE orders
SET 
  status = 'assigned',
  executor_id = 'EXECUTOR_UUID_HERE',
  accepted_at = NOW()
WHERE id = 'ORDER_UUID_HERE';

-- Завершить заказ
UPDATE orders
SET 
  status = 'completed',
  completed_at = NOW()
WHERE id = 'ORDER_UUID_HERE';

-- ========================================
-- 3. ПРИМЕРЫ - ПЛАТЕЖИ
-- ========================================

-- Создать платёж
INSERT INTO payments (
  order_id,
  client_id,
  amount,
  status,
  payment_method,
  idempotency_key
)
VALUES (
  'ORDER_UUID_HERE',
  'CLIENT_UUID_HERE',
  5000,
  'pending',
  '{"type": "card", "last_digits": "1234"}'::jsonb,
  'unique-key-' || gen_random_uuid()
)
RETURNING id;

-- Обновить статус платежа после YooKassa
UPDATE payments
SET 
  status = 'completed',
  yookassa_payment_id = 'yoo_payment_id_123',
  yookassa_status = 'succeeded',
  completed_at = NOW()
WHERE id = 'PAYMENT_UUID_HERE';

-- ========================================
-- 4. ПРИМЕРЫ - ВЫПЛАТЫ И БАЛАНС
-- ========================================

-- Создать запрос на выплату
INSERT INTO withdrawals (
  executor_id,
  amount,
  status,
  destination_type
)
VALUES (
  'EXECUTOR_UUID_HERE',
  2500,
  'pending',
  'yandex_kassa'
)
RETURNING id;

-- Добавить транзакцию баланса
INSERT INTO balance_transactions (
  executor_id,
  type,
  amount,
  balance_before,
  balance_after,
  order_id,
  description
)
VALUES (
  'EXECUTOR_UUID_HERE',
  'order_payment',
  5000,
  0,
  5000,
  'ORDER_UUID_HERE',
  'Платёж за выполненный заказ'
);

-- ========================================
-- 5. ПРИМЕРЫ - ПОДДЕРЖКА И ТИКЕТЫ
-- ========================================

-- Создать тикет поддержки
INSERT INTO tickets (user_id, subject, description, status)
VALUES (
  'CLIENT_UUID_HERE',
  'Проблема с заказом',
  'Исполнитель не приехал вовремя',
  'open'
)
RETURNING id;

-- Добавить сообщение в тикет
INSERT INTO messages (ticket_id, sender_id, sender_role, content)
VALUES (
  'TICKET_UUID_HERE',
  'CLIENT_UUID_HERE',
  'user',
  'Требую компенсацию за ожидание'
);

-- Ответ администратора
INSERT INTO messages (ticket_id, sender_id, sender_role, content)
VALUES (
  'TICKET_UUID_HERE',
  'ADMIN_UUID_HERE',
  'admin',
  'Мы разобрались с ситуацией, вам вернули деньги'
);

-- Закрыть тикет
UPDATE tickets
SET status = 'closed'
WHERE id = 'TICKET_UUID_HERE';

-- ========================================
-- 6. ПРИМЕРЫ - УВЕДОМЛЕНИЯ И FCM
-- ========================================

-- Создать уведомление
INSERT INTO notifications (user_id, type, title, body, data)
VALUES (
  'EXECUTOR_UUID_HERE',
  'new_order',
  'Новый заказ!',
  'У вас новый доступный заказ на сумму 5000 руб.',
  '{"order_id": "ORDER_UUID_HERE", "city": "Москва"}'::jsonb
);

-- Добавить FCM токен для push-уведомлений
INSERT INTO fcm_tokens (user_id, token, device_type, device_id)
VALUES (
  'USER_UUID_HERE',
  'c7klExW83RuaejQr2dHvTa:APA91bGJ5lCdJ...',
  'android',
  'samsung_galaxy_s21'
)
ON CONFLICT (user_id, token) DO UPDATE
SET updated_at = NOW();

-- ========================================
-- 7. ПРИМЕРЫ - ПОИСК И ФИЛЬТРАЦИЯ
-- ========================================

-- Найти все доступные заказы (не назначенные)
SELECT o.id, o.city, o.street, o.vehicle_capacity, o.price, o.scheduled_date
FROM orders o
WHERE o.status = 'pending'
  AND o.scheduled_date >= CURRENT_DATE
ORDER BY o.is_urgent DESC, o.created_at DESC;

-- Найти активных исполнителей в Москве
SELECT 
  u.id,
  u.phone_number,
  u.name,
  ep.vehicle_capacity,
  ep.rating,
  ep.completed_orders_count
FROM users u
JOIN executor_profiles ep ON u.id = ep.user_id
WHERE u.role = 'executor'
  AND ep.is_working = true
  AND u.is_blocked = false
ORDER BY ep.rating DESC;

-- Найти заказы клиента
SELECT o.id, o.status, o.price, o.created_at, u.name as executor_name
FROM orders o
LEFT JOIN users u ON o.executor_id = u.id
WHERE o.client_id = 'CLIENT_UUID_HERE'
ORDER BY o.created_at DESC;

-- Найти неподтвержденные платежи
SELECT p.id, p.amount, p.order_id, o.client_id
FROM payments p
JOIN orders o ON p.order_id = o.id
WHERE p.status = 'pending'
  AND p.created_at < NOW() - INTERVAL '1 hour';

-- ========================================
-- 8. ПРИМЕРЫ - АНАЛИТИКА
-- ========================================

-- Общая статистика заказов
SELECT 
  COUNT(*) as total_orders,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
  COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
  SUM(price) as total_revenue
FROM orders;

-- Доход по дням
SELECT 
  DATE(o.completed_at) as date,
  COUNT(*) as orders_count,
  SUM(o.price) as daily_revenue
FROM orders o
WHERE o.status = 'completed'
GROUP BY DATE(o.completed_at)
ORDER BY date DESC
LIMIT 30;

-- Топ исполнителей по рейтингу
SELECT 
  u.name,
  ep.rating,
  ep.completed_orders_count,
  COUNT(o.id) as recent_orders
FROM users u
JOIN executor_profiles ep ON u.id = ep.user_id
LEFT JOIN orders o ON u.id = o.executor_id AND o.created_at > NOW() - INTERVAL '7 days'
WHERE u.role = 'executor'
GROUP BY u.id, u.name, ep.rating, ep.completed_orders_count
ORDER BY ep.rating DESC, ep.completed_orders_count DESC
LIMIT 10;

-- Статистика платежей
SELECT 
  status,
  COUNT(*) as count,
  SUM(amount) as total
FROM payments
GROUP BY status;

-- Онлайн исполнители
SELECT 
  COUNT(*) as online_executors
FROM executor_profiles
WHERE is_working = true;

-- ========================================
-- 9. ПРИМЕРЫ - ОБНОВЛЕНИЯ
-- ========================================

-- Обновить рейтинг исполнителя
UPDATE executor_profiles
SET rating = 4.8,
    completed_orders_count = completed_orders_count + 1
WHERE user_id = 'EXECUTOR_UUID_HERE';

-- Заблокировать пользователя
UPDATE users
SET is_blocked = true
WHERE id = 'USER_UUID_HERE';

-- Отметить уведомления как прочитанные
UPDATE notifications
SET is_read = true
WHERE user_id = 'USER_UUID_HERE'
  AND is_read = false;

-- ========================================
-- 10. ПРИМЕРЫ - УДАЛЕНИЕ
-- ========================================

-- Удалить неиспользуемый FCM токен
DELETE FROM fcm_tokens
WHERE is_active = false
  AND updated_at < NOW() - INTERVAL '30 days';

-- Очистить старые логи вебхуков
DELETE FROM webhook_logs
WHERE processed = true
  AND created_at < NOW() - INTERVAL '90 days';

-- ========================================
-- 11. ПРИМЕРЫ - ПРОВЕРКА КОНСИСТЕНТНОСТИ
-- ========================================

-- Найти неактивные заказы (без исполнителя, но не в статусе pending)
SELECT o.id, o.status, o.client_id, o.executor_id
FROM orders o
WHERE o.executor_id IS NULL
  AND o.status != 'pending'
  AND o.status != 'cancelled';

-- Найти платежи без соответствующих заказов
SELECT p.id, p.order_id
FROM payments p
LEFT JOIN orders o ON p.order_id = o.id
WHERE o.id IS NULL;

-- Найти пользователей без профилей
SELECT u.id, u.phone_number, u.role
FROM users u
WHERE u.role = 'client' AND NOT EXISTS (SELECT 1 FROM client_profiles WHERE user_id = u.id)
  OR u.role = 'executor' AND NOT EXISTS (SELECT 1 FROM executor_profiles WHERE user_id = u.id);

-- ========================================
-- 12. ПРИМЕРЫ - ПРОИЗВОДИТЕЛЬНОСТЬ
-- ========================================

-- Размер таблиц
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Кэш производительность индексов
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- ========================================
-- NOTES:
-- 1. Замени UUID на реальные значения при выполнении
-- 2. Используйте RETURNING для получения созданных ID
-- 3. Все TIMESTAMP автоматически устанавливаются на NOW()
-- 4. Индексы автоматически используются для повышения производительности
-- ========================================
