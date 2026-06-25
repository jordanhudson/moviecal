/** @jsxImportSource hono/jsx */
import { safeHref } from '../utils/html.js';

export interface TheatreCardTime {
  display: string;
  bookingUrl: string;
}

export interface TheatreCardRow {
  label: string;
  labelLink?: string;
  times: TheatreCardTime[];
}

export interface TheatreCardProps {
  header: string;
  headerLink?: string;
  dataTheatre?: string;
  hideLink?: boolean;
  rows: TheatreCardRow[];
}

export function TheatreCard({ header, headerLink, dataTheatre, hideLink, rows }: TheatreCardProps) {
  return (
    <div class="theatre-card" {...(dataTheatre ? { 'data-theatre': dataTheatre } : {})}>
      <div class="theatre-card-header">
        {headerLink ? <a href={headerLink}>{header}</a> : <span>{header}</span>}
        {hideLink && <span class="hide-link">Hide</span>}
      </div>
      {rows.map((row) => (
        <div class="theatre-card-row">
          <div class="theatre-card-label">
            {row.labelLink ? <a href={row.labelLink}>{row.label}</a> : row.label}
          </div>
          <div class="theatre-card-times">
            {row.times.map((t) => (
              <a href={safeHref(t.bookingUrl)} target="_blank" class="theatre-card-time">
                {t.display}
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
