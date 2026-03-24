import { renderPage } from './layout.js';
import { escapeHtml, safeHref } from '../utils/html.js';
import { ScreeningWithMovie } from './index.js';

// Helper to format date for display
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Shorter date format for mobile
function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

// Helper to get prev/next day
function getPrevDay(date: Date): string {
  const prev = new Date(date);
  prev.setDate(prev.getDate() - 1);
  return prev.toISOString().split('T')[0];
}

function getNextDay(date: Date): string {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next.toISOString().split('T')[0];
}

const THEATRE_DISPLAY_NAMES: Record<string, string> = {
  'VIFF Lochmaddy Studio': 'VIFF Lochmaddy',
};

function displayName(theatre: string): string {
  return THEATRE_DISPLAY_NAMES[theatre] || theatre;
}

const PAGE_STYLES = `
    /* Header */
    .header {
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
    }

    .header h1 {
      font-size: 24px;
      font-weight: 600;
      min-width: 360px;
      text-align: center;
      position: relative;
      cursor: pointer;
    }

    .header h1:hover {
      color: #6a9a9a;
    }

    .date-picker-input {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
      border: none;
      font-size: 24px;
      z-index: 10;
    }

    .date-picker-input::-webkit-calendar-picker-indicator {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }

    .header .date-full,
    .header .date-short {
      pointer-events: none;
    }

    .header .date-short {
      display: none;
    }

    .nav-button {
      padding: 8px 16px;
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      cursor: pointer;
      text-decoration: none;
      color: #b0b0b0;
    }

    .nav-button:hover {
      background: #333333;
    }

    /* Movie-centric view */
    .movie-view {
      max-width: 500px;
      margin: 0 auto;
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
      .header {
        gap: 12px;
        margin-bottom: 16px;
      }

      .header h1 {
        font-size: 18px;
        min-width: 150px;
        text-align: center;
      }

      .header .date-full {
        display: none;
      }

      .header .date-short {
        display: inline;
      }

      .nav-button {
        padding: 8px 12px;
        font-size: 14px;
      }

      .movie-card-info {
        padding: 10px 12px;
      }

      .movie-card-header {
        margin-bottom: 6px;
      }

      .movie-screening-row {
        font-size: 13px;
      }

      .movie-screening-time {
        min-width: 65px;
      }
    }`;

export function renderMoviesPage(date: Date, screenings: ScreeningWithMovie[]): string {
  const prevDay = getPrevDay(date);
  const nextDay = getNextDay(date);
  const displayDate = formatDate(date);
  const displayDateShort = formatDateShort(date);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

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
    title: `By Movie - ${escapeHtml(displayDate)} - MovieCal`,
    styles: PAGE_STYLES,
    activePage: 'movies',
    body: `
  <div class="header">
    <a href="/movies?date=${prevDay}" class="nav-button">\u2190</a>
    <h1>
      <span class="date-full">${displayDate}</span>
      <span class="date-short">${displayDateShort}</span>
      <input type="date" id="datePicker" value="${dateStr}" class="date-picker-input" title="Pick a date">
    </h1>
    <a href="/movies?date=${nextDay}" class="nav-button">\u2192</a>
  </div>

  <div class="movie-view">
    ${!hasScreenings ? '<div class="no-screenings">No screenings for this day</div>' : ''}
    ${movieGroups.map(group => {
      const movie = group[0];
      return `
        <div class="movie-card">
          <div class="movie-card-info">
            <div class="movie-card-header">
              <div class="movie-card-title"><a href="/movie/${movie.movie_id}?from_date=${dateStr}">${escapeHtml(movie.movie_title)}</a></div>
              ${movie.movie_year ? `<span class="movie-card-year">(${movie.movie_year})</span>` : ''}
            </div>
            <div class="movie-card-screenings">
              ${group.map(s => {
                const time = new Date(s.datetime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                return `
                  <div class="movie-screening-row">
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
    var picker = document.getElementById('datePicker');
    picker.addEventListener('click', function(e) {
      e.preventDefault();
      try { picker.showPicker(); } catch(err) { console.log('showPicker failed:', err); }
    });
    picker.addEventListener('change', function() {
      window.location.href = '/movies?date=' + this.value;
    });
  </script>`,
  });
}
