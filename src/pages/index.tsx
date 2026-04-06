/** @jsxImportSource hono/jsx */
import { renderPage } from './layout.js';
import { safeHref } from '../utils/html.js';
import { TheatreCard } from './theatre-card.js';

const DEFAULT_RUNTIME_MINUTES = 105;
const MIN_DISPLAY_RUNTIME_MINUTES = 90;
const TIMELINE_START_HOUR = 10; // 10am
const TIMELINE_END_HOUR = 26;   // 2am next day (24 + 2)

// Home page - Timeline view (desktop) and Agenda view (mobile)

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
    poster_url: string | null;
    letterboxd_url: string | null;
    tmdb_url: string | null;
    showtimes: { datetime: Date; booking_url: string }[];
  }[];
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
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

function calculatePosition(datetime: Date, runtime: number | null): { left: string; width: string } {
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

  const movieRuntime = runtime || DEFAULT_RUNTIME_MINUTES;
  const effectiveRuntime = Math.max(movieRuntime, MIN_DISPLAY_RUNTIME_MINUTES);
  const widthPercent = (effectiveRuntime / totalMinutes) * 100;

  return {
    left: `${Math.max(0, leftPercent)}%`,
    width: `${widthPercent}%`
  };
}

const THEATRE_DISPLAY_NAMES: Record<string, string> = {
  'VIFF Lochmaddy Studio': 'VIFF Lochmaddy',
};

function displayName(theatre: string): string {
  return THEATRE_DISPLAY_NAMES[theatre] || theatre;
}

const TIME_LABELS = ['10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm', '10pm', '11pm', '12am', '1am'];

const INDEX_SCRIPT = `
    // View toggle
    var wrapper = document.getElementById('viewsWrapper');
    var pageContent = document.querySelector('.page-content');
    var savedView = localStorage.getItem('viewMode') || 'timeline';
    wrapper.dataset.view = savedView;
    pageContent.dataset.view = savedView;
    document.querySelectorAll('.view-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.view === savedView);
      btn.addEventListener('click', function() {
        var view = btn.dataset.view;
        wrapper.dataset.view = view;
        pageContent.dataset.view = view;
        localStorage.setItem('viewMode', view);
        document.querySelectorAll('.view-btn').forEach(function(b) {
          b.classList.toggle('active', b.dataset.view === view);
        });
      });
    });

    // Hidden theatres
    function getHidden() {
      try { return JSON.parse(localStorage.getItem('hiddenTheatres') || '[]'); }
      catch { return []; }
    }

    function saveHidden(list) {
      localStorage.setItem('hiddenTheatres', JSON.stringify(list));
    }

    function hideTheatre(name) {
      var list = getHidden();
      if (list.indexOf(name) === -1) list.push(name);
      saveHidden(list);
      applyHidden();
    }

    function unhideTheatre(name) {
      var list = getHidden().filter(function(n) { return n !== name; });
      saveHidden(list);
      applyHidden();
    }

    function toggleHidden() {
      var section = document.getElementById('hiddenSection');
      var btn = document.getElementById('hiddenToggle');
      if (section.style.display === 'block') {
        section.style.display = 'none';
        btn.textContent = 'Show Hidden Theatres';
      } else {
        section.style.display = 'block';
        btn.textContent = "Don't Show Hidden Theatres";
      }
    }

    document.getElementById('hiddenToggle').addEventListener('click', toggleHidden);

    // Event delegation for hide/unhide links
    document.addEventListener('click', function(e) {
      var link = e.target.closest('.hide-link');
      if (!link) return;
      var theatreEl = link.closest('[data-theatre]');
      if (!theatreEl) return;
      var name = theatreEl.dataset.theatre;
      if (link.textContent === 'Unhide') {
        unhideTheatre(name);
      } else {
        hideTheatre(name);
      }
    });

    function cloneForUnhide(selector, name) {
      var el = document.querySelector(selector + ' > [data-theatre="' + CSS.escape(name) + '"]');
      if (!el) return '';
      var clone = el.cloneNode(true);
      clone.style.display = '';
      var link = clone.querySelector('.hide-link');
      if (link) link.textContent = 'Unhide';
      return clone.outerHTML;
    }

    function applyHidden() {
      var hidden = getHidden();
      var footer = document.getElementById('hiddenFooter');
      var section = document.getElementById('hiddenSection');
      var btn = document.getElementById('hiddenToggle');

      // Show/hide theatre rows in main views
      document.querySelectorAll('[data-theatre]').forEach(function(el) {
        if (el.closest('#hiddenSection')) return;
        el.style.display = hidden.indexOf(el.dataset.theatre) !== -1 ? 'none' : '';
      });

      // Build hidden section content
      if (hidden.length === 0) {
        footer.style.display = 'none';
        section.style.display = 'none';
        return;
      }

      footer.style.display = 'block';
      if (section.style.display !== 'block') {
        btn.textContent = 'Show Hidden Theatres';
      }

      var desktopRows = '';
      var listingRows = '';
      hidden.forEach(function(name) {
        desktopRows += cloneForUnhide('.timeline-container', name);
        listingRows += cloneForUnhide('.listing-container', name);
      });

      section.innerHTML =
        '<div class="timeline-container">' + desktopRows + '</div>' +
        '<div class="listing-container">' + listingRows + '</div>';
    }

    applyHidden();

    var picker = document.getElementById('datePicker');
    picker.addEventListener('click', function(e) {
      e.preventDefault();
      try { picker.showPicker(); } catch(err) { console.log('showPicker failed:', err); }
    });
    picker.addEventListener('change', function() {
      window.location.href = '/?date=' + this.value;
    });
`;

