/** @jsxImportSource hono/jsx */
import { renderPage } from './layout.js';
import { safeHref } from '../utils/html.js';
import { movieUrl } from '../utils/movie-url.js';
import { CINEPLEX_VENUES } from '../theatres.js';

const DEFAULT_RUNTIME_MINUTES = 105;
const MIN_DISPLAY_RUNTIME_MINUTES = 90;
const TIMELINE_START_HOUR = 10; // 10am
const TIMELINE_END_HOUR = 26;   // 2am next day (24 + 2)

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

  // Pad the runtime by 15 min for the block width only (accounts for trailers /
  // turnover so cells don't visually butt up against the next showing). This is
  // the ONLY place 15 min is added — display runtimes elsewhere stay unmodified.
  const TIMELINE_CELL_PADDING_MINUTES = 15;
  const movieRuntime = (runtime || DEFAULT_RUNTIME_MINUTES) + TIMELINE_CELL_PADDING_MINUTES;
  const effectiveRuntime = Math.max(movieRuntime, MIN_DISPLAY_RUNTIME_MINUTES);
  const widthPercent = (effectiveRuntime / totalMinutes) * 100;

  return { left: `${Math.max(0, leftPercent)}%`, width: `${widthPercent}%` };
}

const THEATRE_DISPLAY_NAMES: Record<string, string> = {
  'VIFF Lochmaddy Studio': 'VIFF Lochmaddy',
};

function displayName(theatre: string): string {
  return THEATRE_DISPLAY_NAMES[theatre] || theatre;
}

function formatTime(d: Date): string {
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() >= 12 ? 'pm' : 'am';
  return `${h}:${m}${ampm}`;
}

function metaLine(year?: number | null, runtime?: number | null): string {
  return [year, runtime ? `${runtime} min` : null].filter(Boolean).join(' · ');
}

const TIME_LABELS = ['10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm', '10pm', '11pm', '12am', '1am'];

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

const INDEX_SCRIPT = `
  var CINEPLEX = __CINEPLEX__;

  // ---- view toggle (desktop only) ----
  var wrapper = document.getElementById('viewsWrapper');
  var savedView = localStorage.getItem('viewMode') || 'listing';
  wrapper.dataset.view = savedView;
  document.querySelectorAll('.view-toggle button').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.view === savedView);
    btn.addEventListener('click', function() {
      var view = btn.dataset.view;
      wrapper.dataset.view = view;
      localStorage.setItem('viewMode', view);
      document.querySelectorAll('.view-toggle button').forEach(function(b) {
        b.classList.toggle('active', b.dataset.view === view);
      });
    });
  });

  // ---- date rail (built client-side off real "today") ----
  (function() {
    var rail = document.getElementById('dateRail');
    if (!rail) return;
    var selected = rail.dataset.selected;
    function ymd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
    var DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var today = new Date(); today.setHours(0,0,0,0);
    var sel = new Date(selected + 'T00:00:00');
    var start = sel < today ? new Date(sel) : new Date(today);
    var end = new Date(today); end.setDate(end.getDate()+13);
    if (sel > end) end = new Date(sel);
    var list = [];
    for (var d = new Date(start); d <= end; d.setDate(d.getDate()+1)) { list.push(new Date(d)); }
    rail.innerHTML = list.map(function(d){
      var key = ymd(d);
      var on = key === selected ? ' on' : '';
      return '<a class="day'+on+'" href="/date/'+key+'"><span class="dow">'+DOW[d.getDay()]+'</span><span class="num">'+d.getDate()+'</span></a>';
    }).join('');
    var active = rail.querySelector('.day.on');
    if (active) active.scrollIntoView({inline:'center', block:'nearest'});
  })();

  // ---- date picker jump ----
  var picker = document.getElementById('datePicker');
  if (picker) {
    picker.addEventListener('change', function(){ window.location.href = '/date/' + this.value; });
  }

  // ---- theatre filter chips (localStorage: hiddenTheatres) ----
  function getHidden(){ try { return JSON.parse(localStorage.getItem('hiddenTheatres') || '[]'); } catch(e){ return []; } }
  function saveHidden(l){ localStorage.setItem('hiddenTheatres', JSON.stringify(l)); }
  function isHidden(dt, hidden){
    if (hidden.indexOf(dt) !== -1) return true;
    for (var i=0;i<CINEPLEX.length;i++){
      if (hidden.indexOf(CINEPLEX[i].display) !== -1 && dt.indexOf(CINEPLEX[i].prefix) === 0) return true;
    }
    return false;
  }
  function applyFilter(){
    var hidden = getHidden();
    document.querySelectorAll('[data-theatre]').forEach(function(el){
      if (el.classList.contains('chip')) return;
      el.style.display = isHidden(el.dataset.theatre, hidden) ? 'none' : '';
    });
    document.querySelectorAll('.chip').forEach(function(c){
      var off = hidden.indexOf(c.dataset.theatre) !== -1;
      c.classList.toggle('off', off);
      c.classList.toggle('on', !off);
    });
  }
  document.querySelectorAll('.chip').forEach(function(c){
    c.addEventListener('click', function(){
      var name = c.dataset.theatre;
      var hidden = getHidden();
      var idx = hidden.indexOf(name);
      if (idx === -1) hidden.push(name); else hidden.splice(idx, 1);
      saveHidden(hidden);
      applyFilter();
    });
  });
  applyFilter();
`;

