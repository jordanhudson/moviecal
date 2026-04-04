import { Hono } from 'hono';
import { db } from '../db/connection.js';
import { getTMDBMovieDetails, tmdbDetailsToMovieFields } from '../utils/tmdb.js';

export const apiRoutes = new Hono();

// TMDB search API for fix-match modal
apiRoutes.get('/api/movie/:id/tmdb-search', async (c) => {
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
apiRoutes.post('/api/movie/:id/tmdb-update', async (c) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || c.req.header('authorization') !== `Bearer ${adminToken}`) return c.json({ error: 'Unauthorized' }, 401);

  const movieId = parseInt(c.req.param('id'), 10);
  if (isNaN(movieId)) return c.json({ error: 'Invalid movie ID' }, 400);

  const body = await c.req.json() as { tmdbId: number };
  const tmdbId = body.tmdbId;
  if (!tmdbId) return c.json({ error: 'tmdbId required' }, 400);

  const details = await getTMDBMovieDetails(tmdbId);
  if (!details) return c.json({ error: 'TMDB fetch failed' }, 502);

  const fields = tmdbDetailsToMovieFields(details);

  await db
    .updateTable('movie')
    .set(fields)
    .where('id', '=', movieId)
    .execute();

  return c.json({ success: true });
});

// Letterboxd update API for fix-match modal
apiRoutes.post('/api/movie/:id/letterboxd-update', async (c) => {
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
