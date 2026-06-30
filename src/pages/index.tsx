/** @jsxImportSource hono/jsx */
import { renderPage } from './layout.js';
import { safeHref, jsonForScript } from '../utils/html.js';
import { movieUrl } from '../utils/movie-url.js';
import { pacificWallClock } from '../utils/time.js';
import { CINEPLEX_VENUES, auditoriumLabel } from '../venues.js';

const DEFAULT_RUNTIME_MINUTES = 105;
const MIN_DISPLAY_RUNTIME_MINUTES = 90;
const TIMELINE_START_HOUR = 10; // 10am
const TIMELINE_END_HOUR = 26; // 2am next day (24 + 2)

// Home page — By Date. Timeline view (desktop) + Listing view (mobile always, desktop optional).

export interface ScreeningWithMovie {
  screening_id: number;
  datetime: Date;
  theatre_name: string;
  booking_url: string;
  movie_id: number;
  movie_title: string;
  movie_year: number | null;
  movie_runtime: number | null;
  poster_url: string | null;
  tmdb_url: string | null;
  letterboxd_url: string | null;
  movie_created_at?: Date;
  tmdb_popularity?: number | null;
}

export interface TheatreRow {
  theatre: string;
  screenings: ScreeningWithMovie[];
}

export interface ListingGroup {
  venue: string;
  theatreName?: string;
  movies: {
    movie_id: number;
    movie_title: string;
    movie_year?: number | null;
    movie_runtime?: number | null;
    poster_url: string | null;
    letterboxd_url: string | null;
    tmdb_url: string | null;
    showtimes: { datetime: Date; booking_url: string }[];
  }[];
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

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

function calculatePosition(
  datetime: Date,
  runtime: number | null,
): { left: string; width: string } {
  const hours = datetime.getHours();
  const minutes = datetime.getMinutes();

  const startMinutes = TIMELINE_START_HOUR * 60;
  const endMinutes = TIMELINE_END_HOUR * 60;
  const totalMinutes = endMinutes - startMinutes;

  let screeningMinutes = hours * 60 + minutes;
  if (screeningMinutes < startMinutes) {
    screeningMinutes += 24 * 60;
  }
  const minutesFromStart = screeningMinutes - startMinutes;
  const leftPercent = (minutesFromStart / totalMinutes) * 100;

  // Pad the runtime by 15 min for the block width only (accounts for trailers /
  // turnover so cells don't visually butt up against the next showing). This is
  // the ONLY place 15 min is added — display runtimes elsewhere stay unmodified.
  const TIMELINE_CELL_PADDING_MINUTES = 15;
  const movieRuntime = (runtime || DEFAULT_RUNTIME_MINUTES) + TIMELINE_CELL_PADDING_MINUTES;
  const effectiveRuntime = Math.max(movieRuntime, MIN_DISPLAY_RUNTIME_MINUTES);
  const widthPercent = (effectiveRuntime / totalMinutes) * 100;

  return { left: `${Math.max(0, leftPercent)}%`, width: `${widthPercent}%` };
}

function formatTime(d: Date): string {
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() >= 12 ? 'pm' : 'am';
  return `${h}:${m}${ampm}`;
}

// Balance showtime buttons across rows: at most 3 per row, but pick a column
// count that evens out the last row (e.g. 4 → 2×2 instead of 3+1).
function showTimeCols(n: number): number {
  if (n <= 1) return 1;
  const rows = Math.ceil(n / 3);
  return Math.ceil(n / rows);
}

function metaLine(year?: number | null, runtime?: number | null): string {
  return [year, runtime ? `${runtime} min` : null].filter(Boolean).join(' · ');
}

const TIME_LABELS = [
  '10am',
  '11am',
  '12pm',
  '1pm',
  '2pm',
  '3pm',
  '4pm',
  '5pm',
  '6pm',
  '7pm',
  '8pm',
  '9pm',
  '10pm',
  '11pm',
  '12am',
  '1am',
];

// Distinct gradient per movie for poster placeholders (stable by id)
const POSTER_GRADS = [
  'linear-gradient(155deg,#c2410c,#7c2d12)',
  'linear-gradient(155deg,#0f766e,#134e4a)',
  'linear-gradient(155deg,#6d28d9,#4c1d95)',
  'linear-gradient(155deg,#be185d,#831843)',
  'linear-gradient(155deg,#0369a1,#0c4a6e)',
  'linear-gradient(155deg,#a16207,#713f12)',
];
function posterGrad(id: number): string {
  return POSTER_GRADS[id % POSTER_GRADS.length];
}

export function renderIndexPage(
  date: Date,
  theatres: TheatreRow[],
  listingGroups: ListingGroup[],
): string {
  const prevDay = getPrevDay(date);
  const nextDay = getNextDay(date);
  const displayDate = formatDate(date);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const hasScreenings = theatres.some((t) => t.screenings.length > 0) || listingGroups.length > 0;

  return renderPage({
    title: `Vancouver Movie Showtimes ${displayDate} — MovieClock`,
    description: `Movie showtimes in Vancouver for ${displayDate} — Cinematheque, VIFF, Rio Theatre, Park Theatre, Cineplex, and more.`,
    canonicalPath: '/',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'MovieClock',
      url: 'https://movieclock.app',
      description: 'Movie showtimes for Vancouver independent and repertory cinemas.',
    },
    styles: ['/css/index.css'],
    scripts: ['/js/index.js'],
    activePage: 'home',
    body: (
      <>
        {/* Cineplex venue grouping for the chip/filter logic in index.js.
            A data block (type="application/json"), so it's exempt from script-src. */}
        <script
          type="application/json"
          id="cineplexVenues"
          dangerouslySetInnerHTML={{ __html: jsonForScript(CINEPLEX_VENUES) }}
        />
        <div class="datebar">
          <div class="datebar-head">
            <div>
              <h1 class="date-h1">Vancouver Movie Showtimes</h1>
              <div class="date-sub">{displayDate}</div>
            </div>
            <div class="view-toggle">
              <button class="active" data-view="listing">
                Listing
              </button>
              <button data-view="timeline">Timeline</button>
            </div>
          </div>

          <p class="datebar-intro">
            Movie showtimes for independent and repertory cinemas in Vancouver &mdash; The
            Cinematheque, VIFF Centre, the Rio, Park, and Hollywood theatres, plus Cineplex. Updated
            through the day.
          </p>

          <div class="rail-wrap">
            <a class="rail-arrow" href={`/date/${prevDay}`} aria-label="Previous day">
              {'‹'}
            </a>
            <div class="rail" id="dateRail" data-selected={dateStr}>
              {/* filled client-side; SEO/no-JS fallback below */}
              <noscript>
                <a class="day on">
                  <span class="num">{date.getDate()}</span>
                </a>
              </noscript>
            </div>
            <a class="rail-arrow" href={`/date/${nextDay}`} aria-label="Next day">
              {'›'}
            </a>
            <label class="rail-cal" title="Pick a date">
              <span aria-hidden="true">{'📅'}</span>
              <input type="date" id="datePicker" value={dateStr} aria-label="Pick a date" />
            </label>
          </div>

          {listingGroups.length > 0 && (
            <div class="chips" id="chips">
              {listingGroups.map((g) => (
                <button class="chip on" data-theatre={g.venue}>
                  {auditoriumLabel(g.venue)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div id="viewsWrapper" data-view="listing">
          {!hasScreenings && (
            <div class="no-screenings">No screenings for this day — try another date.</div>
          )}

          {/* ---- Timeline view (desktop only) ---- */}
          <div class="timeline-view">
            <div class="timeline-container">
              <div class="time-labels">
                {TIME_LABELS.map((label) => (
                  <div class="time-label">{label}</div>
                ))}
              </div>
              {theatres.map(({ theatre, screenings }) => (
                <div class="theatre-row" data-theatre={theatre}>
                  <div class="theatre-label">
                    <a href={`/theatre/${encodeURIComponent(theatre)}`}>
                      {auditoriumLabel(theatre)}
                    </a>
                    <button class="row-hide" title={`Hide ${theatre}`}>
                      hide
                    </button>
                  </div>
                  <div class="timeline">
                    {screenings.map((screening) => {
                      const localDt = pacificWallClock(new Date(screening.datetime));
                      const { left, width } = calculatePosition(localDt, screening.movie_runtime);
                      const time = formatTime(localDt).replace(/(am|pm)$/, '');
                      const lookupUrl = screening.letterboxd_url ?? screening.tmdb_url;
                      return (
                        <div class="screening" style={`left: ${left}; width: ${width};`}>
                          <a
                            href={movieUrl(screening.movie_id, screening.movie_title)}
                            class="screening-overlay"
                            title={screening.movie_title}
                            aria-label={screening.movie_title}
                          ></a>
                          <span class="screening-title">{screening.movie_title}</span>
                          <div class="screening-bottom">
                            <div class="screening-time">{time}</div>
                            <div class="screening-links">
                              <a
                                href={safeHref(screening.booking_url)}
                                target="_blank"
                                class="screening-link"
                                title="Book tickets"
                                aria-label={`Book tickets for ${screening.movie_title}`}
                              >
                                <span aria-hidden="true">{'🎟️'}</span>
                              </a>
                              {lookupUrl && (
                                <a
                                  href={safeHref(lookupUrl)}
                                  target="_blank"
                                  class="screening-link"
                                  title={
                                    screening.letterboxd_url ? 'View on Letterboxd' : 'View on TMDB'
                                  }
                                  aria-label={
                                    screening.letterboxd_url ? 'View on Letterboxd' : 'View on TMDB'
                                  }
                                >
                                  <span aria-hidden="true">{'🔍'}</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div class="hidden-screens" id="hiddenScreens" style="display:none"></div>
          </div>

          {/* ---- Listing view (mobile always; desktop optional) ---- */}
          <div class="listing-view">
            {listingGroups.map((group) => (
              <section class="venue-card" data-theatre={group.venue}>
                <div class="venue-head">
                  {group.theatreName ? (
                    <a href={`/theatre/${encodeURIComponent(group.theatreName)}`}>
                      {auditoriumLabel(group.venue)}
                    </a>
                  ) : (
                    <span>{auditoriumLabel(group.venue)}</span>
                  )}
                </div>
                {group.movies.map((movie) => (
                  <div class="film-row">
                    <a
                      class="film-poster"
                      href={movieUrl(movie.movie_id, movie.movie_title)}
                      style={movie.poster_url ? '' : `background:${posterGrad(movie.movie_id)}`}
                    >
                      {movie.poster_url && (
                        <img
                          src={safeHref(movie.poster_url)}
                          alt=""
                          loading="lazy"
                          width="500"
                          height="750"
                        />
                      )}
                    </a>
                    <div class="film-body">
                      <a class="film-title" href={movieUrl(movie.movie_id, movie.movie_title)}>
                        {movie.movie_title}
                      </a>
                      <div class="film-meta">{metaLine(movie.movie_year, movie.movie_runtime)}</div>
                    </div>
                    <div
                      class="show-times"
                      style={`grid-template-columns: repeat(${showTimeCols(movie.showtimes.length)}, auto)`}
                    >
                      {movie.showtimes.map((st) => (
                        <a class="show-time" href={safeHref(st.booking_url)} target="_blank">
                          {formatTime(pacificWallClock(new Date(st.datetime)))}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
      </>
    ),
  });
}
