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
import { renderTmdbReviewPage } from './pages/tmdb-review.js';
import type { ScreeningInfo } from './pages/screenings-list.js';
import { renderMoviesPage } from './pages/movies.js';
import { renderErrorPage } from './pages/error.js';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import type { MiddlewareHandler } from 'hono';
import {
  pacificToday,
  pacificHour as getPacificHour,
  pacificWallClockToInstant,
} from './utils/time.js';
import { THEATRE_ORDER, buildDayListingGroups } from './venues.js';
import { apiRoutes } from './routes/api.js';
import { movieUrl } from './utils/movie-url.js';

const app = new Hono();

// Security headers on every response. Hono's defaults cover X-Content-Type-Options,
// X-Frame-Options, COOP/CORP, etc. Referrer-Policy is relaxed from the default
// no-referrer so venues still see movieclock.app referrals on booking links.
//
// CSP: all our client JS is now served as same-origin files (public/js/*), so
// script-src is strict 'self' (plus the Cloudflare analytics beacon) with no
// 'unsafe-inline' and no nonces — an injected <script> simply won't run. Data
// the scripts need rides in via data-* attributes and <script type="application/
// json"> islands (data blocks, which script-src doesn't govern). style-src keeps
// 'unsafe-inline' because the timeline/poster gradients are computed per-request
// inline styles; inline styles are a far weaker vector than inline scripts.
app.use(
  '*',
  secureHeaders({
    referrerPolicy: 'strict-origin-when-cross-origin',
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://static.cloudflareinsights.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'https://image.tmdb.org'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", 'https://cloudflareinsights.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  }),
);

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

// Consolidate every alternate host onto the canonical bare domain with a 301:
// the Fly default (movieclock.fly.dev) and the www. subdomain. Without this,
// www.movieclock.app serves a 200 with a non-www canonical — Google dedupes it
// but still crawls a parallel www universe (it showed up as ~200 "Alternative
// page with proper canonical tag" entries in Search Console). A redirect stops
// the duplication at the source and consolidates signals onto movieclock.app.
app.use('*', async (c, next) => {
  const host = c.req.header('host');
  if (host === 'movieclock.fly.dev' || host === 'www.movieclock.app') {
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
app.use('/js/*', cacheControl(CACHE_IMMUTABLE), serveStatic({ root: './public' }));
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

  // `date` is a plain calendar marker (for display/nav); the query bounds are
  // the real instants spanning that day in Pacific time.
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const start = pacificWallClockToInstant(y, m, d, 0, 0, 0);
  const end = pacificWallClockToInstant(y, m, d, 23, 59, 59);
  return { start, end, date };
}

// Admin API routes (TMDB/Letterboxd fix-match)
app.route('/', apiRoutes);

// robots.txt
app.get('/robots.txt', (c) => {
  const BASE_URL = process.env.BASE_URL || 'https://movieclock.app';
  const body = `User-agent: *
Allow: /
Disallow: /internal

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
      'overview',
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
  const now = new Date();
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

// TMDB match review queue (admin). Reads the tmdb_review work list populated by
// build-tmdb-review.ts; actions are token-gated via the /api endpoints.
app.get('/internal-tmdb-review', async (c) => {
  const rows = await db
    .selectFrom('tmdb_review')
    .selectAll()
    .orderBy(sql`suggested_tmdb_id is null`) // actionable (has a suggestion) first
    .orderBy('movie_id', 'asc')
    .execute();

  // Upcoming screenings for the queued movies, so each card shows what's playing.
  const screeningsByMovie = new Map<number, ScreeningInfo[]>();
  const movieIds = rows.map((r) => r.movie_id);
  if (movieIds.length > 0) {
    const screenings = await db
      .selectFrom('screening')
      .select(['movie_id', 'datetime', 'theatre_name', 'booking_url', 'note'])
      .where('movie_id', 'in', movieIds)
      .where('datetime', '>=', new Date())
      .orderBy('datetime', 'asc')
      .execute();
    for (const s of screenings) {
      const list = screeningsByMovie.get(s.movie_id) ?? [];
      list.push(s);
      screeningsByMovie.set(s.movie_id, list);
    }
  }

  return c.html(renderTmdbReviewPage(rows, screeningsByMovie));
});

// Movies page (by movie view)
app.get('/movies', async (c) => {
  const now = new Date();

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
  const listingGroups: ListingGroup[] = buildDayListingGroups(theatreMap);

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
