import { footer } from './layout.js';

// All movies listing page

export interface MovieRow {
  id: number;
  title: string;
  year: number | null;
  runtime: number | null;
  poster_url: string | null;
  tmdb_id: number | null;
}

export function renderAllMoviesPage(movies: MovieRow[]): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%23555'/%3E%3Cpath d='M8 12Q8 40 12 44L12 12Z' fill='%23ccc'/%3E%3Cpath d='M56 12Q56 40 52 44L52 12Z' fill='%23ccc'/%3E%3Crect x='14' y='14' width='36' height='22' rx='1' fill='%23fff'/%3E%3Ccircle cx='19' cy='42' r='4' fill='%23ddd'/%3E%3Crect x='15' y='46' width='8' height='8' rx='2' fill='%23ddd'/%3E%3Ccircle cx='32' cy='42' r='4' fill='%23ddd'/%3E%3Crect x='28' y='46' width='8' height='8' rx='2' fill='%23ddd'/%3E%3Ccircle cx='45' cy='42' r='4' fill='%23ddd'/%3E%3Crect x='41' y='46' width='8' height='8' rx='2' fill='%23ddd'/%3E%3C/svg%3E">
  <title>All Movies - MovieCal</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      background: #1e1e1e;
      color: #c5c5c5;
    }

    .back-link {
      display: inline-block;
      margin-bottom: 20px;
      color: #6a9a9a;
      text-decoration: none;
    }

    .back-link:hover {
      text-decoration: underline;
    }

    .page-title {
      font-size: 24px;
      margin-bottom: 20px;
    }

    .movie-list {
      max-width: 900px;
      margin: 0 auto;
    }

    .movie-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px;
      border-bottom: 1px solid #353535;
    }

    .movie-row-poster img {
      width: 40px;
      height: 60px;
      object-fit: cover;
      border-radius: 4px;
    }

    .movie-row-poster-placeholder {
      width: 40px;
      height: 60px;
      background: #353535;
      border-radius: 4px;
    }

    .movie-row-info {
      flex: 1;
      min-width: 0;
    }

    .movie-row-title {
      font-weight: 600;
    }

    .movie-row-title a {
      color: #c5c5c5;
      text-decoration: none;
    }

    .movie-row-title a:hover {
      color: #6a9a9a;
    }

    .movie-row-meta {
      color: #888;
      font-size: 13px;
      margin-top: 2px;
    }

    .fix-btn {
      padding: 6px 12px;
      background: #4a7c7c;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
    }

    .fix-btn:hover {
      background: #3d6868;
    }

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
    }

    @media (max-width: 800px) {
      body {
        padding: 12px;
      }

      .movie-row-meta span {
        display: inline;
      }
    }
  </style>
</head>
<body>
  <a href="/" class="back-link">\u2190 Back to Calendar</a>
  <h1 class="page-title">All Movies</h1>

  <div class="movie-list">
    ${movies.map(movie => `
      <div class="movie-row">
        <div class="movie-row-poster">
          ${movie.poster_url
            ? `<img src="${movie.poster_url.replace('/w500/', '/w92/')}" alt="">`
            : '<div class="movie-row-poster-placeholder"></div>'
          }
        </div>
        <div class="movie-row-info">
          <div class="movie-row-title"><a href="/movie/${movie.id}">${movie.title}</a></div>
          <div class="movie-row-meta">
            ${movie.year ? `<span>${movie.year}</span>` : ''}
            ${movie.runtime ? `<span>${movie.year ? ' \u00b7 ' : ''}${movie.runtime} min</span>` : ''}
            ${movie.tmdb_id ? `<span>${movie.year || movie.runtime ? ' \u00b7 ' : ''}TMDB: ${movie.tmdb_id}</span>` : ''}
          </div>
        </div>
        <button class="fix-btn" data-movie-id="${movie.id}" data-movie-title="${movie.title.replace(/"/g, '&quot;')}">Fix TMDB</button>
      </div>
    `).join('')}
  </div>

  <div class="tmdb-modal-overlay" id="tmdbModal">
    <div class="tmdb-modal">
      <h3>Fix TMDB Match</h3>
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
  </div>

  <script>
    (function() {
      var currentMovieId = null;
      var modal = document.getElementById('tmdbModal');
      var input = document.getElementById('tmdbSearchInput');
      var results = document.getElementById('tmdbResults');

      document.querySelector('.movie-list').addEventListener('click', function(e) {
        var btn = e.target.closest('.fix-btn');
        if (!btn) return;
        currentMovieId = parseInt(btn.getAttribute('data-movie-id'), 10);
        input.value = btn.getAttribute('data-movie-title');
        modal.classList.add('active');
        doSearch(input.value);
      });

      document.getElementById('tmdbModalClose').addEventListener('click', function() {
        modal.classList.remove('active');
      });

      modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.classList.remove('active');
      });

      document.getElementById('tmdbSearchBtn').addEventListener('click', function() {
        doSearch(input.value);
      });

      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') doSearch(input.value);
      });

      function doSearch(query) {
        results.innerHTML = '<div class="tmdb-loading">Searching...</div>';
        fetch('/api/movie/' + currentMovieId + '/tmdb-search?query=' + encodeURIComponent(query))
          .then(function(r) { return r.json(); })
          .then(function(data) {
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

      document.getElementById('tmdbIdBtn').addEventListener('click', function() {
        var idInput = document.getElementById('tmdbIdInput');
        var tmdbId = parseInt(idInput.value, 10);
        if (!tmdbId) return;
        results.innerHTML = '<div class="tmdb-loading">Updating...</div>';
        fetch('/api/movie/' + currentMovieId + '/tmdb-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tmdbId: tmdbId })
        }).then(function(r) { return r.json(); })
          .then(function() { window.location.reload(); });
      });

      document.getElementById('tmdbIdInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') document.getElementById('tmdbIdBtn').click();
      });

      results.addEventListener('click', function(e) {
        var item = e.target.closest('.tmdb-result-item');
        if (!item) return;
        var tmdbId = parseInt(item.getAttribute('data-tmdb-id'), 10);
        results.innerHTML = '<div class="tmdb-loading">Updating...</div>';
        fetch('/api/movie/' + currentMovieId + '/tmdb-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tmdbId: tmdbId })
        }).then(function(r) { return r.json(); })
          .then(function() { window.location.reload(); });
      });
    })();
  </script>
  ${footer()}
</body>
</html>
  `;
}
