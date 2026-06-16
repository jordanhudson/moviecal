// One-off backfill: re-resolve every movie's Letterboxd URL from its TMDB id.
//
// The old slug-guessing search produced many false 'MISS' values. Now that we
// look Letterboxd up via its /tmdb/{id}/ redirect, this walks every movie that
// has a tmdb_id and overwrites letterboxd_url with the canonical URL (or 'MISS'
// when the film genuinely isn't on Letterboxd). Sleeps 500ms between rows to be
// polite to letterboxd.com.
//
// Run on prod (tsx is not available there):
//   fly ssh console -a movieclock -C "node dist/db/backfill-letterboxd.js"

import 'dotenv/config';
import { db, closeDb } from './connection.js';
import { searchLetterboxdByTmdbId } from '../utils/letterboxd.js';

const SLEEP_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfillLetterboxd() {
  const movies = await db
    .selectFrom('movie')
    .select(['id', 'title', 'tmdb_id'])
    .where('tmdb_id', 'is not', null)
    .orderBy('id')
    .execute();

  console.log(`Backfilling Letterboxd URLs for ${movies.length} movies with a TMDB id.\n`);

  let foundCount = 0;
  let missCount = 0;

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    const progress = `[${i + 1}/${movies.length}]`;

    // tmdb_id is guaranteed non-null by the query filter above.
    const url = await searchLetterboxdByTmdbId(movie.tmdb_id!);
    const value = url ?? 'MISS';

    await db
      .updateTable('movie')
      .set({ letterboxd_url: value })
      .where('id', '=', movie.id)
      .execute();

    if (url) {
      foundCount++;
      console.log(`  ${progress} ✓ ${movie.title} — ${url}`);
    } else {
      missCount++;
      console.log(`  ${progress} ✗ ${movie.title} — not on Letterboxd (MISS)`);
    }

    if (i < movies.length - 1) {
      await sleep(SLEEP_MS);
    }
  }

  console.log(`\nDone: ${foundCount} found, ${missCount} miss, ${movies.length} total.`);
}

(async () => {
  try {
    await backfillLetterboxd();
  } catch (error) {
    console.error('Fatal error in backfill-letterboxd:', error);
    process.exit(1);
  } finally {
    await closeDb();
    process.exit(0);
  }
})();
