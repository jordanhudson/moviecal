// Drop all tables from the database

import 'dotenv/config';
import { db, closeDb } from './connection.js';
import { sql } from 'kysely';

async function dropTables() {
  try {
    console.log('Dropping tables...\n');

    // Drop screening table first (due to foreign key constraint)
    await sql`DROP TABLE IF EXISTS screening CASCADE`.execute(db);
    console.log('✓ Dropped screening table');

    // Drop movie table
    await sql`DROP TABLE IF EXISTS movie CASCADE`.execute(db);
    console.log('✓ Dropped movie table');

    console.log('\nAll tables dropped successfully');

  } catch (error) {
    console.error('Error dropping tables:', error);
    process.exit(1);
  } finally {
    await closeDb();
    process.exit(0);
  }
}

dropTables();
