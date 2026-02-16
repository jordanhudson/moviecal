import { footer } from './layout.js';

// Movie detail page

export interface MovieDetail {
  id: number;
  title: string;
  year: number | null;
  director: string | null;
  runtime: number | null;
  tmdb_id: number | null;
  tmdb_url: string | null;
  poster_url: string | null;
}

export interface ScreeningDetail {
  id: number;
  datetime: Date;
  theatre_name: string;
  booking_url: string;
}

export function renderMoviePage(movie: MovieDetail, screenings: ScreeningDetail[], fromDate?: string | null): string {
  // Get current time in Pacific (screening times are stored as naive Pacific timestamps)
  const pacificNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const futureScreenings = screenings.filter(s => new Date(s.datetime) >= pacificNow);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%23555'/%3E%3Cpath d='M8 12Q8 40 12 44L12 12Z' fill='%23ccc'/%3E%3Cpath d='M56 12Q56 40 52 44L52 12Z' fill='%23ccc'/%3E%3Crect x='14' y='14' width='36' height='22' rx='1' fill='%23fff'/%3E%3Ccircle cx='19' cy='42' r='4' fill='%23ddd'/%3E%3Crect x='15' y='46' width='8' height='8' rx='2' fill='%23ddd'/%3E%3Ccircle cx='32' cy='42' r='4' fill='%23ddd'/%3E%3Crect x='28' y='46' width='8' height='8' rx='2' fill='%23ddd'/%3E%3Ccircle cx='45' cy='42' r='4' fill='%23ddd'/%3E%3Crect x='41' y='46' width='8' height='8' rx='2' fill='%23ddd'/%3E%3C/svg%3E">
  <title>${movie.title} - MovieCal</title>
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

    .movie-container {
      background: #262626;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      max-width: 900px;
      margin: 0 auto;
    }

    .movie-header {
      display: flex;
      gap: 30px;
      margin-bottom: 30px;
    }

    .movie-poster {
      flex-shrink: 0;
    }

    .movie-poster img {
      width: 200px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }

    .movie-poster-placeholder {
      width: 200px;
      height: 300px;
      background: #353535;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #606060;
      font-size: 14px;
    }

    .movie-info {
      flex: 1;
    }

    .movie-title {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 10px;
    }

    .movie-meta {
      color: #888;
      margin-bottom: 20px;
    }

    .movie-meta span {
      margin-right: 15px;
    }

    .tmdb-link {
      display: inline-block;
      padding: 8px 16px;
      background: #01b4e4;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      font-size: 14px;
    }

    .tmdb-link:hover {
      background: #0099c4;
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

    .screenings-section {
      margin-top: 30px;
    }

    .screenings-section h2 {
      font-size: 20px;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid #353535;
    }

    .screening-list {
      list-style: none;
    }

    .screening-item {
      display: flex;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #353535;
    }

    .screening-item:last-child {
      border-bottom: none;
    }

    .screening-date {
      width: 220px;
      font-weight: 500;
    }

    .screening-theatre {
      flex: 1;
      color: #888;
    }

    .screening-book {
      padding: 6px 12px;
      background: #4a7c7c;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      font-size: 13px;
    }

    .screening-book:hover {
      background: #3d6868;
    }

    .no-screenings {
      color: #606060;
      font-style: italic;
    }

    /* Mobile: hide full button text, show short text */
    .screening-book .short-text {
      display: none;
    }

    @media (max-width: 800px) {
      body {
        padding: 12px;
      }

      .movie-container {
        padding: 16px;
      }

      .screening-date {
        width: auto;
        min-width: 100px;
        text-align: left;
        line-height: 1.3;
        margin-right: 20px;
      }

      .screening-date .date-part {
        display: block;
      }

      .screening-date .time-part {
        display: block;
        font-weight: normal;
        font-size: 0.9em;
      }

      .screening-date .at-separator {
        display: none;
      }

      .screening-book .full-text {
        display: none;
      }

      .screening-book .short-text {
        display: inline;
      }
    }
  </style>
</head>
<body>
  <a href="/${fromDate ? `?date=${fromDate}` : ''}" class="back-link">← Back to Calendar</a>

  <div class="movie-container">
    <div class="movie-header">
      <div class="movie-poster">
        ${movie.poster_url
          ? `<img src="${movie.poster_url}" alt="${movie.title} poster">`
          : `<div class="movie-poster-placeholder">No poster</div>`
        }
      </div>
      <div class="movie-info">
        <h1 class="movie-title">${movie.title}</h1>
        <div class="movie-meta">
          ${movie.year ? `<span>${movie.year}</span>` : ''}
          ${movie.runtime ? `<span>${movie.runtime} min</span>` : ''}
          ${movie.director ? `<span>Dir: ${movie.director}</span>` : ''}
        </div>
        ${movie.tmdb_url ? `<a href="${movie.tmdb_url}" target="_blank" class="tmdb-link">View on TMDB</a>` : ''}
      </div>
    </div>

    <div class="screenings-section">
      <h2>Screenings</h2>
      ${futureScreenings.length === 0
        ? '<p class="no-screenings">No upcoming screenings</p>'
        : `<ul class="screening-list">
            ${futureScreenings.map(screening => {
              const screeningDate = new Date(screening.datetime);
              const dateStr = screeningDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });
              const timeStr = screeningDate.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              });

              return `
                <li class="screening-item">
                  <div class="screening-date"><span class="date-part">${dateStr}</span><span class="at-separator"> at </span><span class="time-part">${timeStr}</span></div>
                  <div class="screening-theatre">${screening.theatre_name}</div>
                  <a href="${screening.booking_url}" target="_blank" class="screening-book"><span class="full-text">Book Tickets</span><span class="short-text">Tix</span></a>
                </li>
              `;
            }).join('')}
          </ul>`
      }
    </div>
  </div>

  <div class="tmdb-modal-overlay" id="tmdbModal">
    <div class="tmdb-modal">
      <h3>Fix TMDB Match</h3>
      <div class="tmdb-search-row">
        <input type="password" id="tmdbTokenInput" placeholder="Admin token" style="flex: 1;">
      </div>
      <div class="tmdb-search-row">
        <input type="text" id="tmdbSearchInput" value="${movie.title.replace(/"/g, '&quot;')}">
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
      const movieId = ${movie.id};
      const modal = document.getElementById('tmdbModal');
      const input = document.getElementById('tmdbSearchInput');
      const tokenInput = document.getElementById('tmdbTokenInput');
      const results = document.getElementById('tmdbResults');

      function getToken() { return tokenInput.value; }

      var posterEl = document.querySelector('.movie-poster');
      var clickCount = 0;
      var clickTimer = null;
      posterEl.addEventListener('click', function() {
        clickCount++;
        clearTimeout(clickTimer);
        if (clickCount >= 10) {
          clickCount = 0;
          modal.classList.add('active');
        } else {
          clickTimer = setTimeout(function() { clickCount = 0; }, 3000);
        }
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
        fetch('/api/movie/' + movieId + '/tmdb-search?query=' + encodeURIComponent(query) + '&token=' + encodeURIComponent(getToken()))
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

      document.getElementById('tmdbIdBtn').addEventListener('click', function() {
        var idInput = document.getElementById('tmdbIdInput');
        var tmdbId = parseInt(idInput.value, 10);
        if (!tmdbId) return;
        applyTmdbId(tmdbId);
      });

      document.getElementById('tmdbIdInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') document.getElementById('tmdbIdBtn').click();
      });

      results.addEventListener('click', function(e) {
        var item = e.target.closest('.tmdb-result-item');
        if (!item) return;
        var tmdbId = parseInt(item.getAttribute('data-tmdb-id'), 10);
        applyTmdbId(tmdbId);
      });

      function applyTmdbId(tmdbId) {
        results.innerHTML = '<div class="tmdb-loading">Updating...</div>';
        fetch('/api/movie/' + movieId + '/tmdb-update?token=' + encodeURIComponent(getToken()), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
    })();
  </script>
  ${footer()}
</body>
</html>
  `;
}
