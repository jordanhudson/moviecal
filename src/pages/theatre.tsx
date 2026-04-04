/** @jsxImportSource hono/jsx */
import { renderPage } from './layout.js';
import { safeHref } from '../utils/html.js';
import { pacificNow } from '../utils/time.js';

export interface TheatreScreening {
  id: number;
  datetime: Date;
  booking_url: string;
  note: string | null;
  movie_id: number;
  movie_title: string;
}

export function renderTheatrePage(theatreName: string, screenings: TheatreScreening[]): string {
  const now = pacificNow();
  const futureScreenings = screenings.filter(s => new Date(s.datetime) >= now);

  return renderPage({
    title: `${theatreName} Showtimes Vancouver — MovieCal`,
    description: `Upcoming movie showtimes at ${theatreName} in Vancouver.`,
    canonicalPath: `/theatre/${encodeURIComponent(theatreName)}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'MovieTheater',
      name: theatreName,
      address: { '@type': 'PostalAddress', addressLocality: 'Vancouver', addressRegion: 'BC', addressCountry: 'CA' },
      url: `https://movieclock.fly.dev/theatre/${encodeURIComponent(theatreName)}`,
    },
    styles: ['/css/theatre.css'],
    body: (
      <div class="theatre-container">
        <h1 class="theatre-title">{theatreName}</h1>

        {futureScreenings.length === 0
          ? <p class="no-screenings">No upcoming screenings</p>
          : <ul class="screening-list">
              {futureScreenings.map(screening => {
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

                return (
                  <li class="screening-item">
                    <div class="screening-date">
                      <span class="date-part">{dateStr}</span>
                      <span class="at-separator"> at </span>
                      <span class="time-part">{timeStr}</span>
                    </div>
                    <div class="screening-movie">
                      <a href={`/movie/${screening.movie_id}`}>{screening.movie_title}</a>
                      {screening.note && <div class="screening-note">{screening.note}</div>}
                    </div>
                    <a href={safeHref(screening.booking_url)} target="_blank" class="screening-book">
                      <span class="full-text">Book Tickets</span>
                      <span class="short-text">Tix</span>
                    </a>
                  </li>
                );
              })}
            </ul>
        }
      </div>
    ),
  });
}
