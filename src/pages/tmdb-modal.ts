// Shared TMDB fix-match modal component
// Used by movie.ts and all-movies.ts

export function tmdbModalStyles(): string {
  return `
    .tmdb-modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }

    .tmdb-modal-overlay.active {
      display: flex;
    }

    .tmdb-modal {
      background: #262626;
      border-radius: 8px;
      padding: 24px;
      width: 90%;
      max-width: 600px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    }

    .tmdb-modal h3 {
      margin-bottom: 16px;
    }

    .tmdb-search-row {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .tmdb-search-row input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #353535;
      border-radius: 4px;
      background: #1e1e1e;
      color: #c5c5c5;
      font-size: 14px;
    }

    .tmdb-search-row button {
      padding: 8px 16px;
      background: #4a7c7c;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }

    .tmdb-results {
      overflow-y: auto;
      flex: 1;
    }

    .tmdb-result-item {
      display: flex;
      gap: 12px;
      padding: 12px;
      border-bottom: 1px solid #353535;
      cursor: pointer;
      border-radius: 4px;
    }

    .tmdb-result-item:hover {
      background: #353535;
    }

    .tmdb-result-item img {
      width: 46px;
      height: 69px;
      object-fit: cover;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .tmdb-result-poster-placeholder {
      width: 46px;
      height: 69px;
      background: #353535;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .tmdb-result-info {
      flex: 1;
      min-width: 0;
    }

    .tmdb-result-title {
      font-weight: 600;
      margin-bottom: 4px;
    }

    .tmdb-result-year {
      color: #888;
      font-size: 13px;
      margin-bottom: 4px;
    }

    .tmdb-result-overview {
      color: #888;
      font-size: 12px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .tmdb-modal-close {
      margin-top: 12px;
      padding: 8px 16px;
      background: #353535;
      color: #c5c5c5;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      align-self: flex-end;
    }

    .tmdb-loading {
      color: #888;
      text-align: center;
      padding: 20px;
    }

    .tmdb-id-section {
      border-top: 1px solid #353535;
      margin-top: 12px;
      padding-top: 12px;
    }

    .tmdb-id-label {
      color: #888;
      font-size: 13px;
      margin-bottom: 8px;
    }`;
}

export function tmdbModalHtml(): string {
  return `
  <div class="tmdb-modal-overlay" id="tmdbModal">
    <div class="tmdb-modal">
      <h3>Fix TMDB Match</h3>
      <form onsubmit="return false">
        <input type="hidden" autocomplete="username" value="admin">
        <div class="tmdb-search-row">
          <input type="password" id="tmdbTokenInput" placeholder="Admin token" autocomplete="current-password" style="flex: 1;">
        </div>
      </form>
      <div class="tmdb-search-row">
        <input type="text" id="tmdbSearchInput">
        <button id="tmdbSearchBtn">Search</button>
      </div>
      <div class="tmdb-results" id="tmdbResults"></div>
      <div class="tmdb-id-section">
        <div class="tmdb-id-label">Or enter TMDB ID directly:</div>
        <div class="tmdb-search-row">
          <input type="number" id="tmdbIdInput" placeholder="e.g. 550">
          <button id="tmdbIdBtn">Apply</button>
        </div>
      </div>
      <button class="tmdb-modal-close" id="tmdbModalClose">Cancel</button>
    </div>
  </div>`;
}

export function tmdbModalScript(): string {
  return `
  <script>
    var TmdbModal = (function() {
      var modal = document.getElementById('tmdbModal');
      var input = document.getElementById('tmdbSearchInput');
      var tokenInput = document.getElementById('tmdbTokenInput');
      var results = document.getElementById('tmdbResults');
      var currentMovieId = null;

      function getToken() { return tokenInput.value; }

      function open(movieId, title) {
        currentMovieId = movieId;
        input.value = title;
        results.innerHTML = '';
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

      return { open: open, close: close };
    })();
  </script>`;
}
