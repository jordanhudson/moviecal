import 'dotenv/config';
import { scrapeVIFF } from './scrapers/viff-scraper.js';
import { scrapeCinematheque } from './scrapers/cinematheque-scraper.js';
import { scrapePark } from './scrapers/park-scraper.js';
import { scrapeRio } from './scrapers/rio-scraper.js';
import { scrapeHollywood } from './scrapers/hollywood-scraper.js';
import { scrapeCineplex } from './scrapers/cineplex-scraper.js';
import type { Screening, Movie } from './models.js';
import { getTMDBMovieDetails, tmdbDetailsToMovieFields, verifyTitleCleaning } from './utils/tmdb.js';
import type { TMDBMovieDetails } from './utils/tmdb.js';
import { recleanExistingTitles } from './utils/reclean.js';
import { searchLetterboxdByTmdbId } from './utils/letterboxd.js';
import { db, closeDb } from './db/connection.js';
import { reconcileScreenings } from './db/reconcile.js';
import { sql } from 'kysely';

interface TMDBMovieResult {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  popularity?: number;
}

interface TMDBSearchResponse {
  results: TMDBMovieResult[];
}

async function searchTMDB(title: string, year?: number | null, runtime?: number | null): Promise<TMDBMovieResult | null> {
  const apiToken = process.env.TMDB_API_TOKEN;
  if (!apiToken) {
    console.warn('TMDB_API_TOKEN not set, skipping TMDB search');
    return null;
  }

  try {
    let url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}`;
    if (year) {
      url += `&year=${year}`;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(`TMDB search failed for "${title}": ${response.status}`);
      return null;
    }

    const data: TMDBSearchResponse = await response.json();

    if (data.results.length === 0) {
      return null;
    }

    // Fetch details once per result and filter out shorts (< 60 minutes)
    const detailsMap = new Map<number, TMDBMovieDetails>();
    const filteredResults: TMDBMovieResult[] = [];
    for (const result of data.results) {
      const details = await getTMDBMovieDetails(result.id);
      if (details) {
        detailsMap.set(result.id, details);
        if (details.runtime && details.runtime >= 60) {
          filteredResults.push(result);
        }
      }
    }

    // If no valid results after filtering, return null
    if (filteredResults.length === 0) {
      return null;
    }

    // If no runtime provided, return first filtered result
    if (!runtime) {
      return filteredResults[0];
    }

    // If runtime is provided, find best match from filtered results
    const topResults = filteredResults.slice(0, 5);
    let bestMatch: TMDBMovieResult | null = null;
    let smallestDiff = Infinity;

    for (const result of topResults) {
      const details = detailsMap.get(result.id);
      if (details && details.runtime) {
        const diff = Math.abs(details.runtime - runtime);
        if (diff < smallestDiff) {
          smallestDiff = diff;
          bestMatch = result;
        }
      }
    }

    // Return best match if found, otherwise fall back to first filtered result
    return bestMatch || filteredResults[0];
  } catch (error) {
    console.warn(`Error searching TMDB for "${title}":`, error);
    return null;
  }
}

// Scraper registry mapping names to scraper functions
const scrapers: Record<string, () => Promise<Screening[]>> = {
  viff: scrapeVIFF,
  rio: scrapeRio,
  cinematheque: scrapeCinematheque,
  park: scrapePark,
  hollywood: scrapeHollywood,
  cineplex: scrapeCineplex,
};

// App-wide advisory lock key for the scrape job. Fly can run more than one
// machine (auto_start_machines), and each runs the cron — the lock ensures only
// one scrape job executes at a time across all machines.
const SCRAPE_LOCK_KEY = 728742001;

interface ScraperRunResult {
  name: string;
  screenings: Screening[];
  startedAt: Date;
  finishedAt: Date;
  error: string | null;
}

/**
 * Exported scrape job function that can be called from other modules (e.g., cron scheduler).
 * Does not call process.exit() so it won't kill the parent process.
 * Holds a Postgres advisory lock for the duration; if another machine/process
 * already holds it, the run is skipped.
 * @param scraperName Optional scraper name to run only that scraper (e.g., "hollywood")
 */
export async function runScrapeJob(scraperName?: string) {
  if (scraperName && !scrapers[scraperName]) {
    const validNames = Object.keys(scrapers).join(', ');
    throw new Error(`Unknown scraper: "${scraperName}". Valid scrapers: ${validNames}`);
  }

  // Pin one connection to hold the advisory lock while the job itself runs on
  // the regular pool. pg_try_advisory_lock returns false (no queueing) if
  // another connection — including one on another machine — holds the lock.
  await db.connection().execute(async (lockConn) => {
    const { rows } = await sql<{ locked: boolean }>`
      select pg_try_advisory_lock(${SCRAPE_LOCK_KEY}) as locked
    `.execute(lockConn);

    if (!rows[0]?.locked) {
      console.log('Another scrape job is already running (advisory lock held) — skipping this run.');
      return;
    }

    try {
      await runScrapeJobLocked(scraperName);
    } finally {
      await sql`select pg_advisory_unlock(${SCRAPE_LOCK_KEY})`.execute(lockConn);
    }
  });
}

async function runScrapeJobLocked(scraperName?: string) {
  // Determine which scrapers to run
  const scrapersToRun = scraperName
    ? { [scraperName]: scrapers[scraperName] }
    : scrapers;

  console.log(scraperName
    ? `Starting scrape job for ${scraperName}...`
    : 'Starting scrape job...');

  // Run selected scrapers in parallel
  const scraperEntries = Object.entries(scrapersToRun);
  const results: ScraperRunResult[] = await Promise.all(
    scraperEntries.map(async ([name, scrapeFn]) => {
      const startedAt = new Date();
      try {
        const screenings = await scrapeFn();
        return { name, screenings, startedAt, finishedAt: new Date(), error: null };
      } catch (err) {
        console.error(`${name} scraper failed:`, (err as Error).message);
        return { name, screenings: [] as Screening[], startedAt, finishedAt: new Date(), error: (err as Error).message };
      }
    })
  );

  // Build results map
  const scraperResults: Record<string, Screening[]> = {};
  for (const { name, screenings } of results) {
    scraperResults[name] = screenings;
  }

  // Combine all screenings
  const allScreenings = results.flatMap(r => r.screenings);

  console.log(`\nCollected ${allScreenings.length} total screenings:`);
  for (const { name, screenings } of results) {
    console.log(`  - ${name}: ${screenings.length}`);
  }

  // Record each scraper run so failures/zero-result runs are queryable, not
  // just buried in logs. Tracking failure must not abort the job itself.
  try {
    await db
      .insertInto('scrape_run')
      .values(results.map(r => ({
        scraper: r.name,
        started_at: r.startedAt,
        finished_at: r.finishedAt,
        screening_count: r.screenings.length,
        error: r.error,
      })))
      .execute();
  } catch (err) {
    console.warn('Failed to record scrape_run rows:', (err as Error).message);
  }

  // Re-clean existing movie titles in case new patterns were added to the title cleaner.
  // Uses shared re-clean logic with TMDB verification to avoid stripping real title parts.
  await recleanExistingTitles();

  // Extract unique movies (dedupe on title)
  const uniqueMoviesMap = new Map<string, Movie>();
  for (const screening of allScreenings) {
    if (!uniqueMoviesMap.has(screening.movie.title)) {
      uniqueMoviesMap.set(screening.movie.title, screening.movie);
    }
  }
  const uniqueMovies = Array.from(uniqueMoviesMap.values());
  let newMoviesCount = 0;
  let existingMoviesCount = 0;
  let tmdbFoundCount = 0;

  for (const movie of uniqueMovies) {
    // Check if movie exists in database
    const existingMovie = await db
      .selectFrom('movie')
      .select('id')
      .where('title', '=', movie.title)
      .executeTakeFirst();

    if (existingMovie) {
      existingMoviesCount++;
      continue;
    }

    // If any screening has a note, verify with TMDB that the parens aren't part of the real title
    const movieScreenings = allScreenings.filter(s => s.movie.title === movie.title);
    const firstNote = movieScreenings.find(s => s.note)?.note ?? null;

    if (firstNote) {
      const rawTitle = `${movie.title} (${firstNote})`;
      const verified = await verifyTitleCleaning(rawTitle, movie.year);
      if (verified.title !== movie.title) {
        // TMDB confirmed parens are part of the real title — undo cleaning
        console.log(`  → TMDB confirms "${verified.title}" is the real title, keeping parens`);
        movie.title = verified.title;
        for (const s of movieScreenings) {
          s.movie.title = verified.title;
          s.note = null;
        }

        // Re-check DB with the restored title — it may already exist
        const existingWithRestoredTitle = await db
          .selectFrom('movie')
          .select('id')
          .where('title', '=', verified.title)
          .executeTakeFirst();
        if (existingWithRestoredTitle) {
          existingMoviesCount++;
          continue;
        }
      }
    } else {
      // No parens note, but the title may carry a colon annotation
      // ("Real Title: Bleak Week"). Scrapers don't strip these, so split here at
      // insert time — verifyTitleCleaning only splits when TMDB confirms the part
      // before the colon is the real title.
      const verified = await verifyTitleCleaning(movie.title, movie.year);
      if (verified.title !== movie.title && verified.note) {
        console.log(`  → Split "${movie.title}" → "${verified.title}" (note: "${verified.note}")`);
        for (const s of movieScreenings) {
          s.movie.title = verified.title;
          if (!s.note) s.note = verified.note;
        }
        movie.title = verified.title;

        // The split title may already exist — reconcile will attach screenings to it
        const existingSplit = await db
          .selectFrom('movie')
          .select('id')
          .where('title', '=', verified.title)
          .executeTakeFirst();
        if (existingSplit) {
          existingMoviesCount++;
          continue;
        }
      }
    }

    // Search TMDB with the (possibly restored) title
    const searchYear = movie.year ? ` (${movie.year})` : '';
    const runtimeInfo = movie.runtime ? ` [${movie.runtime} min]` : '';
    console.log(`  → Searching TMDB for "${movie.title}${searchYear}${runtimeInfo}"...`);
    const tmdbResult = await searchTMDB(movie.title, movie.year, movie.runtime);

    let tmdbFields: Partial<ReturnType<typeof tmdbDetailsToMovieFields>> = {};
    let runtime: number | null = movie.runtime;
    let year: number | null = movie.year;

    if (tmdbResult) {
      // Fetch full movie details to get runtime, popularity, etc.
      const tmdbDetails = await getTMDBMovieDetails(tmdbResult.id);

      if (tmdbDetails) {
        tmdbFields = tmdbDetailsToMovieFields(tmdbDetails);
        // Prefer TMDB runtime, fall back to scraper runtime
        runtime = tmdbFields.runtime || runtime;
        // Prefer scraper year, fall back to TMDB year
        if (!year) year = tmdbFields.year ?? null;
      } else {
        // Fallback to search result data if details fetch fails
        tmdbFields = {
          tmdb_id: tmdbResult.id,
          tmdb_url: `https://www.themoviedb.org/movie/${tmdbResult.id}`,
          poster_url: tmdbResult.poster_path
            ? `https://image.tmdb.org/t/p/w500${tmdbResult.poster_path}`
            : null,
        };
        if (tmdbResult.release_date && !year) {
          year = parseInt(tmdbResult.release_date.substring(0, 4));
        }
      }

      tmdbFoundCount++;
      console.log(`    ✓ Found on TMDB: ${tmdbFields.tmdb_url}${runtime ? ` (${runtime} min)` : ''}`);
    } else {
      console.log(`    ✗ Not found on TMDB${runtime ? ` (using scraped runtime: ${runtime} min)` : ''}`);
    }

    // Look up Letterboxd via TMDB id (its /tmdb/{id}/ endpoint redirects to the
    // canonical film page). Only possible when we matched the movie on TMDB;
    // without a tmdb_id we leave letterboxd_url null (not yet searched).
    let letterboxdUrl: string | null = null;
    if (tmdbFields.tmdb_id) {
      console.log(`  → Looking up Letterboxd for TMDB id ${tmdbFields.tmdb_id}...`);
      letterboxdUrl = await searchLetterboxdByTmdbId(tmdbFields.tmdb_id);
      if (letterboxdUrl) {
        console.log(`    ✓ Found on Letterboxd: ${letterboxdUrl}`);
      } else {
        console.log(`    ✗ Not found on Letterboxd`);
      }
    }

    // Insert movie into database (with or without TMDB/Letterboxd data)
    await db
      .insertInto('movie')
      .values({
        title: movie.title,
        year,
        director: movie.director,
        runtime,
        tmdb_id: tmdbFields.tmdb_id ?? null,
        tmdb_url: tmdbFields.tmdb_url ?? null,
        poster_url: tmdbFields.poster_url ?? null,
        tmdb_popularity: tmdbFields.tmdb_popularity ?? null,
        // null = never searched (no tmdb_id to look up); 'MISS' = searched, not on Letterboxd.
        letterboxd_url: tmdbFields.tmdb_id ? (letterboxdUrl ?? 'MISS') : null,
      })
      .execute();

    newMoviesCount++;
    console.log(`    ✓ Inserted "${movie.title}" into database`);
  }

  console.log(`\nMovie processing complete:`);
  console.log(`  - New movies added: ${newMoviesCount}`);
  console.log(`  - Already existed: ${existingMoviesCount}`);
  console.log(`  - Found on TMDB: ${tmdbFoundCount}/${newMoviesCount}`);

  // Save screenings per scraper using in-memory reconciliation.
  console.log(`\nReconciling screenings per scraper...`);

  for (const { name, screenings } of results) {
    if (screenings.length === 0) {
      console.log(`  - ${name}: skipped (no screenings returned)`);
      continue;
    }

    const theatreNames = [...new Set(screenings.map(s => s.theatreName))];
    const titles = [...new Set(screenings.map(s => s.movie.title))];

    await db.transaction().execute(async (trx) => {
      // Batch-resolve title → movie_id for this scraper's screenings.
      const movies = await trx
        .selectFrom('movie')
        .select(['id', 'title'])
        .where('title', 'in', titles)
        .execute();
      const titleToMovieId = new Map(movies.map(m => [m.title, m.id]));

      const stats = await reconcileScreenings(trx, theatreNames, screenings, titleToMovieId);

      const skippedSuffix = stats.skipped > 0 ? `, skipped ${stats.skipped}` : '';
      console.log(
        `  - ${name}: matched ${stats.matched}, updated ${stats.updated}, inserted ${stats.inserted}, deleted ${stats.deleted}${skippedSuffix} (theatres: ${theatreNames.join(', ')})`
      );
    });
  }

  console.log('Scrape job completed successfully');

  // Dead-man's-switch heartbeat (full runs only — single-scraper CLI runs
  // shouldn't reset the alarm). The monitor (e.g. healthchecks.io) alerts when
  // pings stop arriving or a /fail ping comes in.
  if (!scraperName) {
    await pingHeartbeat(results);
  }
}

async function pingHeartbeat(results: ScraperRunResult[]) {
  const url = process.env.SCRAPE_HEARTBEAT_URL;
  if (!url) return;

  const problems = results
    .filter(r => r.error || r.screenings.length === 0)
    .map(r => `${r.name}: ${r.error ?? 'returned 0 screenings'}`);
  const target = problems.length > 0 ? `${url.replace(/\/+$/, '')}/fail` : url;

  try {
    await fetch(target, {
      method: 'POST',
      body: problems.join('\n'),
      signal: AbortSignal.timeout(10_000),
    });
    console.log(problems.length > 0
      ? `Heartbeat: reported failure (${problems.join('; ')})`
      : 'Heartbeat: reported success');
  } catch (err) {
    console.warn('Heartbeat ping failed:', (err as Error).message);
  }
}

// CLI entry point - only runs when this file is executed directly (not imported)
// Usage: npm run scrape [scraper-name]
// Example: npm run scrape hollywood
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const scraperName = process.argv[2]?.toLowerCase();
      await runScrapeJob(scraperName);
    } catch (error) {
      console.error('Fatal error in scrape job:', error);
      process.exit(1);
    } finally {
      // Always close database connection
      await closeDb();
      process.exit(0);
    }
  })();
}
