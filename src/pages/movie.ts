import { renderPage } from './layout.js';
import { tmdbModalStyles, tmdbModalHtml, tmdbModalScript } from './tmdb-modal.js';
import { escapeHtml, safeHref } from '../utils/html.js';
import { pacificNow } from '../utils/time.js';

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

const PAGE_STYLES = `
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

    ${tmdbModalStyles()}

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

    /* Mobile: hide full button text, show short text */
    .screening-book .short-text {
      display: none;
    }

    @media (max-width: 800px) {
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
    }`;

export function renderMoviePage(movie: MovieDetail, screenings: ScreeningDetail[], fromDate?: string | null): string {
  const now = pacificNow();
  const futureScreenings = screenings.filter(s => new Date(s.datetime) >= now);

  return renderPage({
    title: `${escapeHtml(movie.title)} - MovieCal`,
    styles: PAGE_STYLES,
    body: `
  <a href="/${fromDate ? `?date=${fromDate}` : ''}" class="back-link">\u2190 Back to Calendar</a>

  <div class="movie-container">
    <div class="movie-header">
      <div class="movie-poster">
        ${movie.poster_url
          ? `<img src="${safeHref(movie.poster_url)}" alt="${escapeHtml(movie.title)} poster">`
          : `<div class="movie-poster-placeholder">No poster</div>`
        }
      </div>
      <div class="movie-info">
        <h1 class="movie-title">${escapeHtml(movie.title)}</h1>
        <div class="movie-meta">
          ${movie.year ? `<span>${movie.year}</span>` : ''}
          ${movie.runtime ? `<span>${movie.runtime} min</span>` : ''}
          ${movie.director ? `<span>Dir: ${movie.director}</span>` : ''}
        </div>
        ${movie.tmdb_url ? `<a href="${safeHref(movie.tmdb_url)}" target="_blank" class="tmdb-link">View on TMDB</a>` : ''}
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
                  <div class="screening-theatre">${escapeHtml(screening.theatre_name)}</div>
                  <a href="${safeHref(screening.booking_url)}" target="_blank" class="screening-book"><span class="full-text">Book Tickets</span><span class="short-text">Tix</span></a>
                </li>
              `;
            }).join('')}
          </ul>`
      }
    </div>
  </div>

  ${tmdbModalHtml()}
  ${tmdbModalScript()}
  <script>
    (function() {
      var posterEl = document.querySelector('.movie-poster');
      var clickCount = 0;
      var clickTimer = null;
      posterEl.addEventListener('click', function() {
        clickCount++;
        clearTimeout(clickTimer);
        if (clickCount >= 10) {
          clickCount = 0;
          TmdbModal.open(${movie.id}, ${JSON.stringify(movie.title)});
        } else {
          clickTimer = setTimeout(function() { clickCount = 0; }, 3000);
        }
      });
    })();
  </script>`,
  });
}
