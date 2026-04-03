import { renderPage } from './layout.js';
import { escapeHtml, safeHref } from '../utils/html.js';
import { ScreeningWithMovie } from './index.js';

const THEATRE_DISPLAY_NAMES: Record<string, string> = {
  'VIFF Lochmaddy Studio': 'VIFF Lochmaddy',
};

function displayName(theatre: string): string {
  return THEATRE_DISPLAY_NAMES[theatre] || theatre;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const PAGE_STYLES = `
    /* Movie-centric view */
    .movie-view {
      max-width: 500px;
      margin: 0 auto;
    }

    .movie-view-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .movie-view-heading {
      font-size: 20px;
      font-weight: 600;
      color: #c5c5c5;
    }

    .sort-wrapper {
      position: relative;
    }

    .sort-btn {
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      color: #b0b0b0;
      padding: 6px 12px;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
    }

    .sort-btn:hover {
      background: #333333;
    }

    .sort-menu {
      display: none;
      position: absolute;
      right: 0;
      top: 100%;
      margin-top: 4px;
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      overflow: hidden;
      z-index: 10;
    }

    .sort-menu.open {
      display: block;
    }

    .sort-option {
      display: block;
      width: 100%;
      padding: 8px 16px;
      background: none;
      border: none;
      color: #b0b0b0;
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      white-space: nowrap;
      font-family: inherit;
    }

    .sort-option:hover {
      background: #333333;
    }

    .sort-option.active {
      color: #6a9a9a;
    }

    .movie-card {
      display: flex;
      background: #262626;
      border-radius: 8px;
      margin-bottom: 8px;
      overflow: hidden;
    }

    .movie-card-info {
      flex: 1;
      padding: 12px 16px;
      min-width: 0;
    }

    .movie-card-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 8px;
    }

    .movie-card-title {
      font-weight: 600;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .movie-card-title a {
      color: #d0d0d0;
      text-decoration: none;
    }

    .movie-card-title a:hover {
      color: #6a9a9a;
    }

    .movie-card-year {
      color: #707070;
      font-size: 13px;
      flex-shrink: 0;
    }

    .movie-card-screenings {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .movie-screening-row {
      display: flex;
      align-items: center;
      font-size: 14px;
    }

    .movie-screening-date {
      color: #888;
      min-width: 100px;
      flex-shrink: 0;
    }

    .movie-screening-time {
      color: #a0a0a0;
      min-width: 75px;
      flex-shrink: 0;
    }

    .movie-screening-theatre {
      flex: 1;
      color: #707070;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .movie-screening-theatre a {
      color: #707070;
      text-decoration: none;
    }

    .movie-screening-theatre a:hover {
      color: #6a9a9a;
    }

    .movie-screening-tix {
      padding: 3px 10px;
      background: #4a7c7c;
      color: white;
      text-decoration: none;
      border-radius: 3px;
      font-size: 12px;
      margin-left: 8px;
      flex-shrink: 0;
    }

    .movie-screening-tix:hover {
      background: #5a8c8c;
    }

    .no-screenings {
      text-align: center;
      padding: 40px;
    }

    /* Mobile breakpoint */
    @media (max-width: 800px) {
      .movie-card-info {
        padding: 10px 12px;
      }

      .movie-card-header {
        margin-bottom: 6px;
      }

      .movie-screening-row {
        font-size: 13px;
      }

      .movie-screening-date {
        min-width: 80px;
      }

      .movie-screening-time {
        min-width: 65px;
      }
    }`;

export function renderMoviesPage(screenings: ScreeningWithMovie[]): string {
  const hasScreenings = screenings.length > 0;

  // Group screenings by movie
  const movieMap = new Map<number, ScreeningWithMovie[]>();
  for (const s of screenings) {
    if (!movieMap.has(s.movie_id)) {
      movieMap.set(s.movie_id, []);
    }
    movieMap.get(s.movie_id)!.push(s);
  }
  const movieGroups = Array.from(movieMap.values())
    .map(group => group.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()))
    .sort((a, b) => new Date(b[0].movie_created_at || 0).getTime() - new Date(a[0].movie_created_at || 0).getTime());

  return renderPage({
    title: 'Upcoming Movies in Vancouver Cinemas — MovieCal',
    description: 'Browse all upcoming movies playing in Vancouver independent and repertory cinemas, with showtimes and ticket links.',
    canonicalPath: '/movies',
    styles: PAGE_STYLES,
    activePage: 'movies',
    body: `
  <div class="movie-view">
    <div class="movie-view-header">
      <h1 class="movie-view-heading">Upcoming Movies in Vancouver</h1>
      <div class="sort-wrapper">
        <button class="sort-btn" id="sortBtn">Sort</button>
        <div class="sort-menu" id="sortMenu">
          <button class="sort-option" data-sort="date-added">Date Added</button>
          <button class="sort-option" data-sort="name">Name</button>
          <button class="sort-option" data-sort="popularity">Popularity</button>
        </div>
      </div>
    </div>
    ${!hasScreenings ? '<div class="no-screenings">No upcoming screenings</div>' : ''}
    <div id="movieList">
    ${movieGroups.map(group => {
      const movie = group[0];
      const createdAt = movie.movie_created_at ? new Date(movie.movie_created_at).getTime() : 0;

      return `
        <div class="movie-card" data-title="${escapeHtml(movie.movie_title)}" data-created="${createdAt}" data-popularity="${movie.tmdb_popularity ?? 0}">
          <div class="movie-card-info">
            <div class="movie-card-header">
              <div class="movie-card-title"><a href="/movie/${movie.movie_id}">${escapeHtml(movie.movie_title)}</a></div>
              ${movie.movie_year ? `<span class="movie-card-year">(${movie.movie_year})</span>` : ''}
            </div>
            <div class="movie-card-screenings">
              ${group.map(s => {
                const dt = new Date(s.datetime);
                const date = formatShortDate(dt);
                const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                return `
                  <div class="movie-screening-row" data-theatre="${escapeHtml(s.theatre_name)}">
                    <span class="movie-screening-date">${date}</span>
                    <span class="movie-screening-time">${time}</span>
                    <span class="movie-screening-theatre"><a href="/theatre/${encodeURIComponent(s.theatre_name)}">${escapeHtml(displayName(s.theatre_name))}</a></span>
                    <a href="${safeHref(s.booking_url)}" target="_blank" class="movie-screening-tix">Tix</a>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('')}
    </div>
  </div>
  <script>
    (function() {
      try {
        var hidden = JSON.parse(localStorage.getItem('hiddenTheatres') || '[]');
        if (!hidden.length) return;
        document.querySelectorAll('.movie-screening-row[data-theatre]').forEach(function(row) {
          if (hidden.indexOf(row.dataset.theatre) !== -1) row.style.display = 'none';
        });
        document.querySelectorAll('.movie-card').forEach(function(card) {
          var visible = card.querySelectorAll('.movie-screening-row:not([style*="display: none"])');
          if (visible.length === 0) card.style.display = 'none';
        });
      } catch(e) {}
    })();

    (function() {
      var btn = document.getElementById('sortBtn');
      var menu = document.getElementById('sortMenu');
      var list = document.getElementById('movieList');
      var savedSort = localStorage.getItem('movieSort') || 'date-added';

      function updateActive(sort) {
        menu.querySelectorAll('.sort-option').forEach(function(o) {
          o.classList.toggle('active', o.dataset.sort === sort);
        });
      }

      function sortCards(sort) {
        var cards = Array.from(list.querySelectorAll('.movie-card'));
        cards.sort(function(a, b) {
          if (sort === 'name') return a.dataset.title.localeCompare(b.dataset.title);
          if (sort === 'popularity') return Number(b.dataset.popularity) - Number(a.dataset.popularity);
          return Number(b.dataset.created) - Number(a.dataset.created);
        });
        cards.forEach(function(c) { list.appendChild(c); });
        localStorage.setItem('movieSort', sort);
        updateActive(sort);
      }

      sortCards(savedSort);

      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        menu.classList.toggle('open');
      });

      menu.querySelectorAll('.sort-option').forEach(function(opt) {
        opt.addEventListener('click', function() {
          sortCards(opt.dataset.sort);
          menu.classList.remove('open');
        });
      });

      document.addEventListener('click', function() {
        menu.classList.remove('open');
      });
    })();
  </script>`,
  });
}
