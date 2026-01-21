// Database connection using Kysely + PostgreSQL

import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

const { Pool } = pg;

// Create pool config - prefer DATABASE_URL if set, otherwise use individual env vars
const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, max: 10 }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'moviecal',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 10,
    };

// Create the database connection
export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool(poolConfig),
  }),
});

// Helper to close the database connection
export async function closeDb() {
  await db.destroy();
}
