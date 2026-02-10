-- Add YooKassa fields to payments table
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS yookassa_payment_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS yookassa_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS confirmation_url TEXT,
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_yookassa_id ON payments(yookassa_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key ON payments(idempotency_key);

-- Create withdrawals table for executor payouts
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executor_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  
  -- YooKassa fields
  yookassa_payout_id VARCHAR(255),
  yookassa_status VARCHAR(50),
  
  -- Destination
  destination_type VARCHAR(50),
  destination_data JSONB,
  
  -- Fees
  fee_amount DECIMAL(10,2) DEFAULT 0,
  net_amount DECIMAL(10,2),
  
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Create balance_transactions table for tracking executor balance changes
CREATE TABLE IF NOT EXISTS balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executor_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'deposit', 'withdrawal', 'order_payment', 'refund', 'fee'
  amount DECIMAL(10,2) NOT NULL,
  balance_before DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  
  -- References
  payment_id UUID REFERENCES payments(id),
  withdrawal_id UUID REFERENCES withdrawals(id),
  order_id UUID REFERENCES orders(id),
  
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create webhook_logs table for debugging
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL, -- 'yookassa'
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT,
  signature_valid BOOLEAN,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_withdrawals_executor ON withdrawals(executor_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_executor ON balance_transactions(executor_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at);
