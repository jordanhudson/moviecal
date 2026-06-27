/** @jsxImportSource hono/jsx */
import { renderPage } from './layout.js';
import { ScreeningWithMovie } from './index.js';
import { TheatreCard } from './theatre-card.js';
import { movieUrl } from '../utils/movie-url.js';
import { safeHref } from '../utils/html.js';
import { venueGroup } from '../venues.js';

const POSTER_GRADS = [
  'linear-gradient(155deg,#c2410c,#7c2d12)',
  'linear-gradient(155deg,#0f766e,#134e4a)',
  'linear-gradient(155deg,#6d28d9,#4c1d95)',
  'linear-gradient(155deg,#be185d,#831843)',
  'linear-gradient(155deg,#0369a1,#0c4a6e)',
  'linear-gradient(155deg,#a16207,#713f12)',
];

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

const SORT_SCRIPT = `
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
    })();`;

export function renderMoviesPage(screenings: ScreeningWithMovie[]): string {
  const hasScreenings = screenings.length > 0;

  const movieMap = new Map<number, ScreeningWithMovie[]>();
  for (const s of screenings) {
    if (!movieMap.has(s.movie_id)) {
      movieMap.set(s.movie_id, []);
    }
    movieMap.get(s.movie_id)!.push(s);
  }
  const movieGroups = Array.from(movieMap.values())
    .map((group) =>
      group.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()),
    )
    .sort(
      (a, b) =>
        new Date(b[0].movie_created_at || 0).getTime() -
        new Date(a[0].movie_created_at || 0).getTime(),
    );

  return renderPage({
    title: 'Upcoming Movies in Vancouver Cinemas — MovieClock',
    description:
      'Browse all upcoming movies playing in Vancouver independent and repertory cinemas, with showtimes and ticket links.',
    canonicalPath: '/movies',
    styles: ['/css/theatre-card.css', '/css/movies.css'],
    activePage: 'movies',
    body: (
      <>
        <div class="movie-view">
          <div class="movie-view-header">
            <h1 class="movie-view-heading">Upcoming Movies in Vancouver</h1>
            <div class="sort-wrapper">
              <button class="sort-btn" id="sortBtn">
                Sort
              </button>
              <div class="sort-menu" id="sortMenu">
                <button class="sort-option" data-sort="date-added">
                  Date Added
                </button>
                <button class="sort-option" data-sort="name">
                  Name
                </button>
                <button class="sort-option" data-sort="popularity">
                  Popularity
                </button>
              </div>
            </div>
          </div>
          {!hasScreenings && <div class="no-screenings">No upcoming screenings</div>}
          <div id="movieList">
            {movieGroups.map((group) => {
              const movie = group[0];
              const createdAt = movie.movie_created_at
                ? new Date(movie.movie_created_at).getTime()
                : 0;

              const venueMap = new Map<
                string,
                {
                  theatreLink: string | null;
                  dates: Map<
                    string,
                    { label: string; times: { time: string; bookingUrl: string }[] }
                  >;
                }
              >();
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
                venue.dates
                  .get(dk)!
                  .times.push({ time: formatTime(dt), bookingUrl: s.booking_url });
              }

              return (
                <div
                  class="movie-card"
                  data-title={movie.movie_title}
                  data-created={String(createdAt)}
                  data-popularity={String(movie.tmdb_popularity ?? 0)}
                  data-theatres={Array.from(venueMap.keys()).join(',')}
                >
                  <div class="movie-card-header">
                    <a
                      class="movie-card-poster"
                      href={movieUrl(movie.movie_id, movie.movie_title)}
                      style={
                        movie.poster_url
                          ? ''
                          : `background:${POSTER_GRADS[movie.movie_id % POSTER_GRADS.length]}`
                      }
                    >
                      {movie.poster_url && (
                        <img src={safeHref(movie.poster_url)} alt="" loading="lazy" />
                      )}
                    </a>
                    <div class="movie-card-titles">
                      <div class="movie-card-title">
                        <a href={movieUrl(movie.movie_id, movie.movie_title)}>
                          {movie.movie_title}
                        </a>
                      </div>
                      {movie.movie_year && (
                        <span class="movie-card-year">({movie.movie_year})</span>
                      )}
                    </div>
                  </div>
                  <div class="movie-card-screenings">
                    {Array.from(venueMap.entries()).map(([venueName, venue]) => (
                      <TheatreCard
                        header={venueName}
                        headerLink={
                          venue.theatreLink
                            ? `/theatre/${encodeURIComponent(venue.theatreLink)}`
                            : undefined
                        }
                        rows={Array.from(venue.dates.values()).map((dateGroup) => ({
                          label: dateGroup.label,
                          times: dateGroup.times.map((t) => ({
                            display: t.time,
                            bookingUrl: t.bookingUrl,
                          })),
                        }))}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: SORT_SCRIPT }} />
      </>
    ),
  });
}
