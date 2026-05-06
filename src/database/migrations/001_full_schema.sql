-- Unified schema migration for Septik Service
-- This file replaces step-by-step SQL migrations for initial DB setup.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Users and profiles
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('client', 'executor', 'admin')),
  is_blocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

CREATE TABLE IF NOT EXISTS client_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  city VARCHAR(100) NOT NULL,
  street VARCHAR(200) NOT NULL,
  house_number VARCHAR(20) NOT NULL,
  saved_payment_methods JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS executor_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vehicle_number VARCHAR(50) NOT NULL,
  vehicle_capacity INTEGER NOT NULL CHECK (vehicle_capacity IN (3, 5, 10)),
  is_verified BOOLEAN DEFAULT FALSE,
  is_working BOOLEAN DEFAULT FALSE,
  rating DECIMAL(3,2) DEFAULT 0.00,
  completed_orders_count INTEGER DEFAULT 0,
  balance DECIMAL(10,2) DEFAULT 0.00
);

CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_executor_profiles_is_working ON executor_profiles(is_working);
CREATE INDEX IF NOT EXISTS idx_executor_profiles_vehicle_capacity ON executor_profiles(vehicle_capacity);
CREATE INDEX IF NOT EXISTS idx_executor_profiles_balance ON executor_profiles(balance);

-- Shared trigger function for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS login_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_codes_email ON login_verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_login_codes_role ON login_verification_codes(role);
CREATE INDEX IF NOT EXISTS idx_login_codes_expires_at ON login_verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_login_codes_is_used ON login_verification_codes(is_used);

-- 2) Orders and payments
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id),
  executor_id UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
  vehicle_capacity INTEGER NOT NULL CHECK (vehicle_capacity IN (3, 5, 10)),
  city VARCHAR(100) NOT NULL,
  street VARCHAR(200) NOT NULL,
  house_number VARCHAR(20) NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  comment TEXT,
  price INTEGER NOT NULL,
  payment_type VARCHAR(20) NOT NULL DEFAULT 'cash' CHECK (payment_type IN ('cash', 'sbp')),
  commission DECIMAL(10,2) DEFAULT 0,
  net_amount DECIMAL(10,2) DEFAULT 0,
  payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  client_id UUID NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL,
  payment_method JSONB NOT NULL,
  transaction_id VARCHAR(100),
  yookassa_payment_id VARCHAR(255),
  yookassa_status VARCHAR(50),
  confirmation_url TEXT,
  idempotency_key VARCHAR(255) UNIQUE,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_executor_id ON orders(executor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_date ON orders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_orders_vehicle_capacity ON orders(vehicle_capacity);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_yookassa_id ON payments(yookassa_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key ON payments(idempotency_key);

ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE orders
ADD CONSTRAINT orders_payment_status_check
CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'cash_collected', 'cancelled'));

ALTER TABLE payments
DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE payments
ADD CONSTRAINT payments_status_check
CHECK (status IN ('pending', 'pending_cash', 'completed', 'failed', 'refunded'));

COMMENT ON COLUMN orders.payment_type IS 'Способ оплаты: cash (наличные) или sbp (Система Быстрых Платежей)';

-- 3) Settlements and webhooks
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executor_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  yookassa_payout_id VARCHAR(255),
  yookassa_status VARCHAR(50),
  destination_type VARCHAR(50),
  destination_data JSONB,
  fee_amount DECIMAL(10,2) DEFAULT 0,
  net_amount DECIMAL(10,2),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executor_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  balance_before DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  payment_id UUID REFERENCES payments(id),
  withdrawal_id UUID REFERENCES withdrawals(id),
  order_id UUID REFERENCES orders(id),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT,
  signature_valid BOOLEAN,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_executor ON withdrawals(executor_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_executor ON balance_transactions(executor_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at);

-- 4) Support, notifications, FCM tokens
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  subject VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('open', 'in_progress', 'closed')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('user', 'admin')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fcm_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  device_type VARCHAR(20) NOT NULL CHECK (device_type IN ('ios', 'android')),
  device_id VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_ticket_id ON messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_is_active ON fcm_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_token ON fcm_tokens(token);

DROP TRIGGER IF EXISTS update_tickets_updated_at ON tickets;
CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fcm_tokens_updated_at ON fcm_tokens;
CREATE TRIGGER update_fcm_tokens_updated_at
  BEFORE UPDATE ON fcm_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
