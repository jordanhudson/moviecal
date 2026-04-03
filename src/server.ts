import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { db } from './db/connection.js';
import cron from 'node-cron';
import { runScrapeJob } from './scrape.js';
import { renderIndexPage, ScreeningWithMovie, TheatreRow, ListingGroup } from './pages/index.js';
import { renderMoviePage } from './pages/movie.js';
import { renderTheatrePage } from './pages/theatre.js';
import { renderAllMoviesPage } from './pages/all-movies.js';
import { renderMoviesPage } from './pages/movies.js';
import { setSearchMovies } from './pages/layout.js';
import { pacificNow, pacificToday, pacificHour as getPacificHour } from './utils/time.js';

const app = new Hono();

app.use('/favicon.png', serveStatic({ root: './public' }));

// Load search movies for the nav bar on every HTML page request
app.use('*', async (c, next) => {
  const path = c.req.path;
  if (path.startsWith('/api/') || path === '/favicon.png' || path === '/robots.txt' || path === '/sitemap.xml') {
    return next();
  }
  const now = pacificNow();
  const movies = await db
    .selectFrom('movie')
    .innerJoin('screening', 'screening.movie_id', 'movie.id')
    .select(['movie.id', 'movie.title'])
    .where('screening.datetime', '>=', now)
    .groupBy(['movie.id', 'movie.title'])
    .orderBy('movie.title', 'asc')
    .execute();
  setSearchMovies(movies);
  return next();
});

const NEXT_DAY_FLIP_HOUR = 22; // Show tomorrow's screenings starting at 10pm

// Cineplex venues - collapsed into compact movie-list view instead of per-auditorium timelines
const CINEPLEX_VENUES = [
  { display: 'Fifth Avenue', prefix: 'Fifth Ave' },
  { display: 'International Village', prefix: 'Intl Village' },
  { display: 'Scotiabank', prefix: 'Scotiabank' },
  { display: 'Langley', prefix: 'Langley' },
];
const CINEPLEX_PREFIXES = CINEPLEX_VENUES.map(v => v.prefix);

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

// Letterboxd update API for fix-match modal
app.post('/api/movie/:id/letterboxd-update', async (c) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || c.req.header('authorization') !== `Bearer ${adminToken}`) return c.json({ error: 'Unauthorized' }, 401);

  const movieId = parseInt(c.req.param('id'), 10);
  if (isNaN(movieId)) return c.json({ error: 'Invalid movie ID' }, 400);

  const body = await c.req.json() as { url: string | null };
  const url = body.url;

  await db
    .updateTable('movie')
    .set({ letterboxd_url: url })
    .where('id', '=', movieId)
    .execute();

  return c.json({ success: true });
});

// robots.txt
app.get('/robots.txt', (c) => {
  const BASE_URL = process.env.BASE_URL || 'https://movieclock.fly.dev';
  const body = `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;
  return c.text(body);
});

// sitemap.xml
app.get('/sitemap.xml', async (c) => {
  const BASE_URL = process.env.BASE_URL || 'https://movieclock.fly.dev';
  const now = new Date().toISOString().split('T')[0];

  // Get all movies that have future screenings
  const movies = await db
    .selectFrom('movie')
    .select(['movie.id'])
    .where((eb) =>
      eb.exists(
        eb.selectFrom('screening')
          .select('screening.id')
          .whereRef('screening.movie_id', '=', 'movie.id')
          .where('screening.datetime', '>=', new Date())
      )
    )
    .execute();

  // Get all theatre names that have future screenings
  const theatres = await db
    .selectFrom('screening')
    .select('theatre_name')
    .where('datetime', '>=', new Date())
    .groupBy('theatre_name')
    .execute();

  const urls = [
    { loc: '/', changefreq: 'hourly', priority: '1.0' },
    { loc: '/movies', changefreq: 'hourly', priority: '0.8' },
    ...movies.map(m => ({ loc: `/movie/${m.id}`, changefreq: 'daily', priority: '0.6' })),
    ...theatres.map(t => ({ loc: `/theatre/${encodeURIComponent(t.theatre_name)}`, changefreq: 'daily', priority: '0.5' })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${BASE_URL}${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return c.body(xml, 200, { 'Content-Type': 'application/xml' });
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
      'letterboxd_url',
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
      'note',
    ])
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
    .select(['movie.id', 'movie.title', 'movie.year', 'movie.runtime', 'movie.poster_url', 'movie.tmdb_id', 'movie.letterboxd_url'])
    .where((eb) =>
      eb.exists(
        eb.selectFrom('screening')
          .select('screening.id')
          .whereRef('screening.movie_id', '=', 'movie.id')
          .where('screening.datetime', '>=', now)
      )
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

// Build a listing group from screenings: groups by movie, deduplicates showtimes
function buildListingGroup(venue: string, screenings: ScreeningWithMovie[], sortByTime = false): ListingGroup {
  const movieMap = new Map<number, {
    movie_id: number; movie_title: string; poster_url: string | null;
    letterboxd_url: string | null; tmdb_url: string | null;
    showtimes: Map<number, { datetime: Date; booking_url: string }>;
  }>();
  for (const s of screenings) {
    let movie = movieMap.get(s.movie_id);
    if (!movie) {
      movie = {
        movie_id: s.movie_id, movie_title: s.movie_title, poster_url: s.poster_url,
        letterboxd_url: s.letterboxd_url, tmdb_url: s.tmdb_url, showtimes: new Map(),
      };
      movieMap.set(s.movie_id, movie);
    }
    const timeKey = new Date(s.datetime).getTime();
    if (!movie.showtimes.has(timeKey)) {
      movie.showtimes.set(timeKey, { datetime: new Date(s.datetime), booking_url: s.booking_url });
    }
  }
  return {
    venue,
    movies: Array.from(movieMap.values())
      .map(m => ({
        movie_id: m.movie_id, movie_title: m.movie_title, poster_url: m.poster_url,
        letterboxd_url: m.letterboxd_url, tmdb_url: m.tmdb_url,
        showtimes: Array.from(m.showtimes.values()).sort((a, b) => a.datetime.getTime() - b.datetime.getTime()),
      }))
      .sort(sortByTime
        ? (a, b) => a.showtimes[0].datetime.getTime() - b.showtimes[0].datetime.getTime()
        : (a, b) => a.movie_title.localeCompare(b.movie_title)),
  };
}

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
      'movie.letterboxd_url',
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
    'Langley Cinema 1 (UltraAVX)',
    'Langley Cinema 2',
    'Langley Cinema 3',
    'Langley Cinema 4',
    'Langley Cinema 5',
    'Langley Cinema 6',
    'Langley Cinema 7',
    'Langley Cinema 8',
    'Langley Cinema 9',
    'Langley Cinema 10',
    'Langley Cinema 11',
    'Langley Cinema 12',
    'Langley Cinema 13',
    'Langley Cinema 14',
    'Langley Cinema 15',
    'Langley Cinema 16',
    'Langley Cinema 17',
    'Langley Cinema 18',
    'Langley IMAX',
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

  // Build listing groups for all venues (movie-list view)
  const listingGroups: ListingGroup[] = [];

  // Independent theatres: each is its own listing group
  for (const theatre of THEATRE_ORDER) {
    if (CINEPLEX_PREFIXES.some(p => theatre.startsWith(p))) continue;
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
console.log(`Server started at ${new Date().toLocaleTimeString()} on http://${hostname}:${port}`);

serve({
  fetch: app.fetch,
  port,
  hostname
});
