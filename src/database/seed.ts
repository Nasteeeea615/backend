import fs from 'fs';
import path from 'path';
import pool from '../config/database';

const seedsDir = path.join(__dirname, 'seeds');

async function runSeeds() {
  try {
    console.log('🌱 Starting database seeding...');

    // Get all seed files
    const files = fs
      .readdirSync(seedsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      console.log(`📝 Running seed: ${file}`);
      const filePath = path.join(seedsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      await pool.query(sql);
      console.log(`✅ Seed completed: ${file}`);
    }

    console.log('✅ All seeds completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

runSeeds();