export function renderIndexPage(date: Date, theatres: TheatreRow[], listingGroups: ListingGroup[] = []): string {
  const prevDay = getPrevDay(date);
  const nextDay = getNextDay(date);
  const displayDate = formatDate(date);
  const displayDateShort = formatDateShort(date);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const hasScreenings = theatres.some(t => t.screenings.length > 0) || listingGroups.length > 0;

  return renderPage({
    title: `Vancouver Movie Showtimes ${displayDate} — MovieCal`,
    description: `Movie showtimes in Vancouver for ${displayDate} — Cinematheque, VIFF, Rio Theatre, Park Theatre, Cineplex, and more.`,
    canonicalPath: '/',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'MovieCal',
      url: 'https://movieclock.fly.dev',
      description: 'Movie showtimes for Vancouver independent and repertory cinemas.',
    },
    styles: ['/css/theatre-card.css', '/css/index.css'],
    activePage: 'home',
    body: (
      <>
        <div class="header">
          <a href={`/?date=${prevDay}`} class="nav-button">{'\u2190'}</a>
          <h1>
            <span class="date-full">{displayDate}</span>
            <span class="date-short">{displayDateShort}</span>
            <input type="date" id="datePicker" value={dateStr} class="date-picker-input" title="Pick a date" />
          </h1>
          <a href={`/?date=${nextDay}`} class="nav-button">{'\u2192'}</a>
          <div class="view-toggle">
            <button class="view-btn active" data-view="timeline">Timeline</button>
            <button class="view-btn" data-view="listing">Listing</button>
          </div>
        </div>

        <div id="viewsWrapper" data-view="timeline">

          {/* Desktop Timeline View */}
          <div class="timeline-container">
            <div class="time-labels">
              {TIME_LABELS.map(label => <div class="time-label">{label}</div>)}
            </div>

            {!hasScreenings && <div class="no-screenings">No screenings for this day</div>}

            {theatres.map(({ theatre, screenings }) => (
              <div class="theatre-row" data-theatre={theatre}>
                <div class="theatre-label">
                  <a href={`/theatre/${encodeURIComponent(theatre)}`}>{displayName(theatre)}</a>
                  <span class="hide-link">Hide</span>
                </div>
                <div class="timeline">
                  {screenings.map(screening => {
                    const { left, width } = calculatePosition(new Date(screening.datetime), screening.movie_runtime);
                    const timeDate = new Date(screening.datetime);
                    const h = timeDate.getHours() % 12 || 12;
                    const m = String(timeDate.getMinutes()).padStart(2, '0');
                    const time = `${h}:${m}`;
                    const lookupUrl = screening.letterboxd_url || screening.tmdb_url;

                    return (
                      <div class="screening" style={`left: ${left}; width: ${width};`}>
                        <a href={`/movie/${screening.movie_id}`} class="screening-overlay" title={screening.movie_title}></a>
                        <span class="screening-title">{screening.movie_title}</span>
                        <div class="screening-bottom">
                          <div class="screening-time">{time}</div>
                          <div class="screening-links">
                            <a href={safeHref(screening.booking_url)} target="_blank" class="screening-link" title="Book tickets">{'\uD83C\uDF9F\uFE0F'}</a>
                            {lookupUrl && (
                              <a href={safeHref(lookupUrl)} target="_blank" class="screening-link" title={screening.letterboxd_url ? 'View on Letterboxd' : 'View on TMDB'}>{'\uD83D\uDD0D'}</a>
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

          {/* Listing View */}
          <div class="listing-container">
            {!hasScreenings && <div class="no-screenings">No screenings for this day</div>}

            {listingGroups.map(group => (
              <TheatreCard
                header={displayName(group.venue)}
                headerLink={group.theatreName ? `/theatre/${encodeURIComponent(group.theatreName)}` : undefined}
                dataTheatre={group.venue}
                hideLink
                rows={group.movies.map(movie => ({
                  label: movie.movie_title,
                  labelLink: `/movie/${movie.movie_id}`,
                  times: movie.showtimes.map(st => {
                    const time = new Date(st.datetime);
                    const h = time.getHours() % 12 || 12;
                    const m = String(time.getMinutes()).padStart(2, '0');
                    const ampm = time.getHours() >= 12 ? 'pm' : 'am';
                    return { display: `${h}:${m}${ampm}`, bookingUrl: st.booking_url };
                  }),
                }))}
              />
            ))}
          </div>

        </div>

        {/* Hidden Theatres */}
        <div class="hidden-theatres-footer" id="hiddenFooter">
          <button class="hidden-theatres-toggle" id="hiddenToggle"></button>
          <div class="hidden-theatres-section" id="hiddenSection"></div>
        </div>

        <script dangerouslySetInnerHTML={{ __html: INDEX_SCRIPT }} />
      </>
    ),
  });
}
