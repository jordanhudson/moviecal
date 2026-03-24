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

    .movie-view-heading {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #c5c5c5;
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
    .sort((a, b) => a[0].movie_title.localeCompare(b[0].movie_title));

  return renderPage({
    title: 'Upcoming Movies in Vancouver Cinemas — MovieCal',
    description: 'Browse all upcoming movies playing in Vancouver independent and repertory cinemas, with showtimes and ticket links.',
    canonicalPath: '/movies',
    styles: PAGE_STYLES,
    activePage: 'movies',
    body: `
  <div class="movie-view">
    <h1 class="movie-view-heading">Upcoming Movies in Vancouver</h1>
    ${!hasScreenings ? '<div class="no-screenings">No upcoming screenings</div>' : ''}
    ${movieGroups.map(group => {
      const movie = group[0];

      return `
        <div class="movie-card">
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
  </script>`,
  });
}
