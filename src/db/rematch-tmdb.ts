// Conservative re-match pass for likely-wrong TMDB matches.
//
// For every movie whose stored title no longer matches its TMDB record (the
// audit's "flagged" set), re-run the title-gated matcher. The policy is
// precision-first:
//   - the matcher returns a confident, DIFFERENT id  → fix it (update all TMDB
//     fields + re-derive Letterboxd)
//   - it returns null (no title-confident match)      → LEAVE the current id and
//     list it for manual review
// Because the matcher only returns a result when the title actually matches, a
// currently-correct-but-flagged movie (e.g. "Sam Raimi's The Evil Dead", a
// National Theatre Live screening) yields null and is never touched. So this
// auto-fixes the clearly-fixable wrong matches (Jaws, WALL-E, Minions, …) with
// no risk to the correct ones.
//
// Dry-run by default; pass --apply to write. Run on prod (no tsx there):
//   fly ssh console -a movieclock -C "node dist/db/rematch-tmdb.js"          # dry run
//   fly ssh console -a movieclock -C "node dist/db/rematch-tmdb.js --apply"  # apply

import 'dotenv/config';
import { db, closeDb } from './connection.js';
import { tmdbDetailsToMovieFields } from '../utils/tmdb.js';
import { searchLetterboxdByTmdbId } from '../utils/letterboxd.js';
import { currentTitleMatchesStored, findGatedTMDBMatch } from '../utils/tmdb-match.js';

const SLEEP_MS = 120;
const APPLY = process.argv.includes('--apply');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rematch() {
  if (!process.env.TMDB_API_TOKEN) {
    console.error('TMDB_API_TOKEN not set — cannot re-match.');
    process.exit(1);
  }

  const movies = await db
    .selectFrom('movie')
    .select(['id', 'title', 'tmdb_id', 'year', 'runtime'])
    .where('tmdb_id', 'is not', null)
    .orderBy('id', 'asc')
    .execute();

  console.log(
    `Re-matching ${movies.length} movies (${APPLY ? 'APPLY' : 'DRY RUN'})...\n` +
      `Only flagged movies with a confident, different match are changed.\n`,
  );

  const fixes: string[] = [];
  const manual: string[] = [];
  const collisions: string[] = [];
  let processed = 0;

  for (const movie of movies) {
    const tmdbId = movie.tmdb_id as number;
    const { matches } = await currentTitleMatchesStored(movie.title, tmdbId);
    await sleep(SLEEP_MS);
    processed++;
    if (processed % 100 === 0) console.log(`  ...${processed}/${movies.length}`);

    if (matches) continue; // not flagged — current match is fine

    const proposed = await findGatedTMDBMatch(movie.title, movie.year, movie.runtime);
    await sleep(SLEEP_MS);

    if (!proposed || proposed.id === tmdbId) {
      manual.push(`#${movie.id} "${movie.title}" (current tmdb#${tmdbId})`);
      continue;
    }

    // Don't steal an id another movie already owns — that would violate the
    // unique tmdb_id index and really means the correct film exists as its own
    // row (a merge, which we leave for manual handling).
    const owner = await db
      .selectFrom('movie')
      .select('id')
      .where('tmdb_id', '=', proposed.id)
      .where('id', '!=', movie.id)
      .executeTakeFirst();
    if (owner) {
      collisions.push(
        `#${movie.id} "${movie.title}" → tmdb#${proposed.id} "${proposed.title}" (already on movie #${owner.id})`,
      );
      continue;
    }

    const line = `#${movie.id} "${movie.title}"  tmdb#${tmdbId} → tmdb#${proposed.id} "${proposed.title}"`;
    fixes.push(line);

    if (APPLY) {
      const fields = tmdbDetailsToMovieFields(proposed);
      const letterboxdUrl = await searchLetterboxdByTmdbId(proposed.id);
      await db
        .updateTable('movie')
        .set({ ...fields, letterboxd_url: letterboxdUrl })
        .where('id', '=', movie.id)
        .execute();
      console.log(`  ✓ ${line}`);
    }
  }

  console.log(`\n=== ${APPLY ? 'FIXED' : 'WOULD FIX'} (${fixes.length}) ===`);
  for (const f of fixes) console.log(`  ${f}`);

  console.log(`\n=== LEFT FOR MANUAL REVIEW (${manual.length}) ===`);
  for (const m of manual) console.log(`  ${m}`);

  if (collisions.length) {
    console.log(`\n=== SKIPPED — id already owned, needs a merge (${collisions.length}) ===`);
    for (const c of collisions) console.log(`  ${c}`);
  }

  console.log(
    `\nSummary: ${fixes.length} ${APPLY ? 'fixed' : 'fixable'}, ${manual.length} manual, ` +
      `${collisions.length} collisions. ${APPLY ? '' : 'Re-run with --apply to write.'}`,
  );
}

rematch()
  .catch((err) => {
    console.error('Re-match failed:', err);
    process.exitCode = 1;
  })
  .finally(closeDb);
