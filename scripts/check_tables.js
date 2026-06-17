const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'deploy', 'render_envs_staging_ready.env') });

(async () => {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });

  try {
    const res = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LIMIT 30");
    console.log('Public tables:');
    res.rows.forEach(r => console.log('-', r.tablename));
  } catch (err) {
    console.error('Error querying tables:', err.message || err);
  } finally {
    await pool.end();
  }
})();
