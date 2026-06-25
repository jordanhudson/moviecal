import 'dotenv/config';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { db } from './db/connection.js';
import { sql } from 'kysely';
import cron from 'node-cron';
import { runScrapeJob } from './scrape.js';
import { renderIndexPage, ScreeningWithMovie, TheatreRow, ListingGroup } from './pages/index.js';
import { renderMoviePage } from './pages/movie.js';
import { renderTheatrePage } from './pages/theatre.js';
import { renderAllMoviesPage } from './pages/all-movies.js';
import { renderMoviesPage } from './pages/movies.js';
import { renderErrorPage } from './pages/error.js';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import type { MiddlewareHandler } from 'hono';
import { pacificNow, pacificToday, pacificHour as getPacificHour } from './utils/time.js';
import {
  THEATRE_ORDER,
  CINEPLEX_VENUES,
  CINEPLEX_PREFIXES,
  buildListingGroup,
} from './theatres.js';
import { apiRoutes } from './routes/api.js';
import { movieUrl } from './utils/movie-url.js';

const app = new Hono();

// Security headers on every response. Hono's defaults cover X-Content-Type-Options,
// X-Frame-Options, COOP/CORP, etc. Referrer-Policy is relaxed from the default
// no-referrer so venues still see movieclock.app referrals on booking links.
// No CSP yet — the pages rely on inline scripts (would need nonces).
app.use('*', secureHeaders({ referrerPolicy: 'strict-origin-when-cross-origin' }));

// Gzip responses — the app is served straight from Fly (no CDN in front), so
// nothing else compresses for us.
app.use('*', compress());

// Health check for Fly (see [[http_service.checks]] in fly.toml). Registered
// before the host-redirect middleware so it answers 200 regardless of the Host
// header the checker sends. Verifies the DB is reachable so a machine with a
// dead connection gets restarted.
app.get('/healthz', async (c) => {
  try {
    await sql`select 1`.execute(db);
    return c.text('ok');
  } catch (err) {
    console.error('Health check failed:', (err as Error).message);
    return c.text('db unreachable', 503);
  }
});

app.use('*', async (c, next) => {
  const host = c.req.header('host');
  if (host === 'movieclock.fly.dev') {
    const url = new URL(c.req.url);
    return c.redirect(`https://movieclock.app${url.pathname}${url.search}`, 301);
  }
  return next();
});

// Cache headers for static assets, production only (in dev a plain browser
// refresh must pick up CSS edits). CSS URLs are content-hashed (`?v=` via
// assetUrl in layout.tsx) and font files are effectively immutable, so both
// get a year; favicons and the og-image keep their URLs, so just a day.
const isProd = process.env.NODE_ENV === 'production';
function cacheControl(value: string): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (isProd && c.res.ok) c.res.headers.set('Cache-Control', value);
  };
}
const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_DAY = 'public, max-age=86400';

app.use('/css/*', cacheControl(CACHE_IMMUTABLE), serveStatic({ root: './public' }));
app.use('/fonts/*', cacheControl(CACHE_IMMUTABLE), serveStatic({ root: './public' }));
app.use('/favicon.png', cacheControl(CACHE_DAY), serveStatic({ root: './public' }));
app.use('/favicon.svg', cacheControl(CACHE_DAY), serveStatic({ root: './public' }));
app.use('/og-image.png', cacheControl(CACHE_DAY), serveStatic({ root: './public' }));

app.notFound(async (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not found' }, 404);
  }
  const html = renderErrorPage(
    404,
    'Page not found',
    "That page doesn't exist — maybe the movie left town.",
  );
  return c.html(html, 404);
});

app.onError(async (err, c) => {
  console.error(`Unhandled error on ${c.req.method} ${c.req.path}:`, err);
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Internal server error' }, 500);
  }
  try {
    const html = renderErrorPage(
      500,
      'Something went wrong',
      'An unexpected error occurred. Please try again in a moment.',
    );
    return c.html(html, 500);
  } catch {
    return c.text('Internal Server Error', 500);
  }
});

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

