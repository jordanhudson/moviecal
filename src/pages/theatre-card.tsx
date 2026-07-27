/** @jsxImportSource hono/jsx */
import { safeHref } from '../utils/html.js';

export interface TheatreCardTime {
  display: string;
  bookingUrl: string;
  /** Auditorium(s) this showtime is in, so one screen of a pooled venue can be hidden. */
  theatreNames?: string[];
}

export interface TheatreCardRow {
  label: string;
  labelLink?: string;
  times: TheatreCardTime[];
}

export interface TheatreCardProps {
  header: string;
  headerLink?: string;
  /** `theatre_name`s this card covers — the venue filter hides the card when all are hidden. */
  theatreNames?: string[];
  rows: TheatreCardRow[];
}

export function TheatreCard({ header, headerLink, theatreNames, rows }: TheatreCardProps) {
  return (
    <div
      class="theatre-card"
      {...(theatreNames?.length ? { 'data-theatres': theatreNames.join(',') } : {})}
    >
      <div class="theatre-card-header">
        {headerLink ? <a href={headerLink}>{header}</a> : <span>{header}</span>}
      </div>
      {rows.map((row) => (
        <div class="theatre-card-row">
          <div class="theatre-card-label">
            {row.labelLink ? <a href={row.labelLink}>{row.label}</a> : row.label}
          </div>
          <div class="theatre-card-times">
            {row.times.map((t) => (
              <a
                href={safeHref(t.bookingUrl)}
                target="_blank"
                class="theatre-card-time"
                {...(t.theatreNames?.length ? { 'data-theatres': t.theatreNames.join(',') } : {})}
              >
                {t.display}
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
