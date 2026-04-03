const BASE_STYLES = `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 0;
      background: #1e1e1e;
      color: #c5c5c5;
    }

    .top-bar {
      background: #141414;
      border-bottom: 1px solid #353535;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .top-bar-inner {
      max-width: 1284px;
      margin: 0 auto;
      padding: 0 20px;
      display: flex;
      align-items: center;
      height: 48px;
      position: relative;
    }

    .top-bar-logo {
      font-size: 28px;
      font-weight: 700;
      color: #e5e5e5;
      text-decoration: none;
      letter-spacing: -0.5px;
    }

    .top-bar-logo:hover {
      color: #6a9a9a;
    }

    .top-bar-search {
      margin-left: auto;
      position: relative;
    }

    .top-bar-search input {
      background: #2a2a2a;
      border: 1px solid #353535;
      border-radius: 4px;
      padding: 6px 12px;
      color: #c5c5c5;
      font-size: 14px;
      width: 200px;
      font-family: inherit;
      transition: width 0.2s;
    }

    .top-bar-search input::placeholder {
      color: #666;
    }

    .top-bar-search input:focus {
      outline: none;
      border-color: #4a7c7c;
    }

    .search-results {
      display: none;
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      width: 280px;
      max-height: 320px;
      overflow-y: auto;
      z-index: 200;
    }

    .search-results.open {
      display: block;
    }

    .search-result {
      display: block;
      padding: 12px;
      color: #c5c5c5;
      text-decoration: none;
      font-size: 14px;
      border-bottom: 1px solid #353535;
    }

    .search-result:last-child {
      border-bottom: none;
    }

    .search-result:hover {
      background: #333333;
      color: #6a9a9a;
    }

    .search-no-results {
      padding: 8px 12px;
      color: #666;
      font-size: 14px;
    }

    .top-bar-nav {
      display: flex;
      gap: 24px;
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    }

    .top-bar-nav a {
      color: #ccc;
      text-decoration: none;
      font-size: 15px;
    }

    .top-bar-nav a:hover {
      color: #c5c5c5;
    }

    .top-bar-nav a.active {
      color: #e5e5e5;
      border-bottom: 2px solid #4a7c7c;
      padding-bottom: 12px;
      margin-bottom: -14px;
    }

    .page-content {
      padding: 20px;
    }

    .back-link {
      display: inline-block;
      margin-bottom: 20px;
      color: #6a9a9a;
      text-decoration: none;
    }

    .back-link:hover {
      text-decoration: underline;
    }

    .no-screenings {
      color: #606060;
      font-style: italic;
    }

    @media (max-width: 800px) {
      .page-content {
        padding: 12px;
      }

      .top-bar-inner {
        padding: 0 12px;
      }

      .top-bar-nav {
        gap: 16px;
      }

      .top-bar-search input {
        width: 80px;
      }

      .top-bar-search input:focus {
        width: 160px;
      }
    }`;

export function footer(): string {
  return `<footer style="text-align: center; padding: 24px 16px; color: #555; font-size: 12px;">
    <p>Vancouver movie showtimes for independent and repertory cinemas &mdash; Cinematheque, VIFF, Rio Theatre, Park Theatre, and more.</p>
    <p style="margin-top: 6px;">Made by <a href="https://github.com/jordanhudson" target="_blank" style="color: #6a9a9a;">Jordan Hudson</a></p>
  </footer>`;
}

export interface SearchMovie {
  id: number;
  title: string;
}

let _searchMovies: SearchMovie[] = [];

export function setSearchMovies(movies: SearchMovie[]) {
  _searchMovies = movies;
}

export interface PageOptions {
  title: string;
  description?: string;
  canonicalPath?: string;
  jsonLd?: object | object[];
  styles?: string;
  body: string;
  activePage?: string;
}

