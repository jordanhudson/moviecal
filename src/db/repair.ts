// Repair script: backfill missing TMDB data for movies that have a tmdb_id.
// Re-fetches details from TMDB and fills in any null fields.
//
// Usage: npm run repair

import 'dotenv/config';
import { db, closeDb } from './connection.js';

interface TMDBMovieDetails {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  runtime: number | null;
  popularity?: number;
}

async function getTMDBMovieDetails(tmdbId: number): Promise<TMDBMovieDetails | null> {
  const apiToken = process.env.TMDB_API_TOKEN;
  if (!apiToken) {
    return null;
  }

  try {
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(`  TMDB fetch failed for ID ${tmdbId}: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn(`  Error fetching TMDB details for ID ${tmdbId}:`, error);
    return null;
  }
}

async function repair() {
  const apiToken = process.env.TMDB_API_TOKEN;
  if (!apiToken) {
    console.error('TMDB_API_TOKEN not set, cannot repair');
    process.exit(1);
  }

  // Find movies that have a tmdb_id but are missing data we can backfill
  const movies = await db
    .selectFrom('movie')
    .select(['id', 'title', 'tmdb_id', 'poster_url', 'runtime', 'year', 'tmdb_popularity'])
    .where('tmdb_id', 'is not', null)
    .where((eb) =>
      eb.or([
        eb('tmdb_popularity', 'is', null),
        eb('poster_url', 'is', null),
        eb('runtime', 'is', null),
      ])
    )
    .execute();

  if (movies.length === 0) {
    console.log('Nothing to repair — all movies with TMDB IDs have complete data.');
    return;
  }

  console.log(`Found ${movies.length} movies to repair.\n`);
  let repairedCount = 0;

  for (const movie of movies) {
    const details = await getTMDBMovieDetails(movie.tmdb_id!);
    if (!details) {
      console.log(`  ✗ ${movie.title} — TMDB fetch failed`);
      continue;
    }

    const updates: Record<string, unknown> = {};

    if (movie.tmdb_popularity === null && details.popularity != null) {
      updates.tmdb_popularity = details.popularity;
    }
    if (movie.poster_url === null && details.poster_path) {
      updates.poster_url = `https://image.tmdb.org/t/p/w500${details.poster_path}`;
    }
    if (movie.runtime === null && details.runtime) {
      updates.runtime = details.runtime;
    }
    if (movie.year === null && details.release_date) {
      updates.year = parseInt(details.release_date.substring(0, 4));
    }

    if (Object.keys(updates).length === 0) {
      continue;
    }

    await db
      .updateTable('movie')
      .set(updates)
      .where('id', '=', movie.id)
      .execute();

    const fields = Object.keys(updates).join(', ');
    console.log(`  ✓ ${movie.title} — backfilled ${fields}`);
    repairedCount++;
  }

  console.log(`\nRepaired ${repairedCount}/${movies.length} movies.`);
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
