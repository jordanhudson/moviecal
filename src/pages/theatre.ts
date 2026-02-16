import { renderPage } from './layout.js';
import { escapeHtml, safeHref } from '../utils/html.js';
import { pacificNow } from '../utils/time.js';

// Theatre detail page

export interface TheatreScreening {
  id: number;
  datetime: Date;
  booking_url: string;
  movie_id: number;
  movie_title: string;
}

const PAGE_STYLES = `
    .theatre-container {
      background: #262626;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      max-width: 900px;
      margin: 0 auto;
    }

    .theatre-title {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 30px;
      padding-bottom: 15px;
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

    .screening-movie {
      flex: 1;
    }

    .screening-movie a {
      color: #6a9a9a;
      text-decoration: none;
    }

    .screening-movie a:hover {
      text-decoration: underline;
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
      .theatre-container {
        padding: 16px;
      }

      .screening-date {
        width: auto;
        min-width: 100px;
        text-align: left;
        line-height: 1.3;
        margin-right: 15px;
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

      .screening-movie {
        margin-right: 5px;
      }

      .screening-book .full-text {
        display: none;
      }

      .screening-book .short-text {
        display: inline;
      }
    }`;

export function renderTheatrePage(theatreName: string, screenings: TheatreScreening[]): string {
  const now = pacificNow();
  const futureScreenings = screenings.filter(s => new Date(s.datetime) >= now);

  return renderPage({
    title: `${escapeHtml(theatreName)} - MovieCal`,
    styles: PAGE_STYLES,
    body: `
  <a href="/" class="back-link">\u2190 Back to Calendar</a>

  <div class="theatre-container">
    <h1 class="theatre-title">${escapeHtml(theatreName)}</h1>

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
                <div class="screening-movie"><a href="/movie/${screening.movie_id}">${escapeHtml(screening.movie_title)}</a></div>
                <a href="${safeHref(screening.booking_url)}" target="_blank" class="screening-book"><span class="full-text">Book Tickets</span><span class="short-text">Tix</span></a>
              </li>
            `;
          }).join('')}
        </ul>`
    }
  </div>`,
  });
}
