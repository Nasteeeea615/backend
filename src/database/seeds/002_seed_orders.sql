-- Insert test orders
INSERT INTO orders (
  id, 
  client_id, 
  executor_id, 
  status, 
  vehicle_capacity, 
  city, 
  street, 
  house_number, 
  scheduled_date, 
  scheduled_time, 
  comment, 
  price,
  created_at,
  accepted_at,
  completed_at
)
VALUES 
  -- Completed order
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000004',
    'completed',
    3,
    'Москва',
    'Ленина',
    '10',
    CURRENT_DATE - INTERVAL '5 days',
    '10:00:00',
    'Нужно выполнить заказ',
    1800,
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days' + INTERVAL '10 minutes',
    NOW() - INTERVAL '5 days' + INTERVAL '2 hours'
  ),
  -- In progress order
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000005',
    'in_progress',
    5,
    'Москва',
    'Пушкина',
    '25',
    CURRENT_DATE,
    '14:00:00',
    'Позвоните за 30 минут',
    3000,
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '1 hour',
    NULL
  ),
  -- Pending order
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000002',
    NULL,
    'pending',
    10,
    'Москва',
    'Ленина',
    '10',
    CURRENT_DATE + INTERVAL '2 days',
    '09:00:00',
    NULL,
    6000,
    NOW() - INTERVAL '30 minutes',
    NULL,
    NULL
  )
ON CONFLICT (id) DO NOTHING;

-- Insert test payment for completed order
INSERT INTO payments (
  id,
  order_id,
  client_id,
  amount,
  status,
  payment_method,
  transaction_id,
  created_at,
  completed_at
)
VALUES 
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    1800,
    'completed',
    '{"type": "card", "card_last4": "1234"}'::jsonb,
    'txn_test_123456',
    NOW() - INTERVAL '5 days' + INTERVAL '2 hours',
    NOW() - INTERVAL '5 days' + INTERVAL '2 hours' + INTERVAL '5 minutes'
  )
ON CONFLICT (id) DO NOTHING;
