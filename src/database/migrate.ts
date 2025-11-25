import fs from 'fs';
import path from 'path';
import pool from '../config/database';

const migrationsDir = path.join(__dirname, 'migrations');

async function runMigrations() {
  try {
    console.log('🔄 Starting database migrations...');

    // Get all migration files
    const files = fs
      .readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      console.log(`📝 Running migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      await pool.query(sql);
      console.log(`✅ Migration completed: ${file}`);
    }

    console.log('✅ All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
