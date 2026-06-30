/** @jsxImportSource hono/jsx */
import { renderPage } from './layout.js';
import { TmdbModal } from './tmdb-modal.js';
import { safeHref } from '../utils/html.js';
import { movieUrl } from '../utils/movie-url.js';
import { ScreeningsList, ScreeningInfo } from './screenings-list.js';

export interface ReviewRow {
  movie_id: number;
  stored_title: string;
  current_tmdb_id: number | null;
  current_title: string | null;
  current_year: number | null;
  current_poster_url: string | null;
  suggested_tmdb_id: number | null;
  suggested_title: string | null;
  suggested_year: number | null;
  suggested_poster_url: string | null;
  suggested_overview: string | null;
}

const tmdbUrl = (id: number | null) => (id ? `https://www.themoviedb.org/movie/${id}` : '#');

function FilmBlock(props: {
  posterUrl: string | null;
  title: string | null;
  year: number | null;
  tmdbId: number | null;
  overview?: string | null;
}) {
  return (
    <div class="review-film">
      {props.posterUrl ? (
        <img class="review-poster" src={safeHref(props.posterUrl)} alt="" loading="lazy" />
      ) : (
        <div class="review-poster review-poster-empty"></div>
      )}
      <div class="review-film-info">
        <div class="review-film-title">{props.title ?? 'Unknown'}</div>
        <div class="review-film-meta">
          {props.year ? `${props.year} · ` : ''}TMDB {props.tmdbId ?? '—'}
        </div>
        {props.tmdbId && (
          <a class="review-tmdb-link" href={tmdbUrl(props.tmdbId)} target="_blank" rel="noreferrer">
            View on TMDB ↗
          </a>
        )}
        {props.overview && <div class="review-overview">{props.overview}</div>}
      </div>
    </div>
  );
}

export function renderTmdbReviewPage(
  rows: ReviewRow[],
  screeningsByMovie: Map<number, ScreeningInfo[]>,
): string {
  return renderPage({
    title: 'TMDB Match Review — MovieClock',
    description: 'Admin review queue for likely-wrong TMDB matches.',
    styles: ['/css/tmdb-modal.css', '/css/movie.css', '/css/tmdb-review.css'],
    scripts: ['/js/review.js'],
    noindex: true,
    activePage: 'movies',
    body: (
      <>
        <div class="review-wrap">
          <div class="review-header">
            <a href="/" class="back-link">
              {'←'} Back
            </a>
            <h1 class="review-title">
              TMDB Match Review · <span id="reviewCount">{String(rows.length)}</span> to check
            </h1>
            <div class="review-token-bar">
              <span id="tokenStatus" class="token-status"></span>
              <button type="button" id="setToken" class="review-save-token">
                Set admin token
              </button>
            </div>
            <p class="review-hint">
              Each entry has a likely-wrong TMDB match. Accept the suggestion, pick another, or
              dismiss if it's actually fine. Every change also refreshes the Letterboxd link.
            </p>
          </div>

          <div id="reviewEmpty" class="review-empty" style={rows.length ? 'display:none' : ''}>
            Nothing to review. Run <code>build-tmdb-review</code> to refresh the queue.
          </div>

          <div id="reviewList">
            {rows.map((r) => (
              <div
                class="review-card"
                data-movie-id={String(r.movie_id)}
                data-suggested-id={r.suggested_tmdb_id != null ? String(r.suggested_tmdb_id) : ''}
                data-stored-title={r.stored_title}
              >
                <div class="review-card-head">
                  <a
                    class="review-stored"
                    href={movieUrl(r.movie_id, r.stored_title)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.stored_title}
                  </a>
                  <span class="review-movie-id">#{r.movie_id}</span>
                </div>

                <div class="review-cols">
                  <div class="review-col">
                    <div class="review-col-label review-col-current">
                      Currently linked — likely wrong
                    </div>
                    <FilmBlock
                      posterUrl={r.current_poster_url}
                      title={r.current_title}
                      year={r.current_year}
                      tmdbId={r.current_tmdb_id}
                    />
                  </div>
                  <div class="review-col">
                    <div class="review-col-label review-col-suggested">Suggested</div>
                    {r.suggested_tmdb_id ? (
                      <FilmBlock
                        posterUrl={r.suggested_poster_url}
                        title={r.suggested_title}
                        year={r.suggested_year}
                        tmdbId={r.suggested_tmdb_id}
                        overview={r.suggested_overview}
                      />
                    ) : (
                      <div class="review-none">No confident suggestion — use “Pick another”.</div>
                    )}
                  </div>
                </div>

                <div class="review-screenings">
                  <div class="review-col-label">What's actually playing</div>
                  <ScreeningsList screenings={screeningsByMovie.get(r.movie_id) ?? []} />
                </div>

                <div class="review-actions">
                  {r.suggested_tmdb_id && (
                    <button class="btn-yup" type="button">
                      Yup, use this
                    </button>
                  )}
                  <button class="btn-nope" type="button">
                    Nope — pick another
                  </button>
                  <button class="btn-dismiss" type="button">
                    Looks fine — dismiss
                  </button>
                  <button class="btn-delete" type="button">
                    Delete movie
                  </button>
                  <span class="review-status"></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <TmdbModal />
      </>
    ),
  });
}
