/** @jsxImportSource hono/jsx */
import { renderPage } from './layout.js';
import { TmdbModal } from './tmdb-modal.js';
import { safeHref, jsonForScript } from '../utils/html.js';
import { pacificNow } from '../utils/time.js';
import { movieUrl } from '../utils/movie-url.js';
import { CINEPLEX_VENUES } from '../theatres.js';

export interface MovieDetail {
  id: number;
  title: string;
  year: number | null;
  director: string | null;
  runtime: number | null;
  tmdb_id: number | null;
  tmdb_url: string | null;
  poster_url: string | null;
  letterboxd_url: string | null;
}

export interface ScreeningDetail {
  id: number;
  datetime: Date;
  theatre_name: string;
  booking_url: string;
  note: string | null;
}

export function renderMoviePage(movie: MovieDetail, screenings: ScreeningDetail[]): string {
  const now = pacificNow();
  const futureScreenings = screenings.filter(s => new Date(s.datetime) >= now);

  const dayGroups: { dateStr: string; items: ScreeningDetail[] }[] = [];
  for (const screening of futureScreenings) {
    const dateStr = new Date(screening.datetime).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).replace(',', '');
    const lastGroup = dayGroups[dayGroups.length - 1];
    if (lastGroup && lastGroup.dateStr === dateStr) {
      lastGroup.items.push(screening);
    } else {
      dayGroups.push({ dateStr, items: [screening] });
    }
  }

  const metaParts = [movie.year, movie.director, movie.runtime ? `${movie.runtime} min` : null].filter(Boolean);
  const metaSuffix = metaParts.length ? ` (${metaParts.join(', ')})` : '';
  const screeningCount = futureScreenings.length;
  const movieDesc = `${movie.title}${metaSuffix} — ${screeningCount} upcoming screening${screeningCount !== 1 ? 's' : ''} in Vancouver.`;

  const movieSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: movie.title,
    ...(movie.year && { dateCreated: String(movie.year) }),
    ...(movie.director && { director: { '@type': 'Person', name: movie.director } }),
    ...(movie.runtime && { duration: `PT${movie.runtime}M` }),
    ...(movie.poster_url && { image: movie.poster_url }),
    url: `https://movieclock.app${movieUrl(movie.id, movie.title)}`,
  };

  const screeningSchemas = futureScreenings.map(s => ({
    '@context': 'https://schema.org',
    '@type': 'ScreeningEvent',
    name: movie.title,
    startDate: new Date(s.datetime).toISOString(),
    location: {
      '@type': 'MovieTheater',
      name: s.theatre_name,
      address: { '@type': 'PostalAddress', addressLocality: 'Vancouver', addressRegion: 'BC', addressCountry: 'CA' },
    },
    workPresented: { '@type': 'Movie', name: movie.title },
    ...(s.booking_url && { url: s.booking_url }),
  }));

  const posterScript = `
    (function() {
      var posterEl = document.querySelector('.movie-poster');
      var clickCount = 0;
      var clickTimer = null;
      posterEl.addEventListener('click', function() {
        clickCount++;
        clearTimeout(clickTimer);
        if (clickCount >= 10) {
          clickCount = 0;
          TmdbModal.open(${movie.id}, ${jsonForScript(movie.title)}, ${jsonForScript(movie.letterboxd_url)});
        } else {
          clickTimer = setTimeout(function() { clickCount = 0; }, 3000);
        }
      });
    })();`;

  const hideScript = `
    (function() {
      try {
        var hidden = JSON.parse(localStorage.getItem('hiddenTheatres') || '[]');
        if (!hidden.length) return;
        var cineplex = ${jsonForScript(CINEPLEX_VENUES)};
        var items = document.querySelectorAll('.screening-item[data-theatre]');
        var hiddenCount = 0;
        items.forEach(function(el) {
          var t = el.dataset.theatre;
          var match = hidden.indexOf(t) !== -1;
          if (!match) {
            for (var i = 0; i < cineplex.length; i++) {
              if (t.indexOf(cineplex[i].prefix) === 0 && hidden.indexOf(cineplex[i].display) !== -1) {
                match = true;
                break;
              }
            }
          }
          if (match) {
            el.classList.add('hidden-by-theatre');
            hiddenCount++;
          }
        });
        if (hiddenCount === 0) return;

        document.querySelectorAll('.day-group').forEach(function(group) {
          var groupItems = group.querySelectorAll('.screening-item');
          var groupHidden = group.querySelectorAll('.screening-item.hidden-by-theatre');
          if (groupItems.length && groupItems.length === groupHidden.length) {
            group.classList.add('all-hidden');
          }
        });

        var section = document.querySelector('.screenings-section');
        var heading = document.querySelector('.screenings-section h2');
        if (!heading) return;

        var toggle = document.createElement('span');
        toggle.className = 'hidden-toggle';
        var allHidden = hiddenCount === items.length;

        function render(showing) {
          var label = hiddenCount + ' hidden';
          toggle.textContent = showing ? label + ' — hide again' : label + ' — show';
        }

        var showing = allHidden;
        if (section && allHidden) section.classList.add('show-hidden');
        render(showing);

        toggle.addEventListener('click', function() {
          showing = !showing;
          if (section) section.classList.toggle('show-hidden', showing);
          render(showing);
        });

        heading.appendChild(toggle);
      } catch(e) {}
    })();`;

  return renderPage({
    title: `${movie.title}${movie.year ? ` (${movie.year})` : ''} Showtimes Vancouver — MovieClock`,
    description: movieDesc,
    canonicalPath: movieUrl(movie.id, movie.title),
    ogImage: movie.poster_url || undefined,
    jsonLd: [movieSchema, ...screeningSchemas],
    styles: ['/css/movie.css', '/css/tmdb-modal.css'],
    body: (
      <>
        <div class="movie-container">
          <div class="movie-header">
            <div class="movie-poster">
              {movie.poster_url
                ? <img src={safeHref(movie.poster_url)} alt={`${movie.title} poster`} />
                : <div class="movie-poster-placeholder">No poster</div>
              }
            </div>
            <div class="movie-info">
              <h1 class="movie-title">{movie.title}</h1>
              <div class="movie-meta">
                {movie.year && <span>{movie.year}</span>}
                {movie.runtime && <span>{movie.runtime} min</span>}
                {movie.director && <span>Dir: {movie.director}</span>}
              </div>
              {movie.tmdb_url && <a href={safeHref(movie.tmdb_url)} target="_blank" class="tmdb-link">View on TMDB</a>}
              {movie.letterboxd_url && movie.letterboxd_url !== 'MISS' && (
                <a href={safeHref(movie.letterboxd_url)} target="_blank" class="letterboxd-link">View on Letterboxd</a>
              )}
            </div>
          </div>

          <div class="screenings-section">
            <h2>Screenings</h2>
            {futureScreenings.length === 0
              ? <p class="no-screenings">No upcoming screenings</p>
              : dayGroups.map(group => (
                  <section class="day-group">
                    <h3 class="day-header">{group.dateStr}</h3>
                    <ul class="screening-list">
                      {group.items.map(screening => {
                        const timeStr = new Date(screening.datetime).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        });

                        return (
                          <li class="screening-item" data-theatre={screening.theatre_name}>
                            <div class="screening-time">{timeStr}</div>
                            <div class="screening-theatre">
                              <a href={`/theatre/${encodeURIComponent(screening.theatre_name)}`}>{screening.theatre_name}</a>
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
                ))
            }
          </div>
        </div>

        <TmdbModal />
        <script dangerouslySetInnerHTML={{ __html: posterScript }} />
        <script dangerouslySetInnerHTML={{ __html: hideScript }} />
      </>
    ),
  });
}
