# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MovieCal is a TypeScript web scraper that collects movie screening times from Vancouver cinema websites, stores them in PostgreSQL, and displays them in a timeline web interface.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled JavaScript from dist/
npm run scrape       # Run full scraping job (all venues + TMDB + DB save)
npm run migrate      # Run database migrations
npm run clear        # Clear all data from database
npm run drop         # Drop all tables from database
npm run server       # Start web server on http://localhost:3000
```

## Deployment

Deployed on Fly.io as `movieclock`:

```bash
fly deploy                                    # Deploy to production
fly status -a movieclock                      # Check app status
fly ssh console -a movieclock -C "command"   # Run command on server
fly logs -a movieclock                        # View logs
```

**Configuration** (`fly.toml`):
- `min_machines_running = 1` - Keeps one machine always running for cron jobs
- Release command runs migrations on deploy

## Architecture

### ES Modules Configuration

- Project uses `"type": "module"` in package.json
- **CRITICAL**: All imports must include `.js` extension, even when importing `.ts` files
  - Example: `import { Movie } from './models.js'` (NOT `'./models'` or `'./models.ts'`)
- TypeScript compiles `.ts` → `.js` but import statements must already reference `.js`

### Entry Points

1. **`src/scrape.ts`** - Production scraping job
   - Runs all scrapers in parallel (VIFF, Rio, Cinematheque, Park)
   - Enriches movies with TMDB API data (requires `TMDB_API_TOKEN` in `.env`)
   - Saves to PostgreSQL database
   - Handles duplicates via unique constraint
   - Use `npm run scrape` to run

2. **`src/server.ts`** - Hono web server
   - Routes requests to page renderers
   - Runs cron job every 2 hours to scrape
   - Runs on port 3000
   - Use `npm run server` to run

### Web Pages

Page rendering is in `src/pages/`:

- **`src/pages/index.ts`** - Home page (`/`)
  - Desktop: Timeline view with theatre rows and time-positioned screening blocks
  - Mobile (<800px): Agenda view with theatre sections listing movies
  - Query by date: `/?date=YYYY-MM-DD`

- **`src/pages/movie.ts`** - Movie detail page (`/movie/:id`)
  - Shows poster, title, year, runtime, director
  - Link to TMDB
  - Chronological list of all screenings (past grayed out)

### Database Layer

**Stack**: PostgreSQL + Kysely (type-safe SQL query builder) + pg driver

**Schema** (see `migrations/001_initial_schema.sql`):
- `movie` table: id, title, year, director, runtime, tmdb_id, tmdb_url, poster_url
- `screening` table: id, movie_id, datetime, theatre_name, booking_url
- Unique constraint on (movie_id, datetime, theatre_name) prevents duplicate screenings

**Files**:
- `src/db/connection.ts` - Database connection and config (reads from `.env`)
- `src/db/schema.ts` - TypeScript types for Kysely (generated types matching tables)
- `src/db/migrate.ts` - Simple migration runner (runs SQL files in `migrations/`)
- Migrations stored in `migrations/*.sql`

**Database Setup**:
- Requires PostgreSQL running (use `docker-compose.yml` or local install)
- Configure via environment variables: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- Run `npm run migrate` to initialize schema

### Global Data Models

All scrapers must return data using standardized models (`src/models.ts`):

```typescript
interface Movie {
  id: number | null;        // Database ID (null for new movies)
  title: string;
  year: number | null;
  director: string | null;
}

interface Screening {
  id: number | null;        // Database ID (null for new screenings)
  datetime: Date;           // Parsed as Date object (assume Pacific timezone)
  theatreName: string;
  bookingUrl: string;
  movie: Movie;             // Each screening embeds its Movie
}
```

### Timezone Handling

**Important**: The system stores times as naive timestamps representing Pacific time. The server runs in UTC on Fly.io.

- **VIFF, Cinematheque, Park**: Return times without timezone info - these are parsed as local time (UTC on server), which works correctly because the times are stored/displayed as-is
- **Rio**: Returns UTC times with `+00:00` offset - these must be converted to Pacific-naive format using `utcToPacificNaive()` in `rio-scraper.ts`

If adding a new scraper that returns UTC times, use the same pattern as Rio to convert to Pacific-naive format.

### Scraper Patterns

Scrapers use one of two approaches depending on whether the venue has an API:

#### API-Based Scrapers (Preferred)

**When to use**: If the venue has a public API or WordPress REST API endpoint

**Pattern**:
1. **Define venue-specific interfaces** matching the API response structure
2. **Export async function**: `export async function scrape{Venue}(): Promise<Screening[]>`
3. **Fetch from API**: Use `fetch()` to call the API endpoint
4. **Parse response**: Extract film title, datetime (usually ISO 8601), booking URL, venue
5. **Convert to global models**: Map API data to `Screening[]`

**Example (API-based)**:
```typescript
import { Movie, Screening } from '../models.js';

interface VenueApiEvent {
  title: string;
  start_time: string; // ISO 8601
  booking_url: string;
  venue_id: string;
}

export async function scrapeVenue(): Promise<Screening[]> {
  const response = await fetch('https://venue.com/api/events');
  const events: VenueApiEvent[] = await response.json();

  return events.map(event => ({
    id: null,
    datetime: new Date(event.start_time),
    theatreName: event.venue_id,
    bookingUrl: event.booking_url,
    movie: { id: null, title: event.title, year: null, director: null }
  }));
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
5. **Convert to global models**: Transform venue-specific data to `Screening[]`
6. **Always close browser**: Use try/finally to ensure `browser.close()`

**Example (Puppeteer-based)**:
```typescript
import puppeteer from 'puppeteer';
import { Movie, Screening } from '../models.js';

interface VenueScreening {
  date: string;
  time: string;
  title: string;
}

export async function scrapeVenue(): Promise<Screening[]> {
  const browser = await puppeteer.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto('https://venue.com', { waitUntil: 'networkidle2', timeout: 30000 });

    await new Promise(resolve => setTimeout(resolve, 3000));

    const venueScreenings = await page.evaluate(() => {
      // Extract data using DOM selectors
      return results;
    });

    // Convert to global Screening[] models
    return venueScreenings.map(vs => ({
      id: null,
      datetime: parseDateTime(vs.date, vs.time),
      theatreName: 'Venue Name',
      bookingUrl: vs.url,
      movie: { id: null, title: vs.title, year: null, director: null }
    }));

  } finally {
    await browser.close();
  }
}

function parseDateTime(dateStr: string, timeStr: string): Date {
  // Custom parsing logic for this venue's date format
}
```

### TMDB Integration

The scraping job (`scrape.ts`) enriches movies with data from The Movie Database (TMDB):
- Searches TMDB for each new movie by title + year
- Saves tmdb_id, tmdb_url, poster_url, runtime to database
- Requires `TMDB_API_TOKEN` in `.env` (optional - scraper works without it)
- Uses TMDB API v3: `https://api.themoviedb.org/3/search/movie`

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
4. Import in `src/scrape.ts` and add to `Promise.all()` array
5. Run `npm run scrape` to test (all scrapers run in parallel with error handling)

**Note**: If a venue later adds an API, refactor from Puppeteer to API-based approach for better performance.

## Environment Variables

Create `.env` file (see `.env.example`):
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=moviecal
DB_USER=postgres
DB_PASSWORD=postgres
TMDB_API_TOKEN=your_token_here  # Optional
```

## Tech Stack

- **TypeScript**: Strict mode, ES2022 target
- **Puppeteer**: Headless browser automation for scraping
- **Kysely**: Type-safe SQL query builder
- **PostgreSQL**: Database
- **Hono**: Web framework for timeline UI
- **node-cron**: Scheduled scraping (every 2 hours)
- **tsx**: TypeScript execution for development
- **dotenv**: Environment variable management

## UI Design

**Color scheme** (dark mode):
- Background: `#1e1e1e`
- Content areas: `#262626`
- Text: `#c5c5c5`
- Muted text: `#707070` - `#888`
- Borders: `#353535`
- Accent (screening blocks, buttons): `#4a7c7c` (muted teal)
- Links: `#6a9a9a`
