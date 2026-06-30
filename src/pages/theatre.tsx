/** @jsxImportSource hono/jsx */
import { renderPage } from './layout.js';
import { safeHref } from '../utils/html.js';
import { pacificWallClock } from '../utils/time.js';
import { movieUrl } from '../utils/movie-url.js';

export interface TheatreScreening {
  id: number;
  datetime: Date;
  booking_url: string;
  note: string | null;
  movie_id: number;
  movie_title: string;
}

export function renderTheatrePage(theatreName: string, screenings: TheatreScreening[]): string {
  const now = new Date();
  const futureScreenings = screenings.filter((s) => new Date(s.datetime) >= now);

  const dayGroups: { dateStr: string; items: TheatreScreening[] }[] = [];
  for (const screening of futureScreenings) {
    const dateStr = pacificWallClock(new Date(screening.datetime))
      .toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      .replace(',', '');
    const lastGroup = dayGroups[dayGroups.length - 1];
    if (lastGroup && lastGroup.dateStr === dateStr) {
      lastGroup.items.push(screening);
    } else {
      dayGroups.push({ dateStr, items: [screening] });
    }
  }

  return renderPage({
    title: `${theatreName} Showtimes Vancouver — MovieClock`,
    description: `Upcoming movie showtimes at ${theatreName} in Vancouver.`,
    canonicalPath: `/theatre/${encodeURIComponent(theatreName)}`,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'MovieTheater',
        name: theatreName,
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Vancouver',
          addressRegion: 'BC',
          addressCountry: 'CA',
        },
        url: `https://movieclock.app/theatre/${encodeURIComponent(theatreName)}`,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://movieclock.app/' },
          {
            '@type': 'ListItem',
            position: 2,
            name: theatreName,
            item: `https://movieclock.app/theatre/${encodeURIComponent(theatreName)}`,
          },
        ],
      },
    ],
    styles: ['/css/theatre.css'],
    body: (
      <div class="theatre-container">
        <h1 class="theatre-title">{theatreName}</h1>

        {futureScreenings.length === 0 ? (
          <p class="no-screenings">No upcoming screenings</p>
        ) : (
          dayGroups.map((group) => (
            <section class="day-group">
              <h2 class="day-header">{group.dateStr}</h2>
              <ul class="screening-list">
                {group.items.map((screening) => {
                  const timeStr = pacificWallClock(new Date(screening.datetime)).toLocaleTimeString(
                    'en-US',
                    {
                      hour: 'numeric',
                      minute: '2-digit',
                    },
                  );

                  return (
                    <li class="screening-item">
                      <div class="screening-time">{timeStr}</div>
                      <div class="screening-movie">
                        <a href={movieUrl(screening.movie_id, screening.movie_title)}>
                          {screening.movie_title}
                        </a>
                        {screening.note && <div class="screening-note">{screening.note}</div>}
                      </div>
                      <a
                        href={safeHref(screening.booking_url)}
                        target="_blank"
                        class="screening-book"
                      >
                        <span class="full-text">Book Tickets</span>
                        <span class="short-text">Tix</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    ),
  });
}
