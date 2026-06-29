// Read-only audit: flag movies whose stored title doesn't match the TMDB record
// their tmdb_id points at — i.e. likely-wrong TMDB matches (the class of bug
// that mapped "Silence of the Lambs" → "Hannibal").
//
// For each movie with a tmdb_id we re-fetch the TMDB record and compare the
// stored title against the TMDB primary title, original title, and registered
// alternative titles (all normalized). A movie that matches NONE of them is
// flagged. Nothing is mutated — fixes go through the existing fix-match modal.
//
// Run on prod (tsx is not available there):
//   fly ssh console -a movieclock -C "node dist/db/audit-tmdb.js"

import 'dotenv/config';
import { db, closeDb } from './connection.js';
import { getTMDBMovieDetails, getAlternativeTitles } from '../utils/tmdb.js';
import { titlesMatch } from '../utils/title-match.js';

const SLEEP_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Flagged {
  id: number;
  storedTitle: string;
  tmdbId: number;
  tmdbTitle: string;
  tmdbOriginalTitle: string | null;
  popularity: number;
  url: string;
}

async function auditTmdbMatches() {
  if (!process.env.TMDB_API_TOKEN) {
    console.error('TMDB_API_TOKEN not set — cannot audit.');
    process.exit(1);
  }

  const movies = await db
    .selectFrom('movie')
    .select(['id', 'title', 'tmdb_id', 'tmdb_url', 'tmdb_popularity'])
    .where('tmdb_id', 'is not', null)
    .orderBy('id', 'asc')
    .execute();

  console.log(`Auditing ${movies.length} movies with a tmdb_id...\n`);

  const flagged: Flagged[] = [];
  let checked = 0;
  let unresolved = 0;

  for (const movie of movies) {
    const tmdbId = movie.tmdb_id as number;
    const details = await getTMDBMovieDetails(tmdbId);
    await sleep(SLEEP_MS);

    if (!details) {
      // Couldn't fetch (deleted id, transient error) — note but don't flag.
      unresolved++;
      continue;
    }
    checked++;

    const candidates = [details.title, details.original_title ?? ''];
    let matched = candidates.some((t) => t && titlesMatch(movie.title, t));

    // Only pay for the alt-titles call when the primary/original didn't match.
    if (!matched) {
      const alts = await getAlternativeTitles(tmdbId);
      await sleep(SLEEP_MS);
      matched = alts.some((t) => titlesMatch(movie.title, t));
    }

    if (!matched) {
      flagged.push({
        id: movie.id,
        storedTitle: movie.title,
        tmdbId,
        tmdbTitle: details.title,
        tmdbOriginalTitle:
          details.original_title && details.original_title !== details.title
            ? details.original_title
            : null,
        popularity: movie.tmdb_popularity ?? 0,
        url: movie.tmdb_url ?? `https://www.themoviedb.org/movie/${tmdbId}`,
      });
    }

    if ((checked + unresolved) % 50 === 0) {
      console.log(`  ...${checked + unresolved}/${movies.length} processed`);
    }
  }

  // Most-visible (popular) suspects first.
  flagged.sort((a, b) => b.popularity - a.popularity);

  console.log(`\n=== ${flagged.length} likely mismatches (of ${checked} resolved) ===\n`);
  for (const f of flagged) {
    const orig = f.tmdbOriginalTitle ? ` (orig "${f.tmdbOriginalTitle}")` : '';
    console.log(
      `#${f.id}  stored "${f.storedTitle}"  →  tmdb#${f.tmdbId} "${f.tmdbTitle}"${orig}  pop=${f.popularity.toFixed(1)}`,
    );
    console.log(`      ${f.url}`);
  }

  console.log(
    `\nSummary: ${movies.length} with tmdb_id, ${checked} resolved, ${unresolved} unresolved, ${flagged.length} flagged.`,
  );
  if (unresolved > 0) {
    console.log(`(${unresolved} couldn't be fetched from TMDB — transient or deleted ids.)`);
  }
}

auditTmdbMatches()
  .catch((err) => {
    console.error('Audit failed:', err);
    process.exitCode = 1;
  })
  .finally(closeDb);
