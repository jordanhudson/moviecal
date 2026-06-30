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

// Inline script: handles Yup / dismiss via fetch (token from the page field) and
// removes the resolved card; Nope reuses the shared fix-match modal (whose own
// apply reloads the page). All writes also refresh Letterboxd server-side.
const REVIEW_SCRIPT = `
  var list = document.getElementById('reviewList');
  var countEl = document.getElementById('reviewCount');

  // The admin token lives only in localStorage (this page is admin-only). Set it
  // once and every action uses it — it survives the reload the modal does.
  function token() {
    try { return (localStorage.getItem('adminToken') || '').trim(); } catch (e) { return ''; }
  }
  var setBtn = document.getElementById('setToken');
  var statusEl = document.getElementById('tokenStatus');
  function refreshTokenUi() {
    var has = !!token();
    statusEl.textContent = has ? 'Admin token saved' : 'No admin token set';
    statusEl.className = 'token-status' + (has ? ' ok' : '');
    setBtn.textContent = has ? 'Change token' : 'Set admin token';
  }
  function promptToken() {
    var t = prompt('Admin token', token());
    if (t === null) return;
    try { localStorage.setItem('adminToken', t.trim()); } catch (e) {}
    refreshTokenUi();
  }
  setBtn.addEventListener('click', promptToken);
  refreshTokenUi();

  function remaining() {
    var n = list.querySelectorAll('.review-card').length;
    countEl.textContent = n;
    if (n === 0) {
      document.getElementById('reviewEmpty').style.display = 'block';
    }
  }
  function setStatus(card, msg, ok) {
    var s = card.querySelector('.review-status');
    s.textContent = msg;
    s.className = 'review-status' + (ok === false ? ' err' : '');
  }

  function apply(card, tmdbId) {
    if (!token()) { setStatus(card, 'Set the admin token first.', false); promptToken(); return; }
    setStatus(card, 'Updating…', true);
    fetch('/api/movie/' + card.dataset.movieId + '/tmdb-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
      body: JSON.stringify({ tmdbId: tmdbId })
    }).then(function(r){ return r.json(); }).then(function(data){
      if (data.error) { setStatus(card, data.error, false); return; }
      card.remove(); remaining();
    }).catch(function(){ setStatus(card, 'Request failed.', false); });
  }

  function dismiss(card) {
    if (!token()) { setStatus(card, 'Set the admin token first.', false); promptToken(); return; }
    setStatus(card, 'Dismissing…', true);
    fetch('/api/tmdb-review/' + card.dataset.movieId + '/dismiss', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token() }
    }).then(function(r){ return r.json(); }).then(function(data){
      if (data.error) { setStatus(card, data.error, false); return; }
      card.remove(); remaining();
    }).catch(function(){ setStatus(card, 'Request failed.', false); });
  }

  function del(card) {
    if (!token()) { setStatus(card, 'Set the admin token first.', false); promptToken(); return; }
    if (!confirm('Permanently delete "' + card.dataset.storedTitle + '" and all its screenings from the database?')) return;
    setStatus(card, 'Deleting…', true);
    fetch('/api/movie/' + card.dataset.movieId + '/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token() }
    }).then(function(r){ return r.json(); }).then(function(data){
      if (data.error) { setStatus(card, data.error, false); return; }
      card.remove(); remaining();
    }).catch(function(){ setStatus(card, 'Request failed.', false); });
  }

  list.addEventListener('click', function(e){
    var card = e.target.closest('.review-card');
    if (!card) return;
    if (e.target.closest('.btn-yup')) {
      apply(card, parseInt(card.dataset.suggestedId, 10));
    } else if (e.target.closest('.btn-dismiss')) {
      dismiss(card);
    } else if (e.target.closest('.btn-delete')) {
      del(card);
    } else if (e.target.closest('.btn-nope')) {
      // The modal reads the same localStorage token, so just open (it auto-searches).
      TmdbModal.open(parseInt(card.dataset.movieId, 10), card.dataset.storedTitle);
    }
  });
`;

export function renderTmdbReviewPage(
  rows: ReviewRow[],
  screeningsByMovie: Map<number, ScreeningInfo[]>,
): string {
  return renderPage({
    title: 'TMDB Match Review — MovieClock',
    description: 'Admin review queue for likely-wrong TMDB matches.',
    styles: ['/css/tmdb-modal.css', '/css/movie.css', '/css/tmdb-review.css'],
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
        <script dangerouslySetInnerHTML={{ __html: REVIEW_SCRIPT }} />
      </>
    ),
  });
}
