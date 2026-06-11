# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

- Only commit or push when the user explicitly asks in the current message (e.g., "commit", "push", "commit and push"). Never carry forward commit/push intent from earlier messages.

## Project Overview

MovieCal is a TypeScript web scraper that collects movie screening times from Vancouver cinema websites, stores them in PostgreSQL, and displays them in a timeline web interface.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled JavaScript from dist/
npm run scrape       # Run full scraping job (all venues + TMDB + DB save)
npm run migrate      # Run database migrations
npm run repair       # Re-clean titles + backfill missing TMDB data
npm run clear        # Clear all data from database
npm run drop         # Drop all tables from database
npm run server       # Start web server on http://localhost:3000
```

## Local Development

**Use `podman`, not `docker`** for local containers (e.g. spinning up Postgres). Docker is not the preferred runtime on this machine.

To run the app locally with real data, bring up a Postgres matching `.env` (`DB_NAME=moviecal`, user/password `postgres`, port 5432), then migrate + scrape:

```bash
podman run -d --name moviecal-pg \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=moviecal \
  -p 5432:5432 docker.io/library/postgres:16
npm run migrate      # apply schema
npm run scrape       # populate real screenings (hits live venue sites + TMDB)
npm run server       # serve at http://localhost:3000
```

Note: `npm run server` uses nodemon watching `--ext ts`, which does **not** match `.tsx` — restart the server manually after editing pages.

## Deployment

Deployed on Fly.io as `movieclock`, served at **https://movieclock.app** (the canonical domain — `movieclock.fly.dev` 301-redirects to it).

**Auto-deploy**: Pushing to `main` triggers GitHub Actions (`.github/workflows/deploy.yml`): a `test` job (build + `npm test`) gates the `flyctl deploy --remote-only` job, and deploys are serialized via a concurrency group. Do NOT run `fly deploy` manually — just push and GHA handles it.

**Manual commands** (for debugging/repair only):
```bash
fly status -a movieclock                      # Check app status
fly ssh console -a movieclock -C "command"   # Run command on server
fly logs -a movieclock                        # View logs
```

**Important**: `tsx` is not available on the production image (it's a dev dependency). To run scripts on prod, use the compiled JS: `fly ssh console -a movieclock -C "node dist/db/repair.js"` (NOT `npm run repair`).

**Configuration** (`fly.toml`):
- `min_machines_running = 1` - Keeps one machine always running for cron jobs
- Release command runs migrations on deploy (`node dist/db/migrate.js`)
- `[[http_service.checks]]` polls `GET /healthz` (DB `select 1`); the route is registered before the host-redirect middleware so it returns 200 regardless of Host header

## Architecture

### ES Modules Configuration

- Project uses `"type": "module"` in package.json
- **CRITICAL**: All imports must include `.js` extension, even when importing `.ts`/`.tsx` files
  - Example: `import { Movie } from './models.js'` (NOT `'./models'` or `'./models.ts'`)
- TypeScript compiles `.ts`/`.tsx` → `.js` but import statements must already reference `.js`

### JSX Rendering

- Pages live in `src/pages/*.tsx` and render with **hono/jsx** (server-side only). Each page file starts with the `/** @jsxImportSource hono/jsx */` pragma.
- JSX is rendered to an HTML **string** via `.toString()` (see `renderPage` in `layout.tsx`); there is no client-side React/hydration. Interactivity is plain inline `<script>` strings injected with `dangerouslySetInnerHTML`.
- **Dev gotcha**: `npm run server` uses nodemon with `--watch src --ext ts`, which does **not** match `.tsx`. Editing a page does not hot-reload — restart the server manually after `.tsx` edits. (CSS under `public/css/` is served statically, so CSS edits need only a browser refresh.)

### Entry Points

1. **`src/scrape.ts`** - Production scraping job
   - Runs all scrapers in parallel (VIFF, Rio, Cinematheque, Park, Hollywood, Cineplex)
   - Re-cleans existing movie titles (see Title Cleaning below)
   - Enriches new movies with TMDB and Letterboxd data
   - Saves to PostgreSQL by **reconciling** screenings per scraper (`src/db/reconcile.ts`): within a date window, incoming screenings are matched/updated/rescheduled/inserted and stale ones deleted (not a blind delete-and-reinsert). Logged per scraper as `matched/updated/inserted/deleted`.
   - Holds a Postgres advisory lock (`pg_try_advisory_lock`) for the duration; concurrent runs (e.g. cron on a second Fly machine) skip instead of racing
   - Records each scraper's result (counts, duration, error) in the `scrape_run` table
   - After a full run (not single-scraper runs), pings `SCRAPE_HEARTBEAT_URL` if set — success pings the URL, any scraper error or zero-screening result POSTs a summary to `{url}/fail` (healthchecks.io-style dead-man's switch)
   - Use `npm run scrape` to run, or `npm run scrape {name}` for a single scraper

2. **`src/server.ts`** - Hono web server
   - Routes requests to page renderers
   - Hosts admin API endpoints for TMDB/Letterboxd fix-match (token compared with `crypto.timingSafeEqual`, see `src/routes/api.ts`)
   - Security headers via Hono `secure-headers` middleware on every response (no CSP — pages rely on inline scripts; `Referrer-Policy` relaxed to `strict-origin-when-cross-origin` so venues see booking referrals)
   - Branded 404/500 pages via `app.notFound`/`app.onError` (`src/pages/error.tsx`); `/api/*` paths get JSON errors instead. Error pages render even when the DB is down (search list falls back to empty)
   - Runs cron job every 2 hours to scrape
   - After 10pm Pacific, home page auto-shows tomorrow's screenings
   - Runs on port 3000

### Web Pages

Page rendering is in `src/pages/` (all `.tsx`, see JSX Rendering above):

- **`src/pages/index.tsx`** - Home page / "By Date" (`/`)
  - Desktop: a **Listing | Timeline** toggle (default **Listing**); Listing shows venue cards, Timeline shows theatre rows with time-positioned screening blocks
  - Mobile (<720px): always Listing (the Timeline and toggle are hidden)
  - Sticky date rail (built client-side, spans through any picked date) + a date picker; theatre filter chips drive the `hiddenTheatres` localStorage
  - Cineplex venues collapse multiple auditoriums into one group
  - Date selection is path-based: `/date/YYYY-MM-DD` (served by `renderHome` in `server.ts`). Legacy `/?date=YYYY-MM-DD` 301-redirects to the path form; invalid date paths 301 to `/`.

- **`src/pages/movie.tsx`** - Movie detail page (`/movie/:id`)
  - Shows poster, title, year, runtime, director, TMDB + Letterboxd links
  - Chronological list of future screenings with notes displayed; theatre name links to its page
  - Hidden TMDB fix-match modal (10 clicks on poster to activate, requires `ADMIN_TOKEN`)
  - `/movie/:id` URLs include a title slug (e.g. `/movie/1294-grave-of-the-fireflies`); see `src/utils/movie-url.ts`

- **`src/pages/theatre.tsx`** - Theatre detail page (`/theatre/:name`)
  - Lists all future screenings at this theatre with notes displayed

- **`src/pages/movies.tsx`** - Movies page / "By Movie" (`/movies`)
  - All movies with upcoming screenings, grouped by movie (poster + title row, theatre cards below)
  - Client-side sort: Date Added, Name, Popularity (TMDB)
  - Client-side theatre filtering (persisted in localStorage). Note: this page does **not** render screening notes (movie + theatre pages do).

- **`src/pages/all-movies.tsx`** - Internal movies page (`/internal-movies`)
  - Admin-oriented movie list with TMDB fix-match modal (intentionally left on the old styling)

- **`src/pages/layout.tsx`** - Shared page layout/shell (`renderPage`)
  - Nav bar with **By Date / By Movie** + search (searches movies with upcoming screenings). The search list comes from `getSearchMovies()` (`src/db/search-movies.ts` — in-memory cache, 5-min TTL, invalidated after each cron scrape) and is passed explicitly through every page renderer into `renderPage`; there is no module-global state
  - `color-scheme: dark` + `darkreader-lock` meta, Google Fonts (Space Grotesk + Inter), Cloudflare Web Analytics

- **`src/pages/tmdb-modal.tsx`** - Shared TMDB fix-match modal component
- **`src/pages/theatre-card.tsx`** - Shared venue/showtimes card used by the By Movie page

Shared helpers: `src/theatres.ts` (`THEATRE_ORDER`, `CINEPLEX_VENUES`/`CINEPLEX_PREFIXES`, `buildListingGroup`), `src/routes/api.ts` (admin API routes), `src/utils/{time,html,movie-url,letterboxd}.ts`.

### API Endpoints

- `GET /api/movie/:id/tmdb-search` - Search TMDB (requires `ADMIN_TOKEN`)
- `POST /api/movie/:id/tmdb-update` - Fix TMDB match for a movie (requires `ADMIN_TOKEN`)
- `POST /api/movie/:id/letterboxd-update` - Fix Letterboxd URL for a movie (requires `ADMIN_TOKEN`)
- `GET /robots.txt` - Robots file with sitemap reference
- `GET /sitemap.xml` - Dynamic sitemap of movies and theatres with future screenings

### Database Layer

**Stack**: PostgreSQL + Kysely (type-safe SQL query builder) + pg driver

**Schema** (defined in `migrations/*.sql`, types in `src/db/schema.ts`):

`movie` table:
- `id`, `title`, `year`, `director`, `runtime`
- `tmdb_id`, `tmdb_url`, `poster_url`, `tmdb_popularity` — from TMDB
- `letterboxd_url` — from Letterboxd (`'MISS'` = searched but not found, `null` = not yet searched)
- `created_at`, `updated_at`

`screening` table:
- `id`, `movie_id`, `datetime`, `theatre_name`, `booking_url`
- `note` — extracted from title cleaning (e.g. "Advance Screening", "4K Restoration")
- `created_at`, `updated_at`

`scrape_run` table:
- `id`, `scraper`, `started_at`, `finished_at`, `screening_count`, `error`, `created_at`
- One row per scraper per scrape job — makes failures/zero-result runs queryable for monitoring

**Files**:
- `src/db/connection.ts` - Database connection and config (reads from `.env`)
- `src/db/schema.ts` - TypeScript types for Kysely matching the DB tables
- `src/db/migrate.ts` - Migration runner (runs SQL files in `migrations/`)
- `src/db/repair.ts` - Re-cleans existing titles (shared logic with scrape), then backfills missing TMDB data
- `src/utils/reclean.ts` - Shared re-clean logic used by both scrape and repair
- `src/db/clear.ts` - Deletes all data
- `src/db/drop.ts` - Drops all tables
- Migrations stored in `migrations/*.sql` (use `IF NOT EXISTS`/`IF EXISTS` for idempotency)

### Global Data Models

All scrapers must return data using standardized models (`src/models.ts`):

```typescript
interface Movie {
  id: number | null;
  title: string;
  year: number | null;
  director: string | null;
  runtime: number | null;
}

interface Screening {
  id: number | null;
  datetime: Date;
  theatreName: string;
  bookingUrl: string;
  note: string | null;    // Extracted by title cleaner (e.g. "4K Restoration")
  movie: Movie;
}
```

### Timezone Handling

**Important**: The system stores times as naive timestamps representing Pacific time. The server runs in UTC on Fly.io.

- **VIFF, Cinematheque, Park, Hollywood**: Return times without timezone info - these are parsed as local time (UTC on server), which works correctly because the times are stored/displayed as-is
- **Rio**: Returns UTC times with `+00:00` offset - these must be converted to Pacific-naive format using `utcToPacificNaive()` in `rio-scraper.ts`
- **Cineplex**: Returns local Pacific time without timezone info - parsed with `parsePacificNaive()`

If adding a new scraper that returns UTC times, use the same pattern as Rio to convert to Pacific-naive format.

### Title Cleaning

**`src/utils/title-cleaner.ts`** strips parenthesized annotations (5+ chars at end of title) from movie titles and returns them as screening notes. Also decodes HTML entities (e.g. `&#8217;` → `'`).

`cleanMovieTitle("Backrooms (Advance Screening)")` returns `{ title: "Backrooms", note: "Advance Screening" }`.

**TMDB verification** (`verifyTitleCleaning()` in `src/utils/tmdb.ts`): The catch-all pattern can false-positive on foreign films with English subtitles in parens (e.g. "Él (This Strange Passion)"). `verifyTitleCleaning()` wraps `cleanMovieTitle()` and checks TMDB before stripping:
1. If the movie already has a `tmdb_id`: searches TMDB for the note content and checks if any result matches the existing `tmdb_id`. If so, the parens are an alternate title — keep them.
2. If no `tmdb_id`: searches TMDB for the full uncleaned title, checks for exact title match OR whether searching the note content returns the same movie as the uncleaned title search.

**Colon-annotation extraction** (also in `verifyTitleCleaning()`): handles titles of the form `"{Real Title}: {annotation}"` (e.g. `"Grave of the Fireflies: Bleak Week"` → title `"Grave of the Fireflies"`, note `"Bleak Week"`). To avoid mangling real colon titles, it splits on the **last** colon and only does so when TMDB has **no** movie titled exactly like the full string, **but does** have one titled exactly like the part before the colon — and the full string is **not** a known alternative title of that movie, and TMDB doesn't return a different, more-specific movie for the full string. This keeps "Dune: Part Two", "Star Wars: Episode IV - A New Hope", "Three Colours: Blue", etc. intact.

This is the **single verification function** used by both scrape and repair.

**Where notes get written**: the `note` lives on the **screening** row, not the movie. Both the scrape's new-movie path (`scrape.ts`) and the re-clean path (`reclean.ts`) call `verifyTitleCleaning` and then write the extracted note onto the movie's screenings (only where `note IS NULL`, so existing notes aren't clobbered). Scrapers themselves only strip parens, so colon splitting happens in these two paths — **a scrape alone is sufficient; no repair needed afterward.**

**Re-cleaning** (`recleanExistingTitles()` in `src/utils/reclean.ts`): Both scrape and repair runs re-clean all existing movie titles in the DB using the shared re-clean logic:
1. Calls `verifyTitleCleaning()` for each existing title
2. If the cleaned title matches another existing movie, screenings are merged (note applied) and the stale record is deleted
3. Otherwise renames in place (note applied to its screenings)
4. If TMDB or Letterboxd data is missing on the renamed movie, it retries the lookup with the cleaned title

This means adding a new pattern to the title cleaner is safe — just add the regex and the next scrape or repair run fixes everything up.

### TMDB Integration

**Shared module**: `src/utils/tmdb.ts` contains `getTMDBMovieDetails()`, `tmdbDetailsToMovieFields()`, and `verifyTitleCleaning()`. `tmdbDetailsToMovieFields()` is the **single place** that maps a TMDB API response to DB column values (`tmdb_id`, `tmdb_url`, `poster_url`, `runtime`, `year`, `tmdb_popularity`). When adding a new TMDB field, update `tmdbDetailsToMovieFields` and all code paths pick it up:
- New movie insert in `scrape.ts`
- Re-clean retry in `scrape.ts`
- TMDB fix-match endpoint in `server.ts`
- Repair script in `db/repair.ts`

**Search**: `scrape.ts` also has `searchTMDB()` which searches TMDB by title+year, filters out shorts (<60 min), and picks the best runtime match.

**Letterboxd**: `scrape.ts` has `searchLetterboxd()` which tries slug-based URL lookups on letterboxd.com. Stores `'MISS'` for not-found to distinguish from not-yet-searched (`null`).

Requires `TMDB_API_TOKEN` in `.env` (optional - scraper works without it).

### Scraper Patterns

Scrapers use one of two approaches depending on whether the venue has an API:

#### API-Based Scrapers (Preferred)

**When to use**: If the venue has a public API or WordPress REST API endpoint

**Pattern**:
1. **Define venue-specific interfaces** matching the API response structure
2. **Export async function**: `export async function scrape{Venue}(): Promise<Screening[]>`
3. **Fetch from API**: Use `fetch()` to call the API endpoint
4. **Parse response in a separate exported pure function** (e.g. `parseVenueEvents(events): Screening[]`): extract film title, datetime (usually ISO 8601), booking URL, venue. Keeping parse separate from fetch lets it be tested — save a trimmed real API response to `src/scrapers/fixtures/` and add a test in `src/scrapers/parsers.test.ts`
5. **Clean title**: Use `cleanMovieTitle()` to extract title and note
6. **Convert to global models**: Map API data to `Screening[]`

**Example (API-based)**:
```typescript
import { Movie, Screening } from '../models.js';
import { cleanMovieTitle } from '../utils/title-cleaner.js';

export async function scrapeVenue(): Promise<Screening[]> {
  const response = await fetch('https://venue.com/api/events');
  const events = await response.json();

  return events.map(event => {
    const { title, note } = cleanMovieTitle(event.title);
    return {
      id: null,
      datetime: new Date(event.start_time),
      theatreName: 'Venue Name',
      bookingUrl: event.booking_url,
      note,
      movie: { id: null, title, year: null, director: null, runtime: null }
    };
  });
}
```

#### Puppeteer-Based Scrapers (Fallback)

**When to use**: If no API is available (must scrape HTML)

**Pattern**:
1. **Define venue-specific interfaces** matching venue's HTML structure
2. **Export async function**: `export async function scrape{Venue}(): Promise<Screening[]>`
3. **Use Puppeteer**:
   - Launch headless browser: `puppeteer.launch({ headless: true })`
   - Navigate: `page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })`
   - **Wait 3 seconds** after page load: `await new Promise(resolve => setTimeout(resolve, 3000))`
     - Required for JavaScript-rendered content to hydrate
   - Extract data via `page.evaluate()` using CSS selectors
4. **Parse dates with custom function**: Each venue has unique date/time format
5. **Clean title**: Use `cleanMovieTitle()` to extract title and note
6. **Convert to global models**: Transform venue-specific data to `Screening[]`
7. **Always close browser**: Use try/finally to ensure `browser.close()`

### Current Scrapers

**API-Based** (fast, reliable):
- **`viff-scraper.ts`** - VIFF Centre
  - API: `https://viff.org/wp-json/v1/attendable/calendar/instances`
  - WordPress custom endpoint with calendar events
  - Returns HTML in JSON (extract title/URL via regex)
  - Venue mapping: `VENUE_NAMES` lookup with fallback formatter

- **`rio-scraper.ts`** - Rio Theatre
  - API: `https://riotheatre.ca/wp-json/barker/v1/listings`
  - WordPress custom plugin endpoint
  - Clean JSON with `tickets_link` for booking URLs
  - Date range: 1 month back, 2 months forward
  - **Note**: Uses `utcToPacificNaive()` to convert UTC times to Pacific-naive format

- **`cineplex-scraper.ts`** - Cineplex Theatres (Fifth Avenue, International Village, Scotiabank, Langley)
  - API: `https://apis.cineplex.com/prod/cpx/theatrical/api/v1/showtimes?language=en&locationId={theatreId}&date={M/D/YYYY}`
  - Azure API Management endpoint, requires header: `ocp-apim-subscription-key: 477f072109904a55927ba2c3bf9f77e3` (public key embedded in cineplex.com frontend)
  - Returns movies with sessions (showtimes) per theatre per day; fetches 7 days
  - `showStartDateTime` is local Pacific time — parsed with `parsePacificNaive()`
  - Theatre name format: `"{venue} {auditorium}"` e.g. `"Fifth Ave Aud #3"`, `"Intl Village Aud 05"`
  - Uses `deeplinkUrl` for booking URLs
  - **To find theatre IDs**: `GET https://apis.cineplex.com/prod/cpx/theatrical/api/v1/theatres?language=en&city=Vancouver&latitude=49.2514&longitude=-123.0972` (same API key header). Returns `theatreId` and `theatreName` for nearby theatres. This is not used by the scraper but is useful for adding new Cineplex locations.

- **`hollywood-scraper.ts`** - Hollywood Theatre
  - Uses cheerio to scrape event pages
  - Crawls individual event detail pages with a delay between requests

**Puppeteer-Based** (slower, more brittle):
- **`cinematheque-scraper.ts`** - Cinematheque
  - URL: `https://thecinematheque.ca/films/calendar`
  - Custom PHP application, no API available
  - Scrapes `#eventCalendar` DOM structure

- **`park-scraper.ts`** - Park Theatre
  - URL: `https://tickets.theparktheatre.ca/`
  - Igniter ticketing system, no API available
  - Scrapes event listings from HTML

All scrapers run in parallel via `scrape.ts` with error handling (failed scrapers don't break the job).

## Adding New Scrapers

### Step 1: Investigate for APIs

**Always try to find an API first** - they're faster, more reliable, and easier to maintain.

**Investigation process**:
1. **Check for WordPress**: Try `https://venue.com/wp-json/` to see available endpoints
   - Look for custom namespaces beyond `wp/v2`
   - Example: VIFF uses `/v1/attendable/calendar/instances`
   - Example: Rio uses `/barker/v1/listings`

2. **Monitor network traffic**: Use Puppeteer debug script to capture API calls:
   ```typescript
   page.on('response', async response => {
     const url = response.url();
     if (url.includes('json') || url.includes('api')) {
       console.log(url, await response.text());
     }
   });
   ```

3. **Check for React/Vue data**: Look in browser DevTools for:
   - Global variables: `window.__INITIAL_STATE__`, `window.eventData`, etc.
   - Script tags with `type="application/json"`
   - React fiber props via DOM inspection

4. **Try common API patterns**:
   - `/api/events`
   - `/api/screenings`
   - `?format=json` (Squarespace, Jekyll)
   - GraphQL endpoints

### Step 2: Implement Scraper

1. Create `src/scrapers/{venue}-scraper.ts`
2. Use **API pattern** if API found, otherwise **Puppeteer pattern**
3. Follow patterns documented in "Scraper Patterns" section above
4. Import in `src/scrape.ts` and add to the `scrapers` registry object
5. Run `npm run scrape {scraper-name}` to test the new scraper

**Note**: If a venue later adds an API, refactor from Puppeteer to API-based approach for better performance.

### Step 3: Add Theatre to UI

Add the new theatre name(s) to `THEATRE_ORDER` in `src/server.ts`. This controls which theatres appear on the home page timeline and their display order.

**Note**: If a venue has multiple screens/auditoriums with separate `theatreName` values (e.g., "Fifth Ave Aud #1", "Fifth Ave Aud #2"), add each one to the list. Cineplex venues also need an entry in `CINEPLEX_VENUES` to be collapsed into a single listing group.

## Environment Variables

Create `.env` file (see `.env.example`):
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=moviecal
DB_USER=postgres
DB_PASSWORD=postgres
TMDB_API_TOKEN=your_token_here  # Optional — scraper works without it
ADMIN_TOKEN=your_token_here     # Required for TMDB/Letterboxd fix-match endpoints
SCRAPE_HEARTBEAT_URL=...        # Optional — healthchecks.io-style ping URL, hit after each full scrape run
```

## Tech Stack

- **TypeScript**: Strict mode, ES2022 target
- **Puppeteer**: Headless browser automation for scraping
- **Cheerio**: HTML parsing (Hollywood scraper)
- **Kysely**: Type-safe SQL query builder
- **PostgreSQL**: Database
- **Hono**: Web framework for timeline UI
- **node-cron**: Scheduled scraping (every 2 hours)
- **tsx**: TypeScript execution for development
- **dotenv**: Environment variable management

## UI Design

**"Neon Night / Glass"** design system (dark mode). All styling is driven by CSS custom properties on `:root` in `public/css/global.css` — themes are intended to be swappable token blocks. Fonts: **Space Grotesk** (display) + **Inter** (body), loaded from Google Fonts in `layout.tsx`. Frosted-glass cards (`backdrop-filter: blur`), violet→cyan gradient accent.

Core tokens (`public/css/global.css`):
- Background: `--bg: #0a0a14` (deep indigo)
- Glass surfaces: `--glass: rgba(255,255,255,.045)`, `--glass2: rgba(255,255,255,.07)`
- Text: `--ink: #eef0ff`; muted: `--muted: #9a9ec2`; faint: `--faint: #646891`
- Borders/lines: `--line: rgba(255,255,255,.09)`
- Accent: `--violet: #8b5cf6`, `--cyan: #22d3ee`, `--pink: #f472b6` (notes), gradient `--grad: linear-gradient(100deg,#8b5cf6,#22d3ee)`
- Radii: `--radius-card: 20px`, `--radius-chip: 999px`

Per-page CSS lives in `public/css/{global,index,movie,movies,theatre,theatre-card,tmdb-modal}.css`. Favicon is `public/favicon.svg` (+ `.png` fallback) matching the gradient. The three earlier design explorations are kept under `design-prototypes/` (reference only, not wired in) as seeds for a future theme switcher.

**Note**: `/internal-movies` is intentionally left on the old teal styling and was not redesigned.