// Admin API routes (TMDB/Letterboxd fix-match)
app.route('/', apiRoutes);

// robots.txt
app.get('/robots.txt', (c) => {
  const BASE_URL = process.env.BASE_URL || 'https://movieclock.app';
  const body = `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;
  return c.text(body);
});

// sitemap.xml
app.get('/sitemap.xml', async (c) => {
  const BASE_URL = process.env.BASE_URL || 'https://movieclock.app';
  const now = new Date().toISOString().split('T')[0];
  const toLastmod = (d: Date) => new Date(d).toISOString().split('T')[0];

  // Movies with future screenings; lastmod is the latest change to the movie
  // or any of its screenings (crawlers ignore a sitemap whose lastmod is
  // always today)
  const movies = await db
    .selectFrom('movie')
    .innerJoin('screening', 'screening.movie_id', 'movie.id')
    .select([
      'movie.id',
      'movie.title',
      sql<Date>`greatest(movie.updated_at, max(screening.updated_at))`.as('lastmod'),
    ])
    .where('screening.datetime', '>=', new Date())
    .groupBy(['movie.id', 'movie.title'])
    .execute();

  // Theatre names with future screenings; lastmod from their screenings
  const theatres = await db
    .selectFrom('screening')
    .select(['theatre_name', sql<Date>`max(updated_at)`.as('lastmod')])
    .where('datetime', '>=', new Date())
    .groupBy('theatre_name')
    .execute();

  const urls = [
    { loc: '/', lastmod: now, changefreq: 'hourly', priority: '1.0' },
    { loc: '/movies', lastmod: now, changefreq: 'hourly', priority: '0.8' },
    ...movies.map((m) => ({
      loc: movieUrl(m.id, m.title),
      lastmod: toLastmod(m.lastmod),
      changefreq: 'daily',
      priority: '0.6',
    })),
    ...theatres.map((t) => ({
      loc: `/theatre/${encodeURIComponent(t.theatre_name)}`,
      lastmod: toLastmod(t.lastmod),
      changefreq: 'daily',
      priority: '0.5',
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${BASE_URL}${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`;

  return c.body(xml, 200, { 'Content-Type': 'application/xml' });
});

// Movie detail page
app.get('/movie/:id', async (c) => {
  const movieId = parseInt(c.req.param('id'), 10);

  if (isNaN(movieId)) {
    const html = renderErrorPage(404, 'Movie not found', "We don't have a movie at this address.");
    return c.html(html, 404);
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
      'letterboxd_url',
    ])
    .where('id', '=', movieId)
    .executeTakeFirst();

  if (!movie) {
    const html = renderErrorPage(404, 'Movie not found', "We don't have a movie at this address.");
    return c.html(html, 404);
  }

  // Get all screenings for this movie
  const screenings = await db
    .selectFrom('screening')
    .select(['id', 'datetime', 'theatre_name', 'booking_url', 'note'])
    .where('movie_id', '=', movieId)
    .orderBy('datetime', 'asc')
    .execute();

  const html = renderMoviePage(movie, screenings);
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
      'screening.note',
      'movie.id as movie_id',
      'movie.title as movie_title',
    ])
    .where('screening.theatre_name', '=', theatreName)
    .orderBy('screening.datetime', 'asc')
    .execute();

  const html = renderTheatrePage(theatreName, screenings);
  return c.html(html);
});

// All movies page (internal)
app.get('/internal-movies', async (c) => {
  const now = pacificNow();
  const sort = c.req.query('sort') || 'added';

  let query = db
    .selectFrom('movie')
    .select([
      'movie.id',
      'movie.title',
      'movie.year',
      'movie.runtime',
      'movie.poster_url',
      'movie.tmdb_id',
      'movie.letterboxd_url',
    ])
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom('screening')
          .select('screening.id')
          .whereRef('screening.movie_id', '=', 'movie.id')
          .where('screening.datetime', '>=', now),
      ),
    );

  if (sort === 'title') {
    query = query.orderBy('title', 'asc');
  } else if (sort === 'year') {
    query = query.orderBy('year', 'desc');
  } else {
    query = query.orderBy('movie.created_at', 'desc');
  }

  const movies = await query.execute();

  const html = renderAllMoviesPage(movies, sort);
  return c.html(html);
});

