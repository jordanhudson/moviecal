/** @jsxImportSource hono/jsx */
import { safeHref } from '../utils/html.js';
import { pacificWallClock } from '../utils/time.js';

// Shared upcoming-screenings list, grouped by day with ticket links. Used by the
// movie detail page and the TMDB review page so they render identically.

export interface ScreeningInfo {
  datetime: Date;
  theatre_name: string;
  booking_url: string;
  note: string | null;
}

function groupByDay(screenings: ScreeningInfo[]): { dateStr: string; items: ScreeningInfo[] }[] {
  const now = new Date();
  const future = screenings.filter((s) => new Date(s.datetime) >= now);
  const groups: { dateStr: string; items: ScreeningInfo[] }[] = [];
  for (const screening of future) {
    const dateStr = pacificWallClock(new Date(screening.datetime))
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      .replace(',', '');
    const last = groups[groups.length - 1];
    if (last && last.dateStr === dateStr) last.items.push(screening);
    else groups.push({ dateStr, items: [screening] });
  }
  return groups;
}

export function ScreeningsList({ screenings }: { screenings: ScreeningInfo[] }) {
  const dayGroups = groupByDay(screenings);
  if (dayGroups.length === 0) {
    return <p class="no-screenings">No upcoming screenings</p>;
  }
  return (
    <>
      {dayGroups.map((group) => (
        <section class="day-group">
          <h3 class="day-header">{group.dateStr}</h3>
          <ul class="screening-list">
            {group.items.map((screening) => {
              const timeStr = pacificWallClock(new Date(screening.datetime)).toLocaleTimeString(
                'en-US',
                { hour: 'numeric', minute: '2-digit' },
              );
              return (
                <li class="screening-item" data-theatre={screening.theatre_name}>
                  <div class="screening-time">{timeStr}</div>
                  <div class="screening-theatre">
                    <a href={`/theatre/${encodeURIComponent(screening.theatre_name)}`}>
                      {screening.theatre_name}
                    </a>
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
        </section>
      ))}
    </>
  );
}
