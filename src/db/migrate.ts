// Migration runner — applies each SQL file in migrations/ exactly once, in a
// transaction, recording applied filenames in a schema_migrations table.
//
// Bootstrapping note: existing databases predate this table, so the first run
// finds it empty and re-applies every file. That is safe because the migrations
// are written to be idempotent (IF NOT EXISTS / IF EXISTS); after this run each
// file is recorded and never runs again.

import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    const appliedRows = await pool.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations',
    );
    const applied = new Set(appliedRows.rows.map((r) => r.filename));

    const migrationsDir = join(__dirname, '../../migrations');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  - ${file} (already applied)`);
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), 'utf-8');

      // Each migration runs in its own transaction so a failure leaves the file
      // unrecorded and the schema unchanged.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
      } finally {
        client.release();
      }

      console.log(`  ✓ ${file}`);
      appliedCount++;
    }

    console.log(
      `\n✓ Migrations completed successfully (${appliedCount} applied, ${files.length - appliedCount} already up to date)\n`,
    );
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
