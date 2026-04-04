/** @jsxImportSource hono/jsx */

const MODAL_SCRIPT = `
var TmdbModal = (function() {
  var modal = document.getElementById('tmdbModal');
  var input = document.getElementById('tmdbSearchInput');
  var tokenInput = document.getElementById('tmdbTokenInput');
  var results = document.getElementById('tmdbResults');
  var currentMovieId = null;

  function getToken() { return tokenInput.value; }

  var letterboxdStatus = document.getElementById('letterboxdStatus');
  var letterboxdUrlInput = document.getElementById('letterboxdUrlInput');

  function open(movieId, title, letterboxdUrl) {
    currentMovieId = movieId;
    input.value = title;
    results.innerHTML = '';
    letterboxdUrlInput.value = '';
    if (letterboxdUrl === 'MISS') {
      letterboxdStatus.textContent = 'Fix Letterboxd - Current: not found (MISS)';
    } else if (letterboxdUrl) {
      letterboxdStatus.textContent = 'Fix Letterboxd - Current: ' + letterboxdUrl;
    } else {
      letterboxdStatus.textContent = 'Fix Letterboxd - Current: not checked';
    }
    modal.classList.add('active');
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
      });
  }

  function applyTmdbId(tmdbId) {
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

  function updateLetterboxd(url) {
    letterboxdStatus.textContent = 'Updating...';
    fetch('/api/movie/' + currentMovieId + '/letterboxd-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ url: url })
    }).then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) {
          letterboxdStatus.textContent = 'Error: ' + data.error;
          return;
        }
        window.location.reload();
      });
  }

  document.getElementById('letterboxdApplyBtn').addEventListener('click', function() {
    var url = letterboxdUrlInput.value.trim();
    if (!url) return;
    updateLetterboxd(url);
  });

  document.getElementById('letterboxdClearBtn').addEventListener('click', function() {
    updateLetterboxd(null);
  });

  return { open: open, close: close };
})();`;

export function TmdbModal() {
  return (
    <>
      <div class="tmdb-modal-overlay" id="tmdbModal">
        <div class="tmdb-modal">
          <h3>Fix TMDB Match</h3>
          <form onsubmit="return false">
            <input type="hidden" autocomplete="username" value="admin" />
            <div class="tmdb-search-row">
              <input type="password" id="tmdbTokenInput" placeholder="Admin token" autocomplete="current-password" style="flex: 1;" />
            </div>
          </form>
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
          <div class="letterboxd-section">
            <div class="tmdb-id-label" id="letterboxdStatus"></div>
            <div class="tmdb-search-row">
              <input type="text" id="letterboxdUrlInput" placeholder="https://letterboxd.com/film/..." />
              <button id="letterboxdApplyBtn">Apply</button>
              <button id="letterboxdClearBtn" style="background:#353535;color:#c5c5c5;">Clear</button>
            </div>
          </div>
          <button class="tmdb-modal-close" id="tmdbModalClose">Cancel</button>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: MODAL_SCRIPT }} />
    </>
  );
}