export function renderPage({ title, description, canonicalPath, jsonLd, styles, body, activePage }: PageOptions): string {
  const searchMovies = _searchMovies;
  const BASE_URL = 'https://movieclock.fly.dev';
  const metaDesc = description || 'Movie showtimes for Vancouver independent cinemas — Cinematheque, VIFF, Rio Theatre, Park Theatre, and more.';
  const canonical = canonicalPath != null ? `\n  <link rel="canonical" href="${BASE_URL}${canonicalPath}">` : '';
  const jsonLdItems = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  const jsonLdTags = jsonLdItems.map(item => `\n  <script type="application/ld+json">${JSON.stringify(item)}</script>`).join('');
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="google-site-verification" content="VM8EAB3B8XS6MIzpotyQjlH5WodE2q_e0NkffgF_DdI" />
  <meta name="description" content="${metaDesc}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:type" content="website">${canonical}
  <link rel="icon" type="image/png" href="/favicon.png">${jsonLdTags}
  <title>${title}</title>
  <style>${BASE_STYLES}
    ${styles || ''}
  </style>
</head>
<body>
  <nav class="top-bar">
    <div class="top-bar-inner">
      <a href="/" class="top-bar-logo">MC</a>
      <div class="top-bar-nav">
        <a href="/"${activePage === 'home' ? ' class="active"' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 256 256" style="vertical-align: -2px; margin-right: 4px;"><path fill="currentColor" d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-68-76a12,12,0,1,1-12-12A12,12,0,0,1,140,132Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,184,132ZM96,172a12,12,0,1,1-12-12A12,12,0,0,1,96,172Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,140,172Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,184,172Z"/></svg>By Date</a>
        <a href="/movies"${activePage === 'movies' ? ' class="active"' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 256 256" style="vertical-align: -2px; margin-right: 4px;"><path fill="currentColor" d="M232,216H183.36A103.95,103.95,0,1,0,128,232H232a8,8,0,0,0,0-16ZM40,128a88,88,0,1,1,88,88A88.1,88.1,0,0,1,40,128Zm88-24a24,24,0,1,0-24-24A24,24,0,0,0,128,104Zm0-32a8,8,0,1,1-8,8A8,8,0,0,1,128,72Zm24,104a24,24,0,1,0-24,24A24,24,0,0,0,152,176Zm-32,0a8,8,0,1,1,8,8A8,8,0,0,1,120,176Zm56-24a24,24,0,1,0-24-24A24,24,0,0,0,176,152Zm0-32a8,8,0,1,1-8,8A8,8,0,0,1,176,120ZM80,104a24,24,0,1,0,24,24A24,24,0,0,0,80,104Zm0,32a8,8,0,1,1,8-8A8,8,0,0,1,80,136Z"/></svg>By Movie</a>
      </div>
      <div class="top-bar-search">
        <input type="text" id="searchInput" placeholder="Search" autocomplete="off">
        <div class="search-results" id="searchResults"></div>
      </div>
    </div>
  </nav>
  ${searchMovies.length ? `<script>var __movies=${JSON.stringify(searchMovies)};</script>` : ''}
  <div class="page-content">
    ${body}
  </div>
  ${footer()}
  <script>
  (function() {
    if (typeof __movies === 'undefined') return;
    var input = document.getElementById('searchInput');
    var results = document.getElementById('searchResults');

    input.addEventListener('input', function() {
      var q = input.value.trim().toLowerCase();
      if (!q) { results.classList.remove('open'); return; }
      var matches = __movies.filter(function(m) {
        return m.title.toLowerCase().includes(q);
      }).slice(0, 20);
      if (matches.length === 0) {
        results.innerHTML = '<div class="search-no-results">No matches</div>';
      } else {
        results.innerHTML = matches.map(function(m) {
          return '<a class="search-result" href="/movie/' + m.id + '">' +
            m.title.replace(/</g, '&lt;') + '</a>';
        }).join('');
      }
      results.classList.add('open');
    });

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.top-bar-search')) results.classList.remove('open');
    });
  })();
  </script>
<!-- Cloudflare Web Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "7be715a2618c4f20beba95cc903eb28f"}'></script><!-- End Cloudflare Web Analytics -->
</body>
</html>
  `;
}