// Movies page (by movie view)
app.get('/movies', async (c) => {
  const now = pacificNow();

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
      'movie.letterboxd_url',
      'movie.created_at as movie_created_at',
      'movie.tmdb_popularity',
    ])
    .where('screening.datetime', '>=', now)
    .orderBy('screening.datetime', 'asc')
    .execute();

  const html = renderMoviesPage(results);
  return c.html(html);
});

// Home page (By Date) — shared by `/` and `/date/:datestr`
async function renderHome(c: Context, dateParam?: string) {
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
      'movie.letterboxd_url',
    ])
    .where('screening.datetime', '>=', start)
    .where('screening.datetime', '<=', end)
    .orderBy('screening.datetime', 'asc')
    .execute();

  // Group screenings by theatre
  const theatreMap = new Map<string, ScreeningWithMovie[]>();
  for (const row of results) {
    if (!theatreMap.has(row.theatre_name)) {
      theatreMap.set(row.theatre_name, []);
    }
    theatreMap.get(row.theatre_name)!.push(row);
  }

  // Build theatre list in fixed order, including theatres with no screenings
  const theatres: TheatreRow[] = THEATRE_ORDER.map((theatre) => ({
    theatre,
    screenings: theatreMap.get(theatre) || [],
  }));

  // Build listing groups for all venues (movie-list view)
  const listingGroups: ListingGroup[] = [];

  // Independent theatres: each is its own listing group
  for (const theatre of THEATRE_ORDER) {
    if (CINEPLEX_PREFIXES.some((p) => theatre.startsWith(p))) continue;
    const screenings = theatreMap.get(theatre) || [];
    if (screenings.length === 0) continue;
    const group = buildListingGroup(theatre, screenings, true);
    group.theatreName = theatre;
    listingGroups.push(group);
  }

  // Cineplex venues: merge auditoriums into one group per venue
  for (const venue of CINEPLEX_VENUES) {
    const venueScreenings: ScreeningWithMovie[] = [];
    for (const [theatreName, screenings] of theatreMap) {
      if (theatreName.startsWith(venue.prefix)) {
        venueScreenings.push(...screenings);
      }
    }
    if (venueScreenings.length === 0) continue;
    listingGroups.push(buildListingGroup(venue.display, venueScreenings));
  }

  // Render HTML
  const html = renderIndexPage(date, theatres, listingGroups);
  return c.html(html);
}

app.get('/', (c) => {
  // Back-compat: old bookmarks used `/?date=YYYY-MM-DD`; 301 to the new path form
  const legacyDate = c.req.query('date');
  if (legacyDate && /^\d{4}-\d{2}-\d{2}$/.test(legacyDate)) {
    return c.redirect(`/date/${legacyDate}`, 301);
  }
  return renderHome(c);
});

app.get('/date/:datestr', (c) => {
  const datestr = c.req.param('datestr');
  // Only accept YYYY-MM-DD; anything else falls back to today's view at `/`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datestr)) {
    return c.redirect('/', 301);
  }
  return renderHome(c, datestr);
});

// Schedule scrape job every 2 hours
cron.schedule(
  '0 */2 * * *',
  async () => {
    console.log('[CRON] Starting scheduled scrape job...');
    try {
      await runScrapeJob();
      console.log('[CRON] Scheduled scrape job completed successfully');
    } catch (error) {
      console.error('[CRON] Scheduled scrape job failed:', error);
    }
  },
  {
    timezone: 'UTC',
  },
);

const port = 3000;
const hostname = '0.0.0.0';
console.log(`Server started at ${new Date().toLocaleTimeString()} on http://${hostname}:${port}`);

serve({
  fetch: app.fetch,
  port,
  hostname,
});
