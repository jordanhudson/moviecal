import { renderPage } from './layout.js';
import { escapeHtml, safeHref } from '../utils/html.js';
import { ScreeningWithMovie } from './index.js';

const THEATRE_DISPLAY_NAMES: Record<string, string> = {
  'VIFF Lochmaddy Studio': 'VIFF Lochmaddy',
};

function displayName(theatre: string): string {
  return THEATRE_DISPLAY_NAMES[theatre] || theatre;
}

const CINEPLEX_GROUPS = [
  { display: 'Fifth Avenue', prefix: 'Fifth Ave' },
  { display: 'International Village', prefix: 'Intl Village' },
  { display: 'Scotiabank', prefix: 'Scotiabank' },
  { display: 'Langley', prefix: 'Langley' },
];

function venueGroup(theatreName: string): { name: string; theatreLink: string | null } {
  for (const g of CINEPLEX_GROUPS) {
    if (theatreName.startsWith(g.prefix)) {
      return { name: g.display, theatreLink: null };
    }
  }
  return { name: displayName(theatreName), theatreLink: theatreName };
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTime(date: Date): string {
  const h = date.getHours() % 12 || 12;
  const m = String(date.getMinutes()).padStart(2, '0');
  const ampm = date.getHours() >= 12 ? 'pm' : 'am';
  return `${h}:${m}${ampm}`;
}

const PAGE_STYLES = `
    /* Movie-centric view */
    .movie-view {
      max-width: 500px;
      margin: 0 auto;
    }

    .movie-view-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .movie-view-heading {
      font-size: 20px;
      font-weight: 600;
      color: #c5c5c5;
    }

    .sort-wrapper {
      position: relative;
    }

    .sort-btn {
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      color: #b0b0b0;
      padding: 6px 12px;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
    }

    .sort-btn:hover {
      background: #333333;
    }

    .sort-menu {
      display: none;
      position: absolute;
      right: 0;
      top: 100%;
      margin-top: 4px;
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      overflow: hidden;
      z-index: 10;
    }

    .sort-menu.open {
      display: block;
    }

    .sort-option {
      display: block;
      width: 100%;
      padding: 8px 16px;
      background: none;
      border: none;
      color: #b0b0b0;
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      white-space: nowrap;
      font-family: inherit;
    }

    .sort-option:hover {
      background: #333333;
    }

    .sort-option.active {
      color: #6a9a9a;
    }

    .movie-card {
      display: flex;
      background: #404040;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .movie-card-info {
      flex: 1;
      padding: 12px 16px;
      min-width: 0;
    }

    .movie-card-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 8px;
      position: sticky;
      top: 48px;
      background: #404040;
      z-index: 10;
      margin: -12px -16px 8px;
      padding: 12px 16px;
      border-radius: 8px 8px 0 0;
    }

    .movie-card-title {
      font-weight: 600;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .movie-card-title a {
      color: #d0d0d0;
      text-decoration: none;
    }

    .movie-card-title a:hover {
      color: #6a9a9a;
    }

    .movie-card-year {
      color: #707070;
      font-size: 13px;
      flex-shrink: 0;
    }

    .movie-card-screenings {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .movie-venue-group {
      background: #2e2e2e;
      border-radius: 6px;
      overflow: hidden;
    }

    .movie-venue-name {
      font-weight: 600;
      font-size: 14px;
      padding: 10px 14px;
      background: #2a2a2a;
    }

    .movie-venue-name a {
      color: #c5c5c5;
      text-decoration: none;
    }

    .movie-venue-name a:hover {
      color: #6a9a9a;
      text-decoration: underline;
    }

    .movie-date-group {
      padding: 10px 14px;
      border-bottom: 1px solid #353535;
    }

    .movie-date-group:last-child {
      border-bottom: none;
    }

    .movie-date-heading {
      font-weight: 500;
      font-size: 14px;
      color: #d0d0d0;
      margin-bottom: 6px;
    }

    .movie-times {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .movie-time {
      display: inline-block;
      padding: 4px 10px;
      background: #4a7c7c;
      color: white;
      border-radius: 4px;
      text-decoration: none;
      font-size: 13px;
    }

    .movie-time:hover {
      background: #5a8c8c;
    }

    .no-screenings {
      text-align: center;
      padding: 40px;
    }

    /* Mobile breakpoint */
    @media (max-width: 800px) {
      .movie-card-info {
        padding: 10px 12px;
      }

      .movie-card-header {
        margin-bottom: 6px;
      }
    }`;

export function renderMoviesPage(screenings: ScreeningWithMovie[]): string {
  const hasScreenings = screenings.length > 0;

  // Group screenings by movie
  const movieMap = new Map<number, ScreeningWithMovie[]>();
  for (const s of screenings) {
    if (!movieMap.has(s.movie_id)) {
      movieMap.set(s.movie_id, []);
    }
    movieMap.get(s.movie_id)!.push(s);
  }
  const movieGroups = Array.from(movieMap.values())
    .map(group => group.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()))
    .sort((a, b) => new Date(b[0].movie_created_at || 0).getTime() - new Date(a[0].movie_created_at || 0).getTime());

  return renderPage({
    title: 'Upcoming Movies in Vancouver Cinemas — MovieCal',
    description: 'Browse all upcoming movies playing in Vancouver independent and repertory cinemas, with showtimes and ticket links.',
    canonicalPath: '/movies',
    styles: PAGE_STYLES,
    activePage: 'movies',
    body: `
  <div class="movie-view">
    <div class="movie-view-header">
      <h1 class="movie-view-heading">Upcoming Movies in Vancouver</h1>
      <div class="sort-wrapper">
        <button class="sort-btn" id="sortBtn">Sort</button>
        <div class="sort-menu" id="sortMenu">
          <button class="sort-option" data-sort="date-added">Date Added</button>
          <button class="sort-option" data-sort="name">Name</button>
          <button class="sort-option" data-sort="popularity">Popularity</button>
        </div>
      </div>
    </div>
    ${!hasScreenings ? '<div class="no-screenings">No upcoming screenings</div>' : ''}
    <div id="movieList">
    ${movieGroups.map(group => {
      const movie = group[0];
      const createdAt = movie.movie_created_at ? new Date(movie.movie_created_at).getTime() : 0;

      // Group screenings by venue, then by date
      const venueMap = new Map<string, { theatreLink: string | null; dates: Map<string, { label: string; times: { time: string; bookingUrl: string }[] }> }>();
      for (const s of group) {
        const dt = new Date(s.datetime);
        const v = venueGroup(s.theatre_name);
        if (!venueMap.has(v.name)) {
          venueMap.set(v.name, { theatreLink: v.theatreLink, dates: new Map() });
        }
        const venue = venueMap.get(v.name)!;
        const dk = dateKey(dt);
        if (!venue.dates.has(dk)) {
          venue.dates.set(dk, { label: formatShortDate(dt), times: [] });
        }
        venue.dates.get(dk)!.times.push({ time: formatTime(dt), bookingUrl: s.booking_url });
      }

      return `
        <div class="movie-card" data-title="${escapeHtml(movie.movie_title)}" data-created="${createdAt}" data-popularity="${movie.tmdb_popularity ?? 0}" data-theatres="${escapeHtml(Array.from(venueMap.keys()).join(','))}">
          <div class="movie-card-info">
            <div class="movie-card-header">
              <div class="movie-card-title"><a href="/movie/${movie.movie_id}">${escapeHtml(movie.movie_title)}</a></div>
              ${movie.movie_year ? `<span class="movie-card-year">(${movie.movie_year})</span>` : ''}
            </div>
            <div class="movie-card-screenings">
              ${Array.from(venueMap.entries()).map(([venueName, venue]) => `
                <div class="movie-venue-group">
                  <div class="movie-venue-name">${
                    venue.theatreLink
                      ? `<a href="/theatre/${encodeURIComponent(venue.theatreLink)}">${escapeHtml(venueName)}</a>`
                      : escapeHtml(venueName)
                  }</div>
                  ${Array.from(venue.dates.values()).map(dateGroup => `
                    <div class="movie-date-group">
                      <div class="movie-date-heading">${dateGroup.label}</div>
                      <div class="movie-times">
                        ${dateGroup.times.map(t =>
                          `<a href="${safeHref(t.bookingUrl)}" target="_blank" class="movie-time">${t.time}</a>`
                        ).join('')}
                      </div>
                    </div>
                  `).join('')}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('')}
    </div>
  </div>
  <script>
    (function() {
      try {
        var hidden = JSON.parse(localStorage.getItem('hiddenTheatres') || '[]');
        if (!hidden.length) return;
        document.querySelectorAll('.movie-card').forEach(function(card) {
          var theatres = (card.dataset.theatres || '').split(',');
          var allHidden = theatres.every(function(t) {
            return hidden.indexOf(t) !== -1;
          });
          if (allHidden) card.style.display = 'none';
        });
      } catch(e) {}
    })();

    (function() {
      var btn = document.getElementById('sortBtn');
      var menu = document.getElementById('sortMenu');
      var list = document.getElementById('movieList');
      var savedSort = localStorage.getItem('movieSort') || 'date-added';

      function updateActive(sort) {
        menu.querySelectorAll('.sort-option').forEach(function(o) {
          o.classList.toggle('active', o.dataset.sort === sort);
        });
      }

      function sortCards(sort) {
        var cards = Array.from(list.querySelectorAll('.movie-card'));
        cards.sort(function(a, b) {
          if (sort === 'name') return a.dataset.title.localeCompare(b.dataset.title);
          if (sort === 'popularity') return Number(b.dataset.popularity) - Number(a.dataset.popularity);
          return Number(b.dataset.created) - Number(a.dataset.created);
        });
        cards.forEach(function(c) { list.appendChild(c); });
        localStorage.setItem('movieSort', sort);
        updateActive(sort);
      }

      sortCards(savedSort);

      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        menu.classList.toggle('open');
      });

      menu.querySelectorAll('.sort-option').forEach(function(opt) {
        opt.addEventListener('click', function() {
          sortCards(opt.dataset.sort);
          menu.classList.remove('open');
        });
      });

      document.addEventListener('click', function() {
        menu.classList.remove('open');
      });
    })();
  </script>`,
  });
}
