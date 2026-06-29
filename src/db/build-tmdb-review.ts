// Populate the tmdb_review work list for the /internal-tmdb-review page.
//
// Runs the audit (which movies' stored titles no longer match their TMDB
// record) and, for each flagged movie, records the current (likely-wrong) match
// plus TMDB's top-result suggestion. The table is rebuilt from scratch each run.
//
// Run AFTER rematch-tmdb --apply, so the queue holds only what needs a human.
// On prod (no tsx there):
//   fly ssh console -a movieclock -C "node dist/db/build-tmdb-review.js"

import 'dotenv/config';
import { db, closeDb } from './connection.js';
import { currentTitleMatchesStored, topTMDBSuggestion } from '../utils/tmdb-match.js';

const SLEEP_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function yearOf(releaseDate?: string): number | null {
  return releaseDate ? parseInt(releaseDate.substring(0, 4), 10) : null;
}

async function buildReview() {
  if (!process.env.TMDB_API_TOKEN) {
    console.error('TMDB_API_TOKEN not set — cannot build review list.');
    process.exit(1);
  }

  const movies = await db
    .selectFrom('movie')
    .select(['id', 'title', 'tmdb_id', 'poster_url'])
    .where('tmdb_id', 'is not', null)
    .orderBy('id', 'asc')
    .execute();

  console.log(`Scanning ${movies.length} movies; rebuilding tmdb_review...\n`);

  await db.deleteFrom('tmdb_review').execute();

  let processed = 0;
  let flagged = 0;

  for (const movie of movies) {
    const tmdbId = movie.tmdb_id as number;
    const { matches, details } = await currentTitleMatchesStored(movie.title, tmdbId);
    await sleep(SLEEP_MS);
    processed++;
    if (processed % 100 === 0)
      console.log(`  ...${processed}/${movies.length} (${flagged} flagged)`);

    if (matches || !details) continue;

    const suggestion = await topTMDBSuggestion(movie.title);
    await sleep(SLEEP_MS);

    await db
      .insertInto('tmdb_review')
      .values({
        movie_id: movie.id,
        stored_title: movie.title,
        current_tmdb_id: tmdbId,
        current_title: details.title,
        current_year: yearOf(details.release_date),
        current_poster_url: movie.poster_url,
        suggested_tmdb_id: suggestion?.id ?? null,
        suggested_title: suggestion?.title ?? null,
        suggested_year: suggestion?.year ?? null,
        suggested_poster_url: suggestion?.posterUrl ?? null,
        suggested_overview: suggestion?.overview ?? null,
      })
      .onConflict((oc) => oc.column('movie_id').doNothing())
      .execute();
    flagged++;
  }

  console.log(`\nDone: ${flagged} movies queued for review (of ${movies.length} scanned).`);
}

buildReview()
  .catch((err) => {
    console.error('Build review failed:', err);
    process.exitCode = 1;
  })
  .finally(closeDb);
