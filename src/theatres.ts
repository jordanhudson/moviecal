import type { ScreeningWithMovie, ListingGroup } from './pages/index.js';

// Cineplex venues - collapsed into compact movie-list view instead of per-auditorium timelines
export const CINEPLEX_VENUES = [
  { display: 'Fifth Avenue', prefix: 'Fifth Ave' },
  { display: 'International Village', prefix: 'Intl Village' },
  { display: 'Scotiabank', prefix: 'Scotiabank' },
  { display: 'Langley', prefix: 'Langley' },
];
export const CINEPLEX_PREFIXES = CINEPLEX_VENUES.map(v => v.prefix);

// Hardcoded theatre list in display order
export const THEATRE_ORDER = [
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

// Build a listing group from screenings: groups by movie, deduplicates showtimes
export function buildListingGroup(venue: string, screenings: ScreeningWithMovie[], sortByTime = false): ListingGroup {
  const movieMap = new Map<number, {
    movie_id: number; movie_title: string; movie_year: number | null; movie_runtime: number | null;
    poster_url: string | null; letterboxd_url: string | null; tmdb_url: string | null;
    showtimes: Map<number, { datetime: Date; booking_url: string }>;
  }>();
  for (const s of screenings) {
    let movie = movieMap.get(s.movie_id);
    if (!movie) {
      movie = {
        movie_id: s.movie_id, movie_title: s.movie_title, movie_year: s.movie_year, movie_runtime: s.movie_runtime,
        poster_url: s.poster_url, letterboxd_url: s.letterboxd_url, tmdb_url: s.tmdb_url, showtimes: new Map(),
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
        movie_id: m.movie_id, movie_title: m.movie_title, movie_year: m.movie_year, movie_runtime: m.movie_runtime,
        poster_url: m.poster_url, letterboxd_url: m.letterboxd_url, tmdb_url: m.tmdb_url,
        showtimes: Array.from(m.showtimes.values()).sort((a, b) => a.datetime.getTime() - b.datetime.getTime()),
      }))
      .sort(sortByTime
        ? (a, b) => a.showtimes[0].datetime.getTime() - b.showtimes[0].datetime.getTime()
        : (a, b) => a.movie_title.localeCompare(b.movie_title)),
  };
}
