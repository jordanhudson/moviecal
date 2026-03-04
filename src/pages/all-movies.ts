import { renderPage } from './layout.js';
import { tmdbModalStyles, tmdbModalHtml, tmdbModalScript } from './tmdb-modal.js';
import { escapeHtml, safeHref } from '../utils/html.js';

// All movies listing page

export interface MovieRow {
  id: number;
  title: string;
  year: number | null;
  runtime: number | null;
  poster_url: string | null;
  tmdb_id: number | null;
  letterboxd_url: string | null;
}

const PAGE_STYLES = `
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
      max-width: 900px;
      margin-left: auto;
      margin-right: auto;
    }

    .page-title {
      font-size: 24px;
      margin: 0;
    }

    .sort-select {
      padding: 6px 10px;
      background: #353535;
      color: #c5c5c5;
      border: 1px solid #454545;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
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
      .movie-row-meta span {
        display: inline;
      }
    }`;

export function renderAllMoviesPage(movies: MovieRow[], sort: string = 'added'): string {
  return renderPage({
    title: 'All Movies - MovieCal',
    styles: PAGE_STYLES,
    body: `
  <a href="/" class="back-link">\u2190 Back to Calendar</a>
  <div class="page-header">
    <h1 class="page-title">All Movies</h1>
    <select class="sort-select" onchange="window.location.href='/movies?sort='+this.value">
      <option value="added"${sort === 'added' ? ' selected' : ''}>Recently Added</option>
      <option value="title"${sort === 'title' ? ' selected' : ''}>Title</option>
      <option value="year"${sort === 'year' ? ' selected' : ''}>Year</option>
    </select>
  </div>

  <div class="movie-list">
    ${movies.map(movie => `
      <div class="movie-row">
        <div class="movie-row-poster">
          ${movie.poster_url
            ? `<img src="${safeHref(movie.poster_url.replace('/w500/', '/w92/'))}" alt="">`
            : '<div class="movie-row-poster-placeholder"></div>'
          }
        </div>
        <div class="movie-row-info">
          <div class="movie-row-title"><a href="/movie/${movie.id}">${escapeHtml(movie.title)}</a></div>
          <div class="movie-row-meta">
            ${movie.year ? `<span>${movie.year}</span>` : ''}
            ${movie.runtime ? `<span>${movie.year ? ' \u00b7 ' : ''}${movie.runtime} min</span>` : ''}
            ${movie.tmdb_id ? `<span>${movie.year || movie.runtime ? ' \u00b7 ' : ''}TMDB: ${movie.tmdb_id}</span>` : ''}
            <span> \u00b7 LB: ${movie.letterboxd_url === null ? 'null' : movie.letterboxd_url === 'MISS' ? 'MISS' : escapeHtml(movie.letterboxd_url)}</span>
          </div>
        </div>
        <button class="fix-btn" data-movie-id="${movie.id}" data-movie-title="${escapeHtml(movie.title)}">Fix Match</button>
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
  </script>`,
  });
}
