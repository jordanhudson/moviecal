/** @jsxImportSource hono/jsx */
import type { Child } from 'hono/jsx';

function Footer() {
  return (
    <footer style="text-align: center; padding: 24px 16px; color: #555; font-size: 12px;">
      <p>Vancouver movie showtimes for independent and repertory cinemas &mdash; Cinematheque, VIFF, Rio Theatre, Park Theatre, and more.</p>
      <p style="margin-top: 6px;">Made by <a href="https://github.com/jordanhudson" target="_blank" style="color: #6a9a9a;">Jordan Hudson</a></p>
    </footer>
  );
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
  ogImage?: string;
  jsonLd?: object | object[];
  styles?: string[];
  body: Child;
  activePage?: string;
}

const SEARCH_SCRIPT = `
(function() {
  if (typeof __movies === 'undefined') return;
  var input = document.getElementById('searchInput');
  var results = document.getElementById('searchResults');

  function slug(t) {
    return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

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
        var s = slug(m.title);
        var href = '/movie/' + m.id + (s ? '-' + s : '');
        return '<a class="search-result" href="' + href + '">' +
          m.title.replace(/</g, '&lt;') + '</a>';
      }).join('');
    }
    results.classList.add('open');
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.top-bar-search')) results.classList.remove('open');
  });
})();`;

const calendarIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 256 256" style="vertical-align: -2px; margin-right: 4px;"><path fill="currentColor" d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-68-76a12,12,0,1,1-12-12A12,12,0,0,1,140,132Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,184,132ZM96,172a12,12,0,1,1-12-12A12,12,0,0,1,96,172Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,140,172Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,184,172Z"/></svg>';

const filmIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 256 256" style="vertical-align: -2px; margin-right: 4px;"><path fill="currentColor" d="M232,216H183.36A103.95,103.95,0,1,0,128,232H232a8,8,0,0,0,0-16ZM40,128a88,88,0,1,1,88,88A88.1,88.1,0,0,1,40,128Zm88-24a24,24,0,1,0-24-24A24,24,0,0,0,128,104Zm0-32a8,8,0,1,1-8,8A8,8,0,0,1,128,72Zm24,104a24,24,0,1,0-24,24A24,24,0,0,0,152,176Zm-32,0a8,8,0,1,1,8,8A8,8,0,0,1,120,176Zm56-24a24,24,0,1,0-24-24A24,24,0,0,0,176,152Zm0-32a8,8,0,1,1-8,8A8,8,0,0,1,176,120ZM80,104a24,24,0,1,0,24,24A24,24,0,0,0,80,104Zm0,32a8,8,0,1,1,8-8A8,8,0,0,1,80,136Z"/></svg>';

export function renderPage({ title, description, canonicalPath, ogImage, jsonLd, styles, body, activePage }: PageOptions): string {
  const searchMovies = _searchMovies;
  const BASE_URL = 'https://movieclock.app';
  const metaDesc = description || 'Movie showtimes for Vancouver independent cinemas — Cinematheque, VIFF, Rio Theatre, Park Theatre, and more.';
  const jsonLdItems = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  const cssFiles = ['/css/global.css', ...(styles || [])];
  const ogImageUrl = ogImage || `${BASE_URL}/og-image.png`;
  const canonicalUrl = canonicalPath != null ? `${BASE_URL}${canonicalPath}` : BASE_URL;

  const page = (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="dark" />
        <meta name="darkreader-lock" />
        <meta name="google-site-verification" content="VM8EAB3B8XS6MIzpotyQjlH5WodE2q_e0NkffgF_DdI" />
        <meta name="description" content={metaDesc} />
        <meta property="og:site_name" content="MovieClock" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={metaDesc} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={metaDesc} />
        <meta name="twitter:image" content={ogImageUrl} />
        {canonicalPath != null && <link rel="canonical" href={`${BASE_URL}${canonicalPath}`} />}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
        {cssFiles.map(href => <link rel="stylesheet" href={href} />)}
        {jsonLdItems.map(item => (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }} />
        ))}
        <title>{title}</title>
      </head>
      <body>
        <nav class="top-bar">
          <div class="top-bar-inner">
            <a href="/" class="top-bar-logo">Movie<b>Clock</b></a>
            <div class="top-bar-nav">
              <a href="/" class={activePage === 'home' ? 'active' : undefined}>
                <span dangerouslySetInnerHTML={{ __html: calendarIcon }} />By Date
              </a>
              <a href="/movies" class={activePage === 'movies' ? 'active' : undefined}>
                <span dangerouslySetInnerHTML={{ __html: filmIcon }} />By Movie
              </a>
            </div>
            <div class="top-bar-search">
              <input type="text" id="searchInput" placeholder="Search" autocomplete="off" />
              <div class="search-results" id="searchResults"></div>
            </div>
          </div>
        </nav>
        {searchMovies.length > 0 && (
          <script dangerouslySetInnerHTML={{ __html: `var __movies=${JSON.stringify(searchMovies)};` }} />
        )}
        <div class="page-content">
          {body}
        </div>
        <Footer />
        <script dangerouslySetInnerHTML={{ __html: SEARCH_SCRIPT }} />
        <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "7be715a2618c4f20beba95cc903eb28f"}' />
      </body>
    </html>
  );

  return '<!DOCTYPE html>' + page.toString();
}
