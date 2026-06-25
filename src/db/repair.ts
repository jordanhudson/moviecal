// Repair script: backfill missing TMDB data and retry failed TMDB matches.
//
// Pass 1: Movies with a tmdb_id but missing fields — re-fetch details and fill gaps.
// Pass 2: Movies with no tmdb_id — retry TMDB search (title may have been cleaned
//         since the original failed search).
//
// Usage: npm run repair

import 'dotenv/config';
import { db, closeDb } from './connection.js';
import { getTMDBMovieDetails, tmdbDetailsToMovieFields, searchTMDBByTitle } from '../utils/tmdb.js';
import { recleanExistingTitles } from '../utils/reclean.js';

async function repair() {
  const apiToken = process.env.TMDB_API_TOKEN;
  if (!apiToken) {
    console.error('TMDB_API_TOKEN not set, cannot repair');
    process.exit(1);
  }

  // Pass 0: Re-clean existing titles (same logic as scrape)
  console.log('Pass 0: Re-cleaning existing movie titles...\n');
  await recleanExistingTitles();
  console.log('');

  // Pass 1: Backfill missing fields for movies that have a TMDB ID
  const incomplete = await db
    .selectFrom('movie')
    .select(['id', 'title', 'tmdb_id', 'poster_url', 'runtime', 'year', 'tmdb_popularity'])
    .where('tmdb_id', 'is not', null)
    .where((eb) =>
      eb.or([
        eb('tmdb_popularity', 'is', null),
        eb('poster_url', 'is', null),
        eb('runtime', 'is', null),
      ]),
    )
    .execute();

  if (incomplete.length > 0) {
    console.log(`Pass 1: ${incomplete.length} movies with TMDB ID missing fields.\n`);
    let repairedCount = 0;

    for (const movie of incomplete) {
      const details = await getTMDBMovieDetails(movie.tmdb_id!);
      if (!details) {
        console.log(`  ✗ ${movie.title} — TMDB fetch failed`);
        continue;
      }

      const fresh = tmdbDetailsToMovieFields(details);
      const updates: Record<string, unknown> = {};

      if (movie.tmdb_popularity === null && fresh.tmdb_popularity != null) {
        updates.tmdb_popularity = fresh.tmdb_popularity;
      }
      if (movie.poster_url === null && fresh.poster_url) {
        updates.poster_url = fresh.poster_url;
      }
      if (movie.runtime === null && fresh.runtime) {
        updates.runtime = fresh.runtime;
      }
      if (movie.year === null && fresh.year) {
        updates.year = fresh.year;
      }

      if (Object.keys(updates).length === 0) continue;

      await db.updateTable('movie').set(updates).where('id', '=', movie.id).execute();

      const fields = Object.keys(updates).join(', ');
      console.log(`  ✓ ${movie.title} — backfilled ${fields}`);
      repairedCount++;
    }

    console.log(`\nPass 1 complete: repaired ${repairedCount}/${incomplete.length}.\n`);
  } else {
    console.log('Pass 1: nothing to backfill.\n');
  }

  // Pass 2: Retry TMDB search for movies with no TMDB match
  const unmatched = await db
    .selectFrom('movie')
    .select(['id', 'title', 'year'])
    .where('tmdb_id', 'is', null)
    .execute();

  if (unmatched.length > 0) {
    console.log(`Pass 2: ${unmatched.length} movies with no TMDB match — retrying search.\n`);
    let foundCount = 0;

    for (const movie of unmatched) {
      const result = await searchTMDBByTitle(movie.title, movie.year);
      if (!result) {
        console.log(`  ✗ ${movie.title} — no TMDB match`);
        continue;
      }

      const details = await getTMDBMovieDetails(result.id);
      if (!details) {
        console.log(`  ✗ ${movie.title} — TMDB details fetch failed`);
        continue;
      }

      // Skip shorts
      if (details.runtime && details.runtime < 60) {
        console.log(`  ✗ ${movie.title} — skipped (short: ${details.runtime} min)`);
        continue;
      }

      const fields = tmdbDetailsToMovieFields(details);
      await db.updateTable('movie').set(fields).where('id', '=', movie.id).execute();

      console.log(`  ✓ ${movie.title} — matched TMDB: ${fields.tmdb_url}`);
      foundCount++;
    }

    console.log(`\nPass 2 complete: found ${foundCount}/${unmatched.length}.\n`);
  } else {
    console.log('Pass 2: all movies have TMDB matches.\n');
  }
}

(async () => {
  try {
    await repair();
  } catch (error) {
    console.error('Fatal error in repair:', error);
    process.exit(1);
  } finally {
    await closeDb();
    process.exit(0);
  }
})();
