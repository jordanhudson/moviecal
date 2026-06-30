/** @jsxImportSource hono/jsx */
import { renderPage } from './layout.js';
import { TmdbModal } from './tmdb-modal.js';
import { safeHref } from '../utils/html.js';
import { movieUrl } from '../utils/movie-url.js';

export interface MovieRow {
  id: number;
  title: string;
  year: number | null;
  runtime: number | null;
  poster_url: string | null;
  tmdb_id: number | null;
  letterboxd_url: string | null;
}

export function renderAllMoviesPage(movies: MovieRow[], sort: string): string {
  return renderPage({
    title: 'All Upcoming Movies — MovieClock',
    description: 'Complete list of all movies with upcoming screenings in Vancouver cinemas.',
    styles: ['/css/all-movies.css', '/css/tmdb-modal.css'],
    scripts: ['/js/all-movies.js'],
    activePage: 'movies',
    body: (
      <>
        <a href="/" class="back-link">
          {'\u2190'} Back to Calendar
        </a>
        <div class="page-header">
          <h1 class="page-title">All Movies</h1>
          <select class="sort-select" id="sortSelect">
            <option value="added" selected={sort === 'added'}>
              Recently Added
            </option>
            <option value="title" selected={sort === 'title'}>
              Title
            </option>
            <option value="year" selected={sort === 'year'}>
              Year
            </option>
          </select>
        </div>

        <div class="movie-list">
          {movies.map((movie) => (
            <div class="movie-row">
              <div class="movie-row-poster">
                {movie.poster_url ? (
                  <img src={safeHref(movie.poster_url.replace('/w500/', '/w92/'))} alt="" />
                ) : (
                  <div class="movie-row-poster-placeholder"></div>
                )}
              </div>
              <div class="movie-row-info">
                <div class="movie-row-title">
                  <a href={movieUrl(movie.id, movie.title)}>{movie.title}</a>
                </div>
                <div class="movie-row-meta">
                  {movie.year && <span>{movie.year}</span>}
                  {movie.runtime && (
                    <span>
                      {movie.year ? ' \u00b7 ' : ''}
                      {movie.runtime} min
                    </span>
                  )}
                  {movie.tmdb_id && (
                    <span>
                      {movie.year || movie.runtime ? ' \u00b7 ' : ''}TMDB: {movie.tmdb_id}
                    </span>
                  )}
                  <span>
                    {' '}
                    {'\u00b7'} LB: {movie.letterboxd_url ?? 'null'}
                  </span>
                </div>
              </div>
              <button
                class="fix-btn"
                data-movie-id={String(movie.id)}
                data-movie-title={movie.title}
              >
                Fix Match
              </button>
            </div>
          ))}
        </div>

        <TmdbModal />
      </>
    ),
  });
}
