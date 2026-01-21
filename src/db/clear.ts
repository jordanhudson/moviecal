// Clear all data from the database

import 'dotenv/config';
import { db, closeDb } from './connection.js';

async function clearDatabase() {
  try {
    console.log('Clearing database...\n');

    // Delete all screenings first (due to foreign key constraint)
    const screeningsResult = await db
      .deleteFrom('screening')
      .execute();
    console.log('✓ Deleted all screenings');

    // Delete all movies
    const moviesResult = await db
      .deleteFrom('movie')
      .execute();
    console.log('✓ Deleted all movies');

    console.log('\nDatabase cleared successfully');

  } catch (error) {
    console.error('Error clearing database:', error);
    process.exit(1);
  } finally {
    await closeDb();
    process.exit(0);
  }
}

clearDatabase();
