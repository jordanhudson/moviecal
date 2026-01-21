// Simple migration runner - executes SQL migration files

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  // Use DATABASE_URL if set, otherwise use individual env vars
  const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'moviecal',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
      };
  const pool = new Pool(poolConfig);

  try {
    console.log('Running database migrations...\n');

    // Read the migration file
    const migrationPath = join(__dirname, '../../migrations/001_initial_schema.sql');
    const sql = readFileSync(migrationPath, 'utf-8');

    // Execute the entire migration file as one query
    await pool.query(sql);

    console.log('✓ Migrations completed successfully\n');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
