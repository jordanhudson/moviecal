/** @jsxImportSource hono/jsx */
import type { Child } from 'hono/jsx';
import { jsonForScript } from '../utils/html.js';
import { assetUrl } from '../utils/assets.js';

function Footer() {
  return (
    <footer style="text-align: center; padding: 24px 16px; color: #555; font-size: 12px;">
      <p>
        Vancouver movie showtimes for independent and repertory cinemas &mdash; Cinematheque, VIFF,
        Rio Theatre, Park Theatre, and more.
      </p>
      <p style="margin-top: 6px;">
        Made by{' '}
        <a href="https://github.com/jordanhudson" target="_blank" style="color: #6a9a9a;">
          Jordan Hudson
        </a>
      </p>
    </footer>
  );
}

export interface PageOptions {
  title: string;
  description?: string;
  canonicalPath?: string;
  ogImage?: string;
  jsonLd?: object | object[];
  styles?: string[];
  // Page-specific external scripts (under public/js), emitted at end of body
  // after the shared search script. Served from same-origin so the strict
  // script-src CSP allows them with no inline scripts or nonces.
  scripts?: string[];
  body: Child;
  activePage?: string;
}

const calendarIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 256 256" style="vertical-align: -2px; margin-right: 4px;"><path fill="currentColor" d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-68-76a12,12,0,1,1-12-12A12,12,0,0,1,140,132Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,184,132ZM96,172a12,12,0,1,1-12-12A12,12,0,0,1,96,172Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,140,172Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,184,172Z"/></svg>';

const filmIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 256 256" style="vertical-align: -2px; margin-right: 4px;"><path fill="currentColor" d="M232,216H183.36A103.95,103.95,0,1,0,128,232H232a8,8,0,0,0,0-16ZM40,128a88,88,0,1,1,88,88A88.1,88.1,0,0,1,40,128Zm88-24a24,24,0,1,0-24-24A24,24,0,0,0,128,104Zm0-32a8,8,0,1,1-8,8A8,8,0,0,1,128,72Zm24,104a24,24,0,1,0-24,24A24,24,0,0,0,152,176Zm-32,0a8,8,0,1,1,8,8A8,8,0,0,1,120,176Zm56-24a24,24,0,1,0-24-24A24,24,0,0,0,176,152Zm0-32a8,8,0,1,1-8,8A8,8,0,0,1,176,120ZM80,104a24,24,0,1,0,24,24A24,24,0,0,0,80,104Zm0,32a8,8,0,1,1,8-8A8,8,0,0,1,80,136Z"/></svg>';

const searchIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 256 256"><path fill="currentColor" d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/></svg>';

export function renderPage({
  title,
  description,
  canonicalPath,
  ogImage,
  jsonLd,
  styles,
  scripts,
  body,
  activePage,
}: PageOptions): string {
  const BASE_URL = 'https://movieclock.app';
  const metaDesc =
    description ||
    'Movie showtimes for Vancouver independent cinemas — Cinematheque, VIFF, Rio Theatre, Park Theatre, and more.';
  const jsonLdItems = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  const cssFiles = ['/css/global.css', ...(styles || [])].map(assetUrl);
  const ogImageUrl = ogImage || `${BASE_URL}/og-image.png`;
  const canonicalUrl = canonicalPath != null ? `${BASE_URL}${canonicalPath}` : BASE_URL;

  const page = (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="dark" />
        <meta name="darkreader-lock" />
        <meta
          name="google-site-verification"
          content="VM8EAB3B8XS6MIzpotyQjlH5WodE2q_e0NkffgF_DdI"
        />
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
        <link
          rel="preload"
          href="/fonts/inter-latin.woff2"
          as="font"
          type="font/woff2"
          crossorigin=""
        />
        <link
          rel="preload"
          href="/fonts/space-grotesk-latin.woff2"
          as="font"
          type="font/woff2"
          crossorigin=""
        />
        {cssFiles.map((href) => (
          <link rel="stylesheet" href={href} />
        ))}
        {jsonLdItems.map((item) => (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonForScript(item) }}
          />
        ))}
        <title>{title}</title>
      </head>
      <body>
        <nav class="top-bar">
          <div class="top-bar-inner">
            <a href="/" class="top-bar-logo">
              Movie<b>Clock</b>
            </a>
            <div class="top-bar-nav">
              <a href="/" class={activePage === 'home' ? 'active' : undefined}>
                <span dangerouslySetInnerHTML={{ __html: calendarIcon }} />
                By Date
              </a>
              <a href="/movies" class={activePage === 'movies' ? 'active' : undefined}>
                <span dangerouslySetInnerHTML={{ __html: filmIcon }} />
                By Movie
              </a>
              <button type="button" class="nav-search-btn" id="navSearchBtn" aria-label="Search">
                <span dangerouslySetInnerHTML={{ __html: searchIcon }} />
              </button>
            </div>
            <div class="top-bar-search">
              <input type="text" id="searchInput" placeholder="Search" autocomplete="off" />
              <div class="search-results" id="searchResults"></div>
            </div>
          </div>
        </nav>
        <div class="page-content">{body}</div>
        <Footer />
        <script src={assetUrl('/js/search.js')} />
        {(scripts || []).map((src) => (
          <script src={assetUrl(src)} />
        ))}
        <script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token": "7be715a2618c4f20beba95cc903eb28f"}'
        />
      </body>
    </html>
  );

  return '<!DOCTYPE html>' + page.toString();
}
