import 'dotenv/config';
import { scrapeVIFF } from './scrapers/viff-scraper.js';
import { scrapeCinematheque } from './scrapers/cinematheque-scraper.js';
import { scrapePark } from './scrapers/park-scraper.js';
import { scrapeRio } from './scrapers/rio-scraper.js';
import { scrapeHollywood } from './scrapers/hollywood-scraper.js';
import { scrapeCineplex } from './scrapers/cineplex-scraper.js';
import type { Screening, Movie } from './models.js';
import { db, closeDb } from './db/connection.js';

interface TMDBMovieResult {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
}

interface TMDBSearchResponse {
  results: TMDBMovieResult[];
}

interface TMDBMovieDetails {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  runtime: number | null;
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
      }
    });

    if (!response.ok) {
      console.warn(`TMDB search failed for "${title}": ${response.status}`);
      return null;
    }

    const data: TMDBSearchResponse = await response.json();

    if (data.results.length === 0) {
      return null;
    }

    // Filter out shorts (< 60 minutes) from all results
    const filteredResults: TMDBMovieResult[] = [];
    for (const result of data.results) {
      const details = await getTMDBMovieDetails(result.id);
      if (details && details.runtime && details.runtime >= 60) {
        filteredResults.push(result);
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
    const topResults = filteredResults.slice(0, 5); // Check top 5 filtered results
    let bestMatch: TMDBMovieResult | null = null;
    let smallestDiff = Infinity;

    for (const result of topResults) {
      const details = await getTMDBMovieDetails(result.id);
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
      }
    });

    if (!response.ok) {
      console.warn(`TMDB details fetch failed for ID ${tmdbId}: ${response.status}`);
      return null;
    }

    const data: TMDBMovieDetails = await response.json();
    return data;
  } catch (error) {
    console.warn(`Error fetching TMDB details for ID ${tmdbId}:`, error);
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

/**
 * Exported scrape job function that can be called from other modules (e.g., cron scheduler).
 * Does not call process.exit() so it won't kill the parent process.
 * @param scraperName Optional scraper name to run only that scraper (e.g., "hollywood")
 */
export async function runScrapeJob(scraperName?: string) {
  // Determine which scrapers to run
  const scrapersToRun = scraperName
    ? { [scraperName]: scrapers[scraperName] }
    : scrapers;

  if (scraperName && !scrapers[scraperName]) {
    const validNames = Object.keys(scrapers).join(', ');
    throw new Error(`Unknown scraper: "${scraperName}". Valid scrapers: ${validNames}`);
  }

  console.log(scraperName
    ? `Starting scrape job for ${scraperName}...`
    : 'Starting scrape job...');

  // Run selected scrapers in parallel
  const scraperEntries = Object.entries(scrapersToRun);
  const results = await Promise.all(
    scraperEntries.map(async ([name, scrapeFn]) => {
      try {
        const screenings = await scrapeFn();
        return { name, screenings };
      } catch (err) {
        console.error(`${name} scraper failed:`, (err as Error).message);
        return { name, screenings: [] as Screening[] };
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
      continue;
    }

    // Movie doesn't exist, try to find it on TMDB
    const searchYear = movie.year ? ` (${movie.year})` : '';
    const runtimeInfo = movie.runtime ? ` [${movie.runtime} min]` : '';
    console.log(`  → Searching TMDB for "${movie.title}${searchYear}${runtimeInfo}"...`);
    const tmdbResult = await searchTMDB(movie.title, movie.year, movie.runtime);

    let tmdbId: number | null = null;
    let tmdbUrl: string | null = null;
    let posterUrl: string | null = null;
    let runtime: number | null = movie.runtime; // Start with runtime from scraper
    let year: number | null = movie.year;

    if (tmdbResult) {
      tmdbId = tmdbResult.id;
      tmdbUrl = `https://www.themoviedb.org/movie/${tmdbResult.id}`;

      // Fetch full movie details to get runtime
      const tmdbDetails = await getTMDBMovieDetails(tmdbResult.id);

      if (tmdbDetails) {
        posterUrl = tmdbDetails.poster_path
          ? `https://image.tmdb.org/t/p/w500${tmdbDetails.poster_path}`
          : null;

        // Prefer TMDB runtime, fall back to scraper runtime
        runtime = tmdbDetails.runtime || runtime;

        // Extract year from release_date if available
        if (tmdbDetails.release_date && !year) {
          year = parseInt(tmdbDetails.release_date.substring(0, 4));
        }
      } else {
        // Fallback to search result data if details fetch fails
        posterUrl = tmdbResult.poster_path
          ? `https://image.tmdb.org/t/p/w500${tmdbResult.poster_path}`
          : null;

        if (tmdbResult.release_date && !year) {
          year = parseInt(tmdbResult.release_date.substring(0, 4));
        }
      }

      tmdbFoundCount++;
      console.log(`    ✓ Found on TMDB: ${tmdbUrl}${runtime ? ` (${runtime} min)` : ''}`);
    } else {
      console.log(`    ✗ Not found on TMDB${runtime ? ` (using scraped runtime: ${runtime} min)` : ''}`);
    }

    // Insert movie into database (with or without TMDB data)
    await db
      .insertInto('movie')
      .values({
        title: movie.title,
        year,
        director: movie.director,
        runtime,
        tmdb_id: tmdbId,
        tmdb_url: tmdbUrl,
        poster_url: posterUrl,
      })
      .execute();

    newMoviesCount++;
    console.log(`    ✓ Inserted "${movie.title}" into database`);
  }

  console.log(`\nMovie processing complete:`);
  console.log(`  - New movies added: ${newMoviesCount}`);
  console.log(`  - Already existed: ${existingMoviesCount}`);
  console.log(`  - Found on TMDB: ${tmdbFoundCount}/${newMoviesCount}`);

  // Save screenings per scraper using delete-and-reinsert
  console.log(`\nSaving screenings to database (delete-and-reinsert per scraper)...`);

  for (const { name, screenings } of results) {
    if (screenings.length === 0) {
      console.log(`  - ${name}: skipped (no screenings returned)`);
      continue;
    }

    const theatreNames = [...new Set(screenings.map(s => s.theatreName))];

    await db.transaction().execute(async (trx) => {
      // Delete all screenings for this scraper's theatres
      const deleteResult = await trx
        .deleteFrom('screening')
        .where('theatre_name', 'in', theatreNames)
        .executeTakeFirst();

      const deletedCount = Number(deleteResult.numDeletedRows);

      // Insert fresh screenings
      let insertedCount = 0;
      for (const screening of screenings) {
        const movie = await trx
          .selectFrom('movie')
          .select('id')
          .where('title', '=', screening.movie.title)
          .executeTakeFirst();

        if (!movie) {
          console.warn(`  ⚠ Movie "${screening.movie.title}" not found in database, skipping screening`);
          continue;
        }

        await trx
          .insertInto('screening')
          .values({
            movie_id: movie.id,
            datetime: screening.datetime,
            theatre_name: screening.theatreName,
            booking_url: screening.bookingUrl,
          })
          .execute();

        insertedCount++;
      }

      console.log(`  - ${name}: deleted ${deletedCount}, inserted ${insertedCount} (theatres: ${theatreNames.join(', ')})`);
    });
  }

  console.log('Scrape job completed successfully');
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
