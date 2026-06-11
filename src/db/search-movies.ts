// In-memory cache for the nav-bar search movie list. The list only changes
// when a scrape runs (or as screenings age out), so a short TTL avoids running
// the query on every HTML request without serving stale results for long.
import { db } from './connection.js';
import { pacificNow } from '../utils/time.js';

export interface SearchMovie {
  id: number;
  title: string;
}

const TTL_MS = 5 * 60 * 1000;

let cache: { movies: SearchMovie[]; fetchedAt: number } | null = null;
let pending: Promise<SearchMovie[]> | null = null;

export async function getSearchMovies(): Promise<SearchMovie[]> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache.movies;
  }
  // Coalesce concurrent refreshes into one query
  if (!pending) {
    pending = (async () => {
      try {
        const movies = await db
          .selectFrom('movie')
          .innerJoin('screening', 'screening.movie_id', 'movie.id')
          .select(['movie.id', 'movie.title'])
          .where('screening.datetime', '>=', pacificNow())
          .groupBy(['movie.id', 'movie.title'])
          .orderBy('movie.title', 'asc')
          .execute();
        cache = { movies, fetchedAt: Date.now() };
        return movies;
      } finally {
        pending = null;
      }
    })();
  }
  return pending;
}

export function invalidateSearchMovies() {
  cache = null;
}
