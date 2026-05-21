import { Pool } from 'pg';

// Do NOT load .env in production; platform provides env vars directly
// Local .env is only for local development and will interfere with cloud credentials
if (process.env.NODE_ENV !== 'production') {
  const dotenv = require('dotenv');
  dotenv.config();
}

// Включаем SSL только при явном указании DB_SSL=true
const shouldUseSsl = process.env.DB_SSL === 'true';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'septik_service',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  // increased to 30s to avoid timeout errors when connecting to cloud providers (higher latency)
  connectionTimeoutMillis: 30000,
  // Enable SSL for Neon and other cloud databases
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
});

console.log('DB Config:', { host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || '5432', db: process.env.DB_NAME || 'septik_service', ssl: shouldUseSsl });

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;
