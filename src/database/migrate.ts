import { readFileSync } from 'fs';
import { join } from 'path';
import pool from '../config/database';

/**
 * Run database migrations
 */
async function runMigrations() {
  console.log('🔄 Running database migrations...\n');

  const migrations = [
    '001_full_schema.sql',
  ];

  try {
    for (const migration of migrations) {
      const migrationPath = join(__dirname, 'migrations', migration);
      
      try {
        const sql = readFileSync(migrationPath, 'utf-8');
        
        console.log(`📝 Running migration: ${migration}`);
        await pool.query(sql);
        console.log(`✅ Migration completed: ${migration}\n`);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.log(`⚠️  Migration file not found: ${migration} (skipping)\n`);
        } else {
          console.error(`❌ Error in migration ${migration}:`, error.message);
          throw error;
        }
      }
    }

    console.log('✅ All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
