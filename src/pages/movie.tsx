/** @jsxImportSource hono/jsx */
import { renderPage } from './layout.js';
import { TmdbModal } from './tmdb-modal.js';
import { safeHref, jsonForScript } from '../utils/html.js';
import { ScreeningsList } from './screenings-list.js';
import { movieUrl } from '../utils/movie-url.js';
import { pacificWallClock } from '../utils/time.js';
import { CINEPLEX_VENUES, venueGroup } from '../venues.js';

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
  overview: string | null;
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

  const screeningCount = futureScreenings.length;
  const yearSuffix = movie.year ? ` (${movie.year})` : '';

  // A richer, higher-CTR meta description than a bare count: which cinemas, and
  // when the next showing is. futureScreenings is datetime-ascending (the query
  // orders by datetime), so [0] is the next one.
  const movieDesc = (() => {
    if (screeningCount === 0) {
      return `${movie.title}${yearSuffix} — no upcoming showtimes in Vancouver right now. Check back soon for screenings and ticket links.`;
    }
    const venues: string[] = [];
    for (const s of futureScreenings) {
      const name = venueGroup(s.theatre_name).name;
      if (!venues.includes(name)) venues.push(name);
    }
    const venueStr =
      venues.length <= 2 ? venues.join(' & ') : `${venues.slice(0, 2).join(', ')} & more`;
    const next = pacificWallClock(new Date(futureScreenings[0].datetime));
    const nextDate = next.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const h12 = next.getHours() % 12 || 12;
    const mm = String(next.getMinutes()).padStart(2, '0');
    const ampm = next.getHours() >= 12 ? 'pm' : 'am';
    const nextVenue = venueGroup(futureScreenings[0].theatre_name).name;
    return `See ${movie.title}${yearSuffix} in Vancouver — ${screeningCount} showtime${screeningCount !== 1 ? 's' : ''} at ${venueStr}. Next: ${nextDate}, ${h12}:${mm}${ampm} at ${nextVenue}. Book tickets.`;
  })();

  const movieSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: movie.title,
    ...(movie.year && { dateCreated: String(movie.year) }),
    ...(movie.director && { director: { '@type': 'Person', name: movie.director } }),
    ...(movie.runtime && { duration: `PT${movie.runtime}M` }),
    ...(movie.poster_url && { image: movie.poster_url }),
    ...(movie.overview && { description: movie.overview }),
    url: `https://movieclock.app${movieUrl(movie.id, movie.title)}`,
  };

  // Breadcrumb trail (Home › By Movie › this film) for breadcrumb rich results.
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://movieclock.app/' },
      { '@type': 'ListItem', position: 2, name: 'By Movie', item: 'https://movieclock.app/movies' },
      {
        '@type': 'ListItem',
        position: 3,
        name: movie.title,
        item: `https://movieclock.app${movieUrl(movie.id, movie.title)}`,
      },
    ],
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
    jsonLd: [movieSchema, breadcrumbSchema, ...screeningSchemas],
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
                <img
                  src={safeHref(movie.poster_url)}
                  alt={`${movie.title} poster`}
                  width="500"
                  height="750"
                  fetchpriority="high"
                />
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

          {movie.overview && (
            <section class="movie-overview">
              <h2>Synopsis</h2>
              <p>{movie.overview}</p>
            </section>
          )}

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
