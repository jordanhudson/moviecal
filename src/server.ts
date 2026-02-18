import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { db } from './db/connection.js';
import cron from 'node-cron';
import { runScrapeJob } from './scrape.js';
import { renderIndexPage, ScreeningWithMovie, TheatreRow } from './pages/index.js';
import { renderMoviePage } from './pages/movie.js';
import { renderTheatrePage } from './pages/theatre.js';
import { renderAllMoviesPage } from './pages/all-movies.js';
import { pacificNow, pacificToday, pacificHour as getPacificHour } from './utils/time.js';

const app = new Hono();

const NEXT_DAY_FLIP_HOUR = 22; // Show tomorrow's screenings starting at 10pm

// Helper to get start and end of a day
function getDayBounds(dateStr?: string) {
  let date: Date;

  if (dateStr) {
    // Parse YYYY-MM-DD directly to avoid timezone issues
    const [year, month, day] = dateStr.split('-').map(Number);
    date = new Date(year, month - 1, day);
  } else {
    const [year, month, day] = pacificToday().split('-').map(Number);
    date = new Date(year, month - 1, day);
    // Show next day's screenings starting at 10pm Pacific
    if (getPacificHour() >= NEXT_DAY_FLIP_HOUR) {
      date.setDate(date.getDate() + 1);
    }
  }

  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
  return { start, end, date };
}

// TMDB search API for fix-match modal
app.get('/api/movie/:id/tmdb-search', async (c) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || c.req.header('authorization') !== `Bearer ${adminToken}`) return c.json({ error: 'Unauthorized' }, 401);

  const movieId = parseInt(c.req.param('id'), 10);
  if (isNaN(movieId)) return c.json({ error: 'Invalid movie ID' }, 400);

  const movie = await db
    .selectFrom('movie')
    .select(['title'])
    .where('id', '=', movieId)
    .executeTakeFirst();
  if (!movie) return c.json({ error: 'Movie not found' }, 404);

  const query = c.req.query('query') || movie.title;
  const token = process.env.TMDB_API_TOKEN;
  if (!token) return c.json({ error: 'TMDB_API_TOKEN not configured' }, 500);

  const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) return c.json({ error: 'TMDB search failed' }, 502);
  const data = await resp.json() as { results: Array<{ id: number; title: string; release_date: string; poster_path: string | null; overview: string }> };

  const results = (data.results || []).slice(0, 10).map((r: { id: number; title: string; release_date: string; poster_path: string | null; overview: string }) => ({
    id: r.id,
    title: r.title,
    release_date: r.release_date,
    poster_path: r.poster_path ? `https://image.tmdb.org/t/p/w92${r.poster_path}` : null,
    overview: r.overview,
  }));

  return c.json(results);
});

// TMDB update API for fix-match modal
app.post('/api/movie/:id/tmdb-update', async (c) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || c.req.header('authorization') !== `Bearer ${adminToken}`) return c.json({ error: 'Unauthorized' }, 401);

  const movieId = parseInt(c.req.param('id'), 10);
  if (isNaN(movieId)) return c.json({ error: 'Invalid movie ID' }, 400);

  const body = await c.req.json() as { tmdbId: number };
  const tmdbId = body.tmdbId;
  if (!tmdbId) return c.json({ error: 'tmdbId required' }, 400);

  const token = process.env.TMDB_API_TOKEN;
  if (!token) return c.json({ error: 'TMDB_API_TOKEN not configured' }, 500);

  const resp = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?language=en-US`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) return c.json({ error: 'TMDB fetch failed' }, 502);

  const tmdbMovie = await resp.json() as { id: number; title: string; release_date: string; runtime: number | null; poster_path: string | null };

  const year = tmdbMovie.release_date ? parseInt(tmdbMovie.release_date.split('-')[0], 10) : null;
  const posterUrl = tmdbMovie.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbMovie.poster_path}` : null;
  const tmdbUrl = `https://www.themoviedb.org/movie/${tmdbMovie.id}`;

  await db
    .updateTable('movie')
    .set({
      tmdb_id: tmdbMovie.id,
      tmdb_url: tmdbUrl,
      poster_url: posterUrl,
      runtime: tmdbMovie.runtime,
      year: year,
    })
    .where('id', '=', movieId)
    .execute();

  return c.json({ success: true });
});

// Movie detail page
app.get('/movie/:id', async (c) => {
  const movieId = parseInt(c.req.param('id'), 10);

  if (isNaN(movieId)) {
    return c.text('Invalid movie ID', 400);
  }

  // Get movie details
  const movie = await db
    .selectFrom('movie')
    .select([
      'id',
      'title',
      'year',
      'director',
      'runtime',
      'tmdb_id',
      'tmdb_url',
      'poster_url',
    ])
    .where('id', '=', movieId)
    .executeTakeFirst();

  if (!movie) {
    return c.text('Movie not found', 404);
  }

  // Get all screenings for this movie
  const screenings = await db
    .selectFrom('screening')
    .select([
      'id',
      'datetime',
      'theatre_name',
      'booking_url',
    ])
    .where('movie_id', '=', movieId)
    .orderBy('datetime', 'asc')
    .execute();

  const fromDate = c.req.query('from_date') || null;
  const html = renderMoviePage(movie, screenings, fromDate);
  return c.html(html);
});