export function renderIndexPage(date: Date, theatres: TheatreRow[], listingGroups: ListingGroup[] = []): string {
  const prevDay = getPrevDay(date);
  const nextDay = getNextDay(date);
  const displayDate = formatDate(date);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const hasScreenings = theatres.some(t => t.screenings.length > 0) || listingGroups.length > 0;
  const totalScreenings = theatres.reduce((n, t) => n + t.screenings.length, 0);

  const script = INDEX_SCRIPT.replace('__CINEPLEX__', JSON.stringify(CINEPLEX_VENUES));

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
    activePage: 'home',
    body: (
      <>
        <div class="datebar">
          <div class="datebar-head">
            <div>
              <div class="kicker">Vancouver Showtimes</div>
              <h1 class="date-h1">{displayDate}</h1>
            </div>
            <div class="view-toggle">
              <button class="active" data-view="listing">Listing</button>
              <button data-view="timeline">Timeline</button>
            </div>
          </div>

          <div class="rail-wrap">
            <a class="rail-arrow" href={`/date/${prevDay}`} aria-label="Previous day">{'‹'}</a>
            <div class="rail" id="dateRail" data-selected={dateStr}>
              {/* filled client-side; SEO/no-JS fallback below */}
              <noscript><a class="day on"><span class="num">{date.getDate()}</span></a></noscript>
            </div>
            <a class="rail-arrow" href={`/date/${nextDay}`} aria-label="Next day">{'›'}</a>
            <label class="rail-cal" title="Pick a date">
              {'📅'}
              <input type="date" id="datePicker" value={dateStr} />
            </label>
          </div>

          {listingGroups.length > 0 && (
            <div class="chips" id="chips">
              {listingGroups.map(g => (
                <button class="chip on" data-theatre={g.venue}>{displayName(g.venue)}</button>
              ))}
            </div>
          )}
        </div>

        <div id="viewsWrapper" data-view="listing">
          {!hasScreenings && <div class="no-screenings">No screenings for this day — try another date.</div>}

          {/* ---- Timeline view (desktop only) ---- */}
          <div class="timeline-view">
            <div class="timeline-container">
              <div class="time-labels">
                {TIME_LABELS.map(label => <div class="time-label">{label}</div>)}
              </div>
              {theatres.map(({ theatre, screenings }) => (
                <div class="theatre-row" data-theatre={theatre}>
                  <div class="theatre-label">
                    <a href={`/theatre/${encodeURIComponent(theatre)}`}>{displayName(theatre)}</a>
                  </div>
                  <div class="timeline">
                    {screenings.map(screening => {
                      const { left, width } = calculatePosition(new Date(screening.datetime), screening.movie_runtime);
                      const time = formatTime(new Date(screening.datetime)).replace(/(am|pm)$/, '');
                      const lookupUrl = screening.letterboxd_url && screening.letterboxd_url !== 'MISS'
                        ? screening.letterboxd_url : screening.tmdb_url;
                      return (
                        <div class="screening" style={`left: ${left}; width: ${width};`}>
                          <a href={movieUrl(screening.movie_id, screening.movie_title)} class="screening-overlay" title={screening.movie_title}></a>
                          <span class="screening-title">{screening.movie_title}</span>
                          <div class="screening-bottom">
                            <div class="screening-time">{time}</div>
                            <div class="screening-links">
                              <a href={safeHref(screening.booking_url)} target="_blank" class="screening-link" title="Book tickets">{'🎟️'}</a>
                              {lookupUrl && (
                                <a href={safeHref(lookupUrl)} target="_blank" class="screening-link" title={screening.letterboxd_url && screening.letterboxd_url !== 'MISS' ? 'View on Letterboxd' : 'View on TMDB'}>{'🔍'}</a>
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
          </div>

          {/* ---- Listing view (mobile always; desktop optional) ---- */}
          <div class="listing-view">
            {listingGroups.map(group => (
              <section class="venue-card" data-theatre={group.venue}>
                <div class="venue-head">
                  {group.theatreName
                    ? <a href={`/theatre/${encodeURIComponent(group.theatreName)}`}>{displayName(group.venue)}</a>
                    : <span>{displayName(group.venue)}</span>}
                </div>
                {group.movies.map(movie => (
                  <div class="film-row">
                    <a class="film-poster" href={movieUrl(movie.movie_id, movie.movie_title)} style={movie.poster_url ? '' : `background:${posterGrad(movie.movie_id)}`}>
                      {movie.poster_url && <img src={safeHref(movie.poster_url)} alt="" loading="lazy" />}
                    </a>
                    <div class="film-body">
                      <a class="film-title" href={movieUrl(movie.movie_id, movie.movie_title)}>{movie.movie_title}</a>
                      <div class="film-meta">{metaLine(movie.movie_year, movie.movie_runtime)}</div>
                    </div>
                    <div class="show-times">
                      {movie.showtimes.map(st => (
                        <a class="show-time" href={safeHref(st.booking_url)} target="_blank">{formatTime(new Date(st.datetime))}</a>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>

        <script dangerouslySetInnerHTML={{ __html: script }} />
      </>
    ),
  });
}
