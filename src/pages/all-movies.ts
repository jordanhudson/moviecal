import { footer } from './layout.js';
import { tmdbModalStyles, tmdbModalHtml, tmdbModalScript } from './tmdb-modal.js';

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

    ${tmdbModalStyles()}

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

  ${tmdbModalHtml()}
  ${tmdbModalScript()}
  <script>
    document.querySelector('.movie-list').addEventListener('click', function(e) {
      var btn = e.target.closest('.fix-btn');
      if (!btn) return;
      var movieId = parseInt(btn.getAttribute('data-movie-id'), 10);
      var title = btn.getAttribute('data-movie-title');
      TmdbModal.open(movieId, title);
    });
  </script>
  ${footer()}
</body>
</html>
  `;
}
