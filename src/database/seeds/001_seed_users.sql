-- Insert admin user
INSERT INTO users (id, phone_number, name, role, is_blocked)
VALUES 
  ('00000000-0000-0000-0000-000000000001', '+79991111111', 'Admin User', 'admin', false)
ON CONFLICT (phone_number) DO NOTHING;

UPDATE users
SET email = 'admin@septic1.local'
WHERE phone_number = '+79991111111';

-- Insert test clients
INSERT INTO users (id, phone_number, name, role, is_blocked)
VALUES 
  ('00000000-0000-0000-0000-000000000002', '+79991111112', 'Иван Иванов', 'client', false),
  ('00000000-0000-0000-0000-000000000003', '+79991111113', 'Петр Петров', 'client', false)
ON CONFLICT (phone_number) DO NOTHING;

UPDATE users
SET email = CASE phone_number
  WHEN '+79991111112' THEN 'ivan.client@septic1.local'
  WHEN '+79991111113' THEN 'petr.client@septic1.local'
  ELSE email
END
WHERE phone_number IN ('+79991111112', '+79991111113');

-- Insert client profiles
INSERT INTO client_profiles (user_id, city, street, house_number, saved_payment_methods)
VALUES 
  ('00000000-0000-0000-0000-000000000002', 'Москва', 'Ленина', '10', '[]'::jsonb),
  ('00000000-0000-0000-0000-000000000003', 'Москва', 'Пушкина', '25', '[]'::jsonb)
ON CONFLICT (user_id) DO NOTHING;

-- Insert test executors
INSERT INTO users (id, phone_number, name, role, is_blocked)
VALUES 
  ('00000000-0000-0000-0000-000000000004', '+79991111114', 'Сергей Сергеев', 'executor', false),
  ('00000000-0000-0000-0000-000000000005', '+79991111115', 'Алексей Алексеев', 'executor', false),
  ('00000000-0000-0000-0000-000000000006', '+79991111116', 'Дмитрий Дмитриев', 'executor', false)
ON CONFLICT (phone_number) DO NOTHING;

UPDATE users
SET email = CASE phone_number
  WHEN '+79991111114' THEN 'sergey.executor@septic1.local'
  WHEN '+79991111115' THEN 'alexey.executor@septic1.local'
  WHEN '+79991111116' THEN 'dmitry.executor@septic1.local'
  ELSE email
END
WHERE phone_number IN ('+79991111114', '+79991111115', '+79991111116');

-- Insert executor profiles
INSERT INTO executor_profiles (user_id, vehicle_number, vehicle_capacity, is_verified, is_working, rating, completed_orders_count)
VALUES 
  ('00000000-0000-0000-0000-000000000004', 'А123БВ77', 3, true, false, 4.5, 25),
  ('00000000-0000-0000-0000-000000000005', 'В456ГД77', 5, true, false, 4.8, 42),
  ('00000000-0000-0000-0000-000000000006', 'Д789ЕЖ77', 10, true, false, 4.2, 18)
ON CONFLICT (user_id) DO NOTHING;
