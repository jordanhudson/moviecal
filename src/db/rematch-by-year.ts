// One-off: re-check TMDB matches against the release year the venues publish.
//
// Until Oct 2026 no scraper filled in a year, so same-titled films were picked
// by TMDB popularity (2007's "Atonement" for a 2026 film, the 1999 "The
// Haunting" for the 1963 one). rematch-tmdb can't catch these — the titles
// match. This scrapes the venues that publish a year, links each scraped
// screening to its DB movie by booking_url, and for every movie whose TMDB
// release year is more than MAX_GAP from the venue's year:
//   - matcher finds a different film near the year → re-point the movie at it
//     (or merge into the row that already owns that tmdb_id)
//   - matcher finds nothing near the year → list it; with --clear-unmatched,
//     drop the TMDB data (no poster beats someone else's poster)
// Movies with no tmdb_id that now match are filled in too.
//
// Dry-run by default. On prod:
//   fly ssh console -a movieclock -C "node dist/db/rematch-by-year.js"
//   fly ssh console -a movieclock -C "node dist/db/rematch-by-year.js --apply"

import 'dotenv/config';
import { db, closeDb } from './connection.js';
import { mergeMovieInto } from './merge-movie.js';
import { getTMDBMovieDetails, tmdbDetailsToMovieFields } from '../utils/tmdb.js';
import { searchLetterboxdByTmdbId } from '../utils/letterboxd.js';
import { findGatedTMDBMatch } from '../utils/tmdb-match.js';
import { scrapeVIFF } from '../scrapers/viff-scraper.js';
import { scrapePark } from '../scrapers/park-scraper.js';
import { scrapeRio } from '../scrapers/rio-scraper.js';
import { scrapeCinematheque } from '../scrapers/cinematheque-scraper.js';
import type { Screening } from '../models.js';

const APPLY = process.argv.includes('--apply');
const CLEAR_UNMATCHED = process.argv.includes('--clear-unmatched');
const MAX_GAP = 2; // same slack as the matcher's MAX_YEAR_GAP

const yearOf = (date?: string) => (date ? parseInt(date.substring(0, 4), 10) : null);

async function main() {
  if (!process.env.TMDB_API_TOKEN) throw new Error('TMDB_API_TOKEN not set');

  // booking_url → venue year, from a fresh scrape of the year-publishing venues
  const yearByUrl = new Map<string, number>();
  for (const [name, scrape] of Object.entries({
    viff: scrapeVIFF,
    park: scrapePark,
    rio: scrapeRio,
    cinematheque: scrapeCinematheque,
  })) {
    let screenings: Screening[] = [];
    try {
      screenings = await scrape();
    } catch (error) {
      console.warn(`Scraper ${name} failed, skipping:`, (error as Error).message);
    }
    for (const s of screenings) if (s.movie.year) yearByUrl.set(s.bookingUrl, s.movie.year);
    console.log(`${name}: ${screenings.length} screenings`);
  }

  if (yearByUrl.size === 0) throw new Error('No scraped screenings carried a year');

  const rows = await db
    .selectFrom('screening')
    .innerJoin('movie', 'movie.id', 'screening.movie_id')
    .select(['movie.id', 'movie.title', 'movie.tmdb_id', 'screening.booking_url'])
    .where('screening.booking_url', 'in', [...yearByUrl.keys()])
    .execute();

  // movie → venue year (most common, in case screenings disagree)
  const votes = new Map<number, { title: string; tmdbId: number | null; years: number[] }>();
  for (const r of rows) {
    const v = votes.get(r.id) ?? { title: r.title, tmdbId: r.tmdb_id, years: [] };
    v.years.push(yearByUrl.get(r.booking_url)!);
    votes.set(r.id, v);
  }
  console.log(`\nChecking ${votes.size} movies (${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  const changed: string[] = [];
  const unmatched: string[] = [];
  let ok = 0;

  for (const [movieId, { title, tmdbId, years }] of votes) {
    const counts = new Map<number, number>();
    for (const y of years) counts.set(y, (counts.get(y) ?? 0) + 1);
    const year = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    const current = tmdbId ? await getTMDBMovieDetails(tmdbId) : null;
    const currentYear = yearOf(current?.release_date);
    if (current && currentYear != null && Math.abs(currentYear - year) <= MAX_GAP) {
      ok++;
      continue;
    }
    const from = current ? `tmdb#${current.id} "${current.title}" (${currentYear})` : 'no match';

    // Stored runtime came from the questioned match, so don't use it
    const proposed = await findGatedTMDBMatch(title, year, null);
    if (!proposed) {
      if (!current) continue; // unmatched before, unmatched now
      const line = `#${movieId} "${title}" [venue ${year}]: ${from}, nothing on TMDB near ${year}`;
      unmatched.push(line);
      if (APPLY && CLEAR_UNMATCHED) {
        await db
          .updateTable('movie')
          .set({
            tmdb_id: null,
            tmdb_url: null,
            poster_url: null,
            tmdb_popularity: null,
            overview: null,
            letterboxd_url: null,
            year,
          })
          .where('id', '=', movieId)
          .execute();
        console.log(`  ✗ cleared ${line}`);
      }
      continue;
    }

    const to = `tmdb#${proposed.id} "${proposed.title}" (${yearOf(proposed.release_date)})`;
    const owner = await db
      .selectFrom('movie')
      .select(['id', 'title'])
      .where('tmdb_id', '=', proposed.id)
      .where('id', '!=', movieId)
      .executeTakeFirst();

    if (owner) {
      const line = `#${movieId} "${title}" [venue ${year}]: ${from} → merge into #${owner.id} "${owner.title}" (${to})`;
      changed.push(line);
      if (APPLY) {
        await mergeMovieInto(owner.id, movieId);
        console.log(`  ✓ ${line}`);
      }
      continue;
    }

    const line = `#${movieId} "${title}" [venue ${year}]: ${from} → ${to}`;
    changed.push(line);
    if (APPLY) {
      const fields = tmdbDetailsToMovieFields(proposed);
      const letterboxdUrl = await searchLetterboxdByTmdbId(proposed.id);
      await db
        .updateTable('movie')
        .set({ ...fields, letterboxd_url: letterboxdUrl, updated_at: new Date() })
        .where('id', '=', movieId)
        .execute();
      console.log(`  ✓ ${line}`);
    }
  }

  console.log(`\n=== ${APPLY ? 'CHANGED' : 'WOULD CHANGE'} (${changed.length}) ===`);
  for (const c of changed) console.log(`  ${c}`);
  console.log(
    `\n=== NO TMDB FILM NEAR VENUE YEAR (${unmatched.length})` +
      `${APPLY && CLEAR_UNMATCHED ? ' — CLEARED' : ' — left as-is, --clear-unmatched to drop'} ===`,
  );
  for (const u of unmatched) console.log(`  ${u}`);
  console.log(`\n${ok} already within ${MAX_GAP} years of the venue's year.`);
}

main()
  .catch((err) => {
    console.error('rematch-by-year failed:', err);
    process.exitCode = 1;
  })
  .finally(closeDb);
