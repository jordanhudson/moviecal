/** @jsxImportSource hono/jsx */
import { renderPage } from './layout.js';
import { TmdbModal } from './tmdb-modal.js';
import { safeHref, jsonForScript } from '../utils/html.js';
import { ScreeningsList } from './screenings-list.js';
import { movieUrl } from '../utils/movie-url.js';
import { CINEPLEX_VENUES } from '../venues.js';

export interface MovieDetail {
  id: number;
  title: string;
  year: number | null;
  director: string | null;
  runtime: number | null;
  tmdb_id: number | null;
  tmdb_url: string | null;
  poster_url: string | null;
  letterboxd_url: string | null;
}

export interface ScreeningDetail {
  id: number;
  datetime: Date;
  theatre_name: string;
  booking_url: string;
  note: string | null;
}

export function renderMoviePage(movie: MovieDetail, screenings: ScreeningDetail[]): string {
  const now = new Date();
  const futureScreenings = screenings.filter((s) => new Date(s.datetime) >= now);

  const metaParts = [
    movie.year,
    movie.director,
    movie.runtime ? `${movie.runtime} min` : null,
  ].filter(Boolean);
  const metaSuffix = metaParts.length ? ` (${metaParts.join(', ')})` : '';
  const screeningCount = futureScreenings.length;
  const movieDesc = `${movie.title}${metaSuffix} — ${screeningCount} upcoming screening${screeningCount !== 1 ? 's' : ''} in Vancouver.`;

  const movieSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: movie.title,
    ...(movie.year && { dateCreated: String(movie.year) }),
    ...(movie.director && { director: { '@type': 'Person', name: movie.director } }),
    ...(movie.runtime && { duration: `PT${movie.runtime}M` }),
    ...(movie.poster_url && { image: movie.poster_url }),
    url: `https://movieclock.app${movieUrl(movie.id, movie.title)}`,
  };

  const screeningSchemas = futureScreenings.map((s) => ({
    '@context': 'https://schema.org',
    '@type': 'ScreeningEvent',
    name: movie.title,
    startDate: new Date(s.datetime).toISOString(),
    location: {
      '@type': 'MovieTheater',
      name: s.theatre_name,
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Vancouver',
        addressRegion: 'BC',
        addressCountry: 'CA',
      },
    },
    workPresented: { '@type': 'Movie', name: movie.title },
    ...(s.booking_url && { url: s.booking_url }),
  }));

  return renderPage({
    title: `${movie.title}${movie.year ? ` (${movie.year})` : ''} Showtimes Vancouver — MovieClock`,
    description: movieDesc,
    canonicalPath: movieUrl(movie.id, movie.title),
    ogImage: movie.poster_url || undefined,
    jsonLd: [movieSchema, ...screeningSchemas],
    styles: ['/css/movie.css', '/css/tmdb-modal.css'],
    scripts: ['/js/movie.js'],
    body: (
      <>
        {/* Cineplex venue grouping for the theatre-filter logic in movie.js.
            A data block (type="application/json"), so it's exempt from script-src. */}
        <script
          type="application/json"
          id="cineplexVenues"
          dangerouslySetInnerHTML={{ __html: jsonForScript(CINEPLEX_VENUES) }}
        />
        <div class="movie-container">
          <div class="movie-header">
            <div
              class="movie-poster"
              data-movie-id={String(movie.id)}
              data-movie-title={movie.title}
            >
              {movie.poster_url ? (
                <img src={safeHref(movie.poster_url)} alt={`${movie.title} poster`} />
              ) : (
                <div class="movie-poster-placeholder">No poster</div>
              )}
            </div>
            <div class="movie-info">
              <h1 class="movie-title">{movie.title}</h1>
              <div class="movie-meta">
                {movie.year && <span>{movie.year}</span>}
                {movie.runtime && <span>{movie.runtime} min</span>}
                {movie.director && <span>Dir: {movie.director}</span>}
              </div>
              {movie.tmdb_url && (
                <a href={safeHref(movie.tmdb_url)} target="_blank" class="tmdb-link">
                  View on TMDB
                </a>
              )}
              {movie.letterboxd_url && (
                <a href={safeHref(movie.letterboxd_url)} target="_blank" class="letterboxd-link">
                  View on Letterboxd
                </a>
              )}
            </div>
          </div>

          <div class="screenings-section">
            <h2>Screenings</h2>
            <ScreeningsList screenings={futureScreenings} />
          </div>
        </div>

        <TmdbModal />
      </>
    ),
  });
}
