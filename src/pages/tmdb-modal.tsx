/** @jsxImportSource hono/jsx */

const MODAL_SCRIPT = `
var TmdbModal = (function() {
  var modal = document.getElementById('tmdbModal');
  var input = document.getElementById('tmdbSearchInput');
  var results = document.getElementById('tmdbResults');
  var statusEl = document.getElementById('tmdbTokenStatus');
  var setBtn = document.getElementById('tmdbSetToken');
  var currentMovieId = null;

  // The admin token lives in localStorage (shared with the review page). No
  // field — set it once and it's reused everywhere the modal opens.
  function getToken() {
    try { return (localStorage.getItem('adminToken') || '').trim(); } catch (e) { return ''; }
  }
  function refreshTokenStatus() {
    var has = !!getToken();
    if (statusEl) statusEl.textContent = has ? 'Admin token saved' : 'No admin token set';
    if (setBtn) setBtn.textContent = has ? 'Change token' : 'Set admin token';
  }
  function promptToken() {
    var t = prompt('Admin token', getToken());
    if (t === null) return false;
    try { localStorage.setItem('adminToken', t.trim()); } catch (e) {}
    refreshTokenStatus();
    return !!getToken();
  }
  function ensureToken() { return getToken() ? true : promptToken(); }
  if (setBtn) setBtn.addEventListener('click', promptToken);

  function open(movieId, title) {
    currentMovieId = movieId;
    input.value = title;
    results.innerHTML = '';
    refreshTokenStatus();
    modal.classList.add('active');
    // Auto-search when a token is already set.
    if (getToken()) doSearch(title);
  }

  function close() {
    modal.classList.remove('active');
  }

  document.getElementById('tmdbModalClose').addEventListener('click', close);

  modal.addEventListener('click', function(e) {
    if (e.target === modal) close();
  });

  document.getElementById('tmdbSearchBtn').addEventListener('click', function() {
    doSearch(input.value);
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doSearch(input.value);
  });

  function doSearch(query) {
    if (!ensureToken()) return;
    results.innerHTML = '<div class="tmdb-loading">Searching...</div>';
    fetch('/api/movie/' + currentMovieId + '/tmdb-search?query=' + encodeURIComponent(query), {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) {
          results.innerHTML = '<div class="tmdb-loading">' + data.error + '</div>';
          return;
        }
        if (!data.length) {
          results.innerHTML = '<div class="tmdb-loading">No results found</div>';
          return;
        }
        results.innerHTML = data.map(function(r) {
          var poster = r.poster_path
            ? '<img src="' + r.poster_path + '" alt="">'
            : '<div class="tmdb-result-poster-placeholder"></div>';
          var year = r.release_date ? r.release_date.split('-')[0] : '';
          var overview = (r.overview || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return '<div class="tmdb-result-item" data-tmdb-id="' + r.id + '">'
            + poster
            + '<div class="tmdb-result-info">'
            + '<div class="tmdb-result-title">' + r.title.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>'
            + '<div class="tmdb-result-year">' + year + '</div>'
            + '<div class="tmdb-result-overview">' + overview + '</div>'
            + '</div></div>';
        }).join('');
      })
      .catch(function() {
        results.innerHTML = '<div class="tmdb-loading">Search failed — check the admin token.</div>';
      });
  }

  function applyTmdbId(tmdbId) {
    if (!ensureToken()) return;
    results.innerHTML = '<div class="tmdb-loading">Updating...</div>';
    fetch('/api/movie/' + currentMovieId + '/tmdb-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ tmdbId: tmdbId })
    }).then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) {
          results.innerHTML = '<div class="tmdb-loading">' + data.error + '</div>';
          return;
        }
        window.location.reload();
      })
      .catch(function() {
        results.innerHTML = '<div class="tmdb-loading">Update failed — check the admin token.</div>';
      });
  }

  document.getElementById('tmdbIdBtn').addEventListener('click', function() {
    var tmdbId = parseInt(document.getElementById('tmdbIdInput').value, 10);
    if (!tmdbId) return;
    applyTmdbId(tmdbId);
  });

  document.getElementById('tmdbIdInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('tmdbIdBtn').click();
  });

  results.addEventListener('click', function(e) {
    var item = e.target.closest('.tmdb-result-item');
    if (!item) return;
    applyTmdbId(parseInt(item.getAttribute('data-tmdb-id'), 10));
  });

  return { open: open, close: close };
})();`;

export function TmdbModal() {
  return (
    <>
      <div class="tmdb-modal-overlay" id="tmdbModal">
        <div class="tmdb-modal">
          <h3>Fix TMDB Match</h3>
          <div class="tmdb-token-row">
            <span id="tmdbTokenStatus" class="tmdb-token-status"></span>
            <button type="button" id="tmdbSetToken">
              Set admin token
            </button>
          </div>
          <div style="border-top: 1px solid #353535; margin-bottom: 12px;"></div>
          <div class="tmdb-id-label">Fix TMDB Match - Search:</div>
          <div class="tmdb-search-row">
            <input type="text" id="tmdbSearchInput" />
            <button id="tmdbSearchBtn">Search</button>
          </div>
          <div class="tmdb-results" id="tmdbResults"></div>
          <div class="tmdb-id-section">
            <div class="tmdb-id-label">Or enter TMDB ID directly:</div>
            <div class="tmdb-search-row">
              <input type="number" id="tmdbIdInput" placeholder="e.g. 550" />
              <button id="tmdbIdBtn">Apply</button>
            </div>
          </div>
          <div class="tmdb-id-label" style="margin-top: 12px;">
            Applying a match also refreshes the Letterboxd link from the new TMDB id.
          </div>
          <button class="tmdb-modal-close" id="tmdbModalClose">
            Cancel
          </button>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: MODAL_SCRIPT }} />
    </>
  );
}