// Theatre detail page
app.get('/theatre/:name', async (c) => {
  const theatreName = decodeURIComponent(c.req.param('name'));

  // Get all screenings for this theatre
  const screenings = await db
    .selectFrom('screening')
    .innerJoin('movie', 'screening.movie_id', 'movie.id')
    .select([
      'screening.id',
      'screening.datetime',
      'screening.booking_url',
      'movie.id as movie_id',
      'movie.title as movie_title',
    ])
    .where('screening.theatre_name', '=', theatreName)
    .orderBy('screening.datetime', 'asc')
    .execute();

  const html = renderTheatrePage(theatreName, screenings);
  return c.html(html);
});

// All movies page
app.get('/movies', async (c) => {
  const now = pacificNow();
  const movies = await db
    .selectFrom('movie')
    .select(['movie.id', 'movie.title', 'movie.year', 'movie.runtime', 'movie.poster_url', 'movie.tmdb_id'])
    .where((eb) =>
      eb.exists(
        eb.selectFrom('screening')
          .select('screening.id')
          .whereRef('screening.movie_id', '=', 'movie.id')
          .where('screening.datetime', '>=', now)
      )
    )
    .orderBy('title', 'asc')
    .execute();

  const html = renderAllMoviesPage(movies);
  return c.html(html);
});

// Home page - Timeline view
app.get('/', async (c) => {
  const dateParam = c.req.query('date');
  const { start, end, date } = getDayBounds(dateParam);

  // Query screenings for this date
  const results = await db
    .selectFrom('screening')
    .innerJoin('movie', 'screening.movie_id', 'movie.id')
    .select([
      'screening.id as screening_id',
      'screening.datetime',
      'screening.theatre_name',
      'screening.booking_url',
      'movie.id as movie_id',
      'movie.title as movie_title',
      'movie.year as movie_year',
      'movie.runtime as movie_runtime',
      'movie.poster_url',
      'movie.tmdb_url',
    ])
    .where('screening.datetime', '>=', start)
    .where('screening.datetime', '<=', end)
    .orderBy('screening.datetime', 'asc')
    .execute();

  // Hardcoded theatre list in display order
  const THEATRE_ORDER = [
    'VIFF Cinema',
    'VIFF Lochmaddy Studio',
    'The Cinematheque',
    'The Park',
    'The Rio',
    'Hollywood Theatre',
    'Fifth Ave Aud #1',
    'Fifth Ave Aud #2',
    'Fifth Ave Aud #3',
    'Fifth Ave Aud #4',
    'Fifth Ave Aud #5',
    'Intl Village Aud 01',
    'Intl Village Aud 02',
    'Intl Village Aud 03',
    'Intl Village Aud 04',
    'Intl Village Aud 05',
    'Intl Village Aud 06',
    'Intl Village Aud 07',
    'Intl Village Aud 08',
    'Intl Village Aud 09',
    'Intl Village Aud 10',
    'Intl Village Aud 11',
    'Intl Village Aud 12',
    'Scotiabank IMAX #1',
    'Scotiabank AVX #2',
    'Scotiabank Aud 03',
    'Scotiabank Aud 04',
    'Scotiabank Aud 05',
    'Scotiabank Aud 06',
    'Scotiabank Aud 07',
    'Scotiabank Aud 08',
    'Scotiabank Aud 09',
  ];

  // Group screenings by theatre
  const theatreMap = new Map<string, ScreeningWithMovie[]>();
  for (const row of results) {
    if (!theatreMap.has(row.theatre_name)) {
      theatreMap.set(row.theatre_name, []);
    }
    theatreMap.get(row.theatre_name)!.push(row);
  }

  // Build theatre list in fixed order, including theatres with no screenings
  const theatres: TheatreRow[] = THEATRE_ORDER.map(theatre => ({
    theatre,
    screenings: theatreMap.get(theatre) || [],
  }));

  // Render HTML
  const html = renderIndexPage(date, theatres);
  return c.html(html);
});

// Schedule scrape job every 2 hours
cron.schedule('0 */2 * * *', async () => {
  console.log('[CRON] Starting scheduled scrape job...');
  try {
    await runScrapeJob();
    console.log('[CRON] Scheduled scrape job completed successfully');
  } catch (error) {
    console.error('[CRON] Scheduled scrape job failed:', error);
  }
}, {
  timezone: 'UTC'
});

const port = 3000;
const hostname = '0.0.0.0';
console.log(`Server is running on http://${hostname}:${port}`);

serve({
  fetch: app.fetch,
  port,
  hostname
});
