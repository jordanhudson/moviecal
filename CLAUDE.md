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
npm run scrape       # Run full scraping job (all venues + TMDB + DB save)
npm run migrate      # Run database migrations
npm run repair       # Re-clean titles + backfill missing TMDB data
npm run audit-tmdb       # Read-only report of likely-wrong TMDB matches
npm run rematch-tmdb     # Re-match flagged movies (add --apply to write)
npx tsx src/db/rematch-by-year.ts # Re-check matches against venue-published years (add --apply to write)
npm run build-tmdb-review # Rebuild the /internal-tmdb-review work list
npm run clear        # Clear all data from database
npm run drop         # Drop all tables from database
npm run server       # Start web server on http://localhost:3000
npm test             # Run the test suite (node --test)
npm run lint         # ESLint (typescript-eslint, flat config)
npm run format       # Prettier --write across the repo
npm run format:check # Prettier --check (what CI gates on)
```

**Lint/format**: ESLint 9 flat config (`eslint.config.js`) + Prettier
(`.prettierrc.json`). The CI `test` job gates deploys on `npm run lint` and
`npm run format:check` before build/test, so run `npm run format` before
pushing. Config files and the page `.tsx` files are all covered; `dist/`,
`public/`, and `design-prototypes/` are ignored.

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
- JSX is rendered to an HTML **string** via `.toString()` (see `renderPage` in `layout.tsx`); there is no client-side React/hydration. Interactivity is plain client JS served from **external same-origin files** in `public/js/*.js` (so the strict `script-src 'self'` CSP allows them with no inline scripts or nonces — see Security headers below). A page opts into one via the `scripts` option on `renderPage` (e.g. `scripts: ['/js/movie.js']`), which emits `<script src={assetUrl(...)}>` after the shared `search.js`; the `TmdbModal` component pulls in `/js/modal.js` itself. Server data the scripts need rides in via `data-*` attributes and `<script type="application/json">` **data islands** (e.g. `#venueFilters`) — data blocks aren't governed by `script-src`. The few remaining `dangerouslySetInnerHTML` uses are all non-executable (JSON-LD + JSON islands, both escaped via `jsonForScript`) or static SVG icon constants — no executable inline scripts remain.
- **Dev gotcha**: `npm run server` uses nodemon with `--watch src --ext ts`, which does **not** match `.tsx`. Editing a page does not hot-reload — restart the server manually after `.tsx` edits. (CSS under `public/css/` and client JS under `public/js/` are served statically, so edits to those need only a browser refresh — no restart.)

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
   - Security headers via Hono `secure-headers` middleware on every response. Includes a **Content-Security-Policy** with a strict `script-src 'self' https://static.cloudflareinsights.com` (no `'unsafe-inline'`, no nonces — all client JS is same-origin files in `public/js/`, see JSX Rendering). `style-src` keeps `'unsafe-inline'` (timeline/poster gradients are per-request inline styles; a much weaker vector than scripts); `img-src` allows `https://image.tmdb.org`, `connect-src` allows the Cloudflare RUM endpoint. `Referrer-Policy` relaxed to `strict-origin-when-cross-origin` so venues see booking referrals
   - Gzip compression via Hono `compress` middleware (the app is served straight from Fly, no CDN in front)
   - Static assets get cache headers in production only (gated on `NODE_ENV=production`, set in the Dockerfile): CSS, JS, and fonts are immutable for a year (CSS and JS URLs carry a content hash via `assetUrl` in `src/utils/assets.ts`; font filenames never change), favicons and og-image a day
   - Branded 404/500 pages via `app.notFound`/`app.onError` (`src/pages/error.tsx`); `/api/*` paths get JSON errors instead. Error pages render even when the DB is down (search list falls back to empty)
   - Runs cron job every 2 hours to scrape
   - After 10pm Pacific, home page auto-shows tomorrow's screenings
   - Runs on port 3000

### Web Pages

Page rendering is in `src/pages/` (all `.tsx`, see JSX Rendering above):

- **`src/pages/index.tsx`** - Home page / "By Date" (`/`)
  - Desktop: a **Listing | Timeline** toggle (default **Listing**); Listing shows venue cards, Timeline shows theatre rows with time-positioned screening blocks
  - Mobile (<720px): always Listing (the Timeline and toggle are hidden)
  - Sticky date rail (built client-side, spans through any picked date) + a date picker; theatre filter chips drive the venue filter (see Venue Filtering below)
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
  - Client-side venue filtering (see Venue Filtering below): venue cards whose theatres are all hidden are dropped, then films left with no venue card, with a note above the list to reveal them. Note: this page does **not** render screening notes (movie + theatre pages do).

- **`src/pages/all-movies.tsx`** - Internal movies page (`/internal-movies`)
  - Admin-oriented movie list with TMDB fix-match modal (intentionally left on the old styling)

- **`src/pages/tmdb-review.tsx`** - TMDB match review queue (`/internal-tmdb-review`)
  - Admin page that reads the `tmdb_review` work list (likely-wrong matches, populated by `build-tmdb-review.ts`). Each card shows the current (probably wrong) match beside TMDB's top suggestion, **plus the movie's upcoming screenings with ticket links** (via the shared `ScreeningsList`, so it renders exactly like `/movie/:id`). Actions: **Yup** applies the suggestion, **Nope** opens the shared fix-match modal to pick another, **dismiss** drops it as a false positive, **Delete movie** removes it from the DB entirely (with a confirm). All token-gated by one admin-token field, which is copied into the modal on Nope (the modal then auto-searches). Every fix also refreshes Letterboxd.

- **`src/pages/screenings-list.tsx`** - Shared `ScreeningsList` component (day-grouped upcoming screenings with theatre links, notes, and Book Tickets links). Used by the movie detail page and the TMDB review page.

- **`src/pages/login.tsx`** - Sign-in page (`/login`)
  - One button per configured OAuth provider (see Authentication below). Provider marks live here, not in the provider registry — that's config, this is presentation. `noindex`.

- **`src/pages/layout.tsx`** - Shared page layout/shell (`renderPage`)
  - Nav bar with **By Date / By Movie** + search + the account control (a **Sign in** link, or the signed-in visitor's avatar opening a `<details>` menu with their name/email and a Sign out form). The user comes in via `renderPage`'s `user` option, which every page renderer takes as a trailing parameter and fills from `currentUser(c)`. Search is **server-side**: the client debounces input and fetches `GET /api/search?q=` (see API Endpoints), which queries the whole `movie` table — so films with no upcoming screenings are still findable. There is no embedded movie list and no `searchMovies` plumbing through the renderers
  - `color-scheme: dark` + `darkreader-lock` meta, self-hosted fonts (Space Grotesk + Inter, see UI Design), Cloudflare Web Analytics

- **`src/pages/tmdb-modal.tsx`** - Shared TMDB fix-match modal component. `open()` auto-searches the title when a token is already present (the review-page path, which carries the admin token through); the secret 10-click entrypoint has no token yet, so it stays manual there.
- **`src/pages/theatre-card.tsx`** - Shared venue/showtimes card used by the By Movie page

Shared helpers: `src/venues.ts` (venue configuration — see below), `src/routes/api.ts` (admin API routes), `src/utils/{time,html,movie-url,letterboxd}.ts`.

### Venue configuration (`src/venues.ts`)

The cinemas we track are **application config, not data** — they change rarely and are known at build time, so they live in `src/venues.ts` (not the DB). `LOCATIONS` is the single source of truth: a list of `Location`s, each with a display `name`, a `grouping` mode, and its `auditoriums` (each keyed by the exact `theatre_name` a scraper emits). Everything else is derived from it — `THEATRE_ORDER` (timeline rows), `VENUE_FILTERS` / `VENUE_FILTER_CONFIG` (the client-side venue-filter payload), `auditoriumLabel`, `canonicalTheatreName`, `venueGroup`, and `buildDayListingGroups`. Screenings still carry a free-text `theatre_name`; `venues.ts` interprets it.

- `grouping: 'collapse'` — one listing card for the whole location, auditoriums pooled (every Cineplex site, and the single-screen indies).
- `grouping: 'separate'` — each auditorium is its own card (VIFF Cinema and VIFF Lochmaddy are two rooms of VIFF Centre shown separately).
- `prefix` (Cineplex only) — any `theatre_name` starting with it resolves to that location even if not enumerated, so a newly added "Aud #6" pools correctly with no code change.
- `aliases` (on an auditorium) — other `theatre_name`s the same room is scraped under, because a venue can be listed by more than one source (VIFF lists Rio screenings as `The Rio Theatre`). `canonicalTheatreName()` resolves them, and the home page, theatre pages, and the venue filter all key on the canonical name, so one room is never two venues. Add an alias here rather than letting a second name accumulate its own card.

A `theatre_name` matching **no** location still gets its own listing card, chip, and timeline row (keyed by its raw name) rather than being silently dropped — that's how VIFF's off-site partner rooms (The Pearl, Chan Centre) stay visible and filterable with no config change.

### Venue Filtering ("hide this cinema")

Visitors can hide venues they never go to. One list, one matcher, three pages.

**Storage**: `localStorage['hiddenTheatres']`, an array of strings. Each entry is
either a **filter key** (what a home-page chip represents: `The Rio`,
`Fifth Avenue`, `VIFF Lochmaddy Studio`) or a raw `theatre_name` for a single
auditorium hidden from the timeline (`Fifth Ave Aud #3`). This is the format the
feature has always written, so existing visitor preferences keep working.

**The matcher**: `public/js/venue-filter.js` (`window.VenueFilter`) is the only
code that decides whether a screening is hidden. Pages ask
`VenueFilter.isHidden(theatreName)`; they never read localStorage or
re-implement the exact/prefix/alias rules themselves. It also exposes
`hide/unhide/toggle`, `labelFor`, and `subscribe(fn)` (re-applies on change,
including from another tab). Config arrives via the `#venueFilters` JSON island
rendered by `<VenueFilterData />` (`src/pages/venue-filter.tsx`) from
`VENUE_FILTER_CONFIG` in `venues.ts`.

**Two levels, one list.** A visitor can hide an entire **location** (the home
page chips) or a single **auditorium** (the `hide` button on a timeline row).
Both go in the same array — a location as its filter key, an auditorium as its
raw `theatre_name` — and `isHidden` resolves either.

Because a `collapse` venue card pools several auditoriums, the pooled surfaces
filter at the **showtime** level and cascade upward, so auditorium-level hiding
is visible in the listing too, not just the timeline:

- home listing: showtime → film row → venue card
- By Movie: showtime → date row → venue card → film

That means each showtime must know which auditorium it belongs to.
`buildListingGroup` puts `theatreNames` on every showtime (a deduped showtime —
two screens, same time — carries both, so it survives until both are hidden),
and the pages emit it as `data-theatres`. A chip reads **off** when its card has
nothing left, whether the visitor hid the venue outright or hid every screen one
at a time; clicking an off chip restores the whole location, clearing any
individually-hidden auditoriums with it.

**A filter key is a listing group's `venue`** — `buildDayListingGroups` and
`VENUE_FILTERS` are derived from the same `LOCATIONS` rules, and a test asserts
the identity. That is what lets a chip on the home page write a value every
other page reads back. `grouping: 'separate'` venues filter per auditorium;
`'collapse'` venues filter as one location.

Any page using it must load `/js/venue-filter.js` **before** its own script and
render `<VenueFilterData />`:
- **Home** — chips toggle a venue; `hide` on a timeline row hides one auditorium.
  An "Also hidden" strip (in the datebar, so it shows in both views) lists
  anything hidden that has no chip today; a note appears if everything is hidden.
- **Movie** — hidden screenings collapse, with an honest count on the Screenings
  heading. This holds even when *every* screening is at a hidden venue: the list
  goes empty and a message explains why, rather than showing them dimmed (which
  read as the filter being ignored). The toggle reveals them either way.
- **By Movie** — venue cards whose theatres are all hidden are dropped, then
  films left with none, with a note to reveal them.

Elements are hidden with the `hidden` attribute (`[hidden]` is forced to
`display: none` in `global.css`), never by writing `style.display`.

### API Endpoints

- `GET /api/search?q=` - Nav-bar movie search; `title ILIKE '%q%'` over all movies, alphabetical, capped at 20. Backed by a `pg_trgm` GIN index (`migrations/007`)
- `GET /api/movie/:id/tmdb-search` - Search TMDB (requires `ADMIN_TOKEN`)
- `POST /api/movie/:id/tmdb-update` - Fix TMDB match for a movie (requires `ADMIN_TOKEN`); also re-derives `letterboxd_url` from the new TMDB id via `letterboxdUrlByTmdbId()` (Letterboxd's `/tmdb/{id}/` redirect). Also clears any `tmdb_review` row for the movie (resolving it from the review queue).
- `POST /api/tmdb-review/:id/dismiss` - Drop a movie from the `tmdb_review` queue without changing its match ("this is actually correct"); requires `ADMIN_TOKEN`
- `POST /api/movie/:id/delete` - Delete a movie and (via `ON DELETE CASCADE`) its screenings and any `tmdb_review` row; requires `ADMIN_TOKEN`
- `GET /robots.txt` - Robots file with sitemap reference
- `GET /sitemap.xml` - Dynamic sitemap of movies and theatres with future screenings

### Authentication (OAuth login)

Visitors can sign in. **Login is OAuth-only — there is no password anywhere in
the system, by design.** Google is the only provider wired up today; adding
another is one entry in a registry plus two env vars, with no changes to the
routes, session layer, or UI.

Nothing on the site is gated behind login yet: signing in shows you in the nav
and creates an account row, and that's it. Signing in is not required for any
existing feature.

**Provider registry** (`src/auth/providers.ts`): `PROVIDERS` is the single
source of truth. Each entry carries its endpoints, scopes, whether it uses PKCE,
the two env vars holding its credentials, its avatar host (folded into the CSP's
`img-src` by `avatarImgSrc()`), and a `profile()` that maps its token response to
`{ providerUserId, email, emailVerified, name, avatarUrl }`. A provider with
either credential env var missing counts as **unconfigured** and simply doesn't
appear on the login page — so a deployment with no `GOOGLE_CLIENT_ID` runs fine
with sign-in absent.

**Routes** (`src/routes/auth.ts`):
- `GET /login` — the sign-in page, one button per configured provider
- `GET /auth/:provider` — starts the flow (mints `state` + PKCE verifier, redirects)
- `GET /auth/:provider/callback` — verifies `state`, exchanges the code, upserts the user, starts the session
- `POST /auth/logout` — deletes the session row and clears the cookie (POST so a link/prefetch can't sign someone out)

**Flow state**: `state` + PKCE verifier + post-login destination ride in a
short-lived HttpOnly cookie (`mc_oauth`, scoped to `/auth`, 10 min) rather than
server memory — Fly runs more than one machine. The callback requires the
query's `state` to equal the cookie's; that comparison is the CSRF defence.

**Redirect safety**: sign-in and sign-out carry no destination in the markup —
the routes read `Referer` and send the visitor back where they were.
`safeReturnTo()` / `returnToFromReferer()` (`src/auth/urls.ts`) clamp any
destination to a same-site path and reject `/auth/*` and `/login` (an open
redirect on a login route is a phishing primitive). This is the most
security-relevant code in the feature and is the most heavily tested.

**id_token handling** (`src/auth/jwt.ts`): the Google profile is read straight
out of the `id_token`, with `iss`/`aud`/`exp`/`sub` checked but **no signature
verification** — the token is fetched by the server, over TLS, directly from
Google's token endpoint in exchange for the client secret, which is the case
Google documents as not needing local validation. Don't reuse `decodeJwtPayload`
for a token that arrived any other way.

**Identity model** (`src/auth/users.ts`): `user_identity` is what a login keys
on, never the email — a provider `sub` is stable, an email can be renamed or
reassigned. Email is used for exactly one thing: recognising that a *new*
provider identity belongs to an account we already have, so a second provider
links instead of forking. Only a provider-**verified** email is trusted for
that, and an unverified address is never even stored.

**Sessions** (`src/auth/session.ts`): server-side and opaque. The cookie
(`mc_session`, HttpOnly, SameSite=Lax, Secure over https, 30 days) holds a random
token; the DB stores only its SHA-256, so a dump of `user_session` can't be
replayed. Sessions roll forward when used with under 15 days left, expired rows
are deleted on sight, and a daily cron sweeps abandoned ones. Sign-out is a real
revocation, not an expiry wait.

**In pages**: `sessionMiddleware` puts the user on `c.get('user')`; routes pass
`currentUser(c)` into their page renderer, which forwards it to `renderPage` as
`user`. The nav renders a **Sign in** link or the account menu — a plain
`<details>` element that works with JavaScript off (`search.js` only adds
click-outside/Escape dismissal).

**Local setup**: create an OAuth client in Google Cloud Console (Web
application), add `http://localhost:3000/auth/google/callback` and
`https://movieclock.app/auth/google/callback` as authorized redirect URIs, and
put the id/secret in `.env`. `BASE_URL` defaults to `http://localhost:3000`
outside production and `https://movieclock.app` in it (`NODE_ENV`, set in the
Dockerfile), so no extra config is needed either way. In production the two
secrets are set with `fly secrets set`.

### Database Layer

**Stack**: PostgreSQL + Kysely (type-safe SQL query builder) + pg driver

**Schema** (defined in `migrations/*.sql`, types in `src/db/schema.ts`):

`movie` table:
- `id`, `title`, `year`, `director`, `runtime`
- `tmdb_id`, `tmdb_url`, `poster_url`, `tmdb_popularity` — from TMDB
- `letterboxd_url` — from Letterboxd: a real URL, or `null` (no known URL — whether not yet searched or the lookup found nothing). No sentinel; Letterboxd sources from TMDB so genuine misses are rare.
- `created_at`, `updated_at`
- **Identity**: `tmdb_id` is canonical (unique partial index `idx_movie_tmdb_id_unique`, `WHERE tmdb_id IS NOT NULL`). When a scrape matches a new title to a `tmdb_id` that already exists, it reuses that row and renames the incoming screenings to its title instead of inserting a duplicate (`scrape.ts`). TMDB-less movies (`tmdb_id IS NULL`) still fall back to exact-title identity.

`screening` table:
- `id`, `movie_id`, `datetime` (`timestamptz` — a real UTC instant, see Timezone Handling), `theatre_name`, `booking_url`
- `note` — extracted from title cleaning (e.g. "Advance Screening", "4K Restoration")
- `created_at`, `updated_at`
- **Identity**: unique index `idx_screening_identity_unique` on `(theatre_name, movie_id, datetime)` — the tuple the reconciler keys on. Reconcile inserts use `ON CONFLICT DO NOTHING`, so a duplicate is a race-safe no-op instead of an error.

`scrape_run` table:
- `id`, `scraper`, `started_at`, `finished_at`, `screening_count`, `error`, `created_at`
- One row per scraper per scrape job — makes failures/zero-result runs queryable for monitoring

`app_user` / `user_identity` / `user_session` tables (see Authentication above):
- `app_user` — `id`, `email`, `name`, `avatar_url`, `created_at`, `updated_at`. No password column: login is OAuth-only. Email is unique **case-insensitively** (`lower(email)` partial index, since an account without a shared email is allowed).
- `user_identity` — `(provider, provider_user_id)` primary key → `user_id`. One row per provider login; this, not the email, is what a sign-in keys on.
- `user_session` — `token_hash` (SHA-256 of the cookie token) primary key, `user_id`, `expires_at`. All three cascade from `app_user`.

**Files**:
- `src/db/connection.ts` - Database connection and config (reads from `.env`)
- `src/db/schema.ts` - TypeScript types for Kysely matching the DB tables
- `src/db/migrate.ts` - Migration runner. Records applied filenames in a `schema_migrations` table and runs each unapplied `migrations/*.sql` file once, in its own transaction (rollback + abort on failure). Existing DBs bootstrap safely because the migrations are idempotent — the first tracked run re-applies and records them, then they never re-run.
- `src/db/repair.ts` - Re-cleans existing titles (shared logic with scrape), then backfills missing TMDB data
- `src/utils/reclean.ts` - Shared re-clean logic used by both scrape and repair
- `src/db/rematch-tmdb.ts` - Re-matches movies whose stored title no longer matches their TMDB record. Passes **no** year to the matcher (the stored year usually came from the match being questioned). Can't catch a wrong film whose title matches — that's what `rematch-by-year` is for
- `src/db/rematch-by-year.ts` - Scrapes the year-publishing venues (VIFF, Park, Rio, Cinematheque), links each screening to its DB movie by `booking_url`, and for any movie whose TMDB release year is more than 2 from the venue's year re-matches it (merging via `mergeMovieInto` if the right film already has a row). Films TMDB has under a different title are listed for a manual fix-match; `--clear-unmatched` drops their TMDB data instead. Dry run by default, `--apply` to write. On prod: `fly ssh console -a movieclock -C "node dist/db/rematch-by-year.js"`
- `src/db/clear.ts` - Deletes all data
- `src/db/drop.ts` - Drops all tables
- Migrations stored in `migrations/*.sql` (still use `IF NOT EXISTS`/`IF EXISTS` so the bootstrap re-apply on existing DBs is safe; `migrate.ts` then tracks them so each runs once going forward)

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

**`screening.datetime` is `timestamptz`** — every screening is stored as a real UTC instant (migration `010`). Scrapers emit absolute `Date`s and the display layer converts to Pacific. The conversion always goes through the IANA zone `America/Vancouver` (never a hardcoded offset), so DST and any future rule change are handled by the platform tz database. The server still runs in UTC on Fly.io, but correctness no longer depends on that — the Pacific helpers extract/produce components via `Intl`, independent of the process timezone.

Two helpers in `src/utils/time.ts` do all the work:

- **`pacificWallClockToInstant(y, m /*1-based*/, d, h, mi, s?)`** — turns a Pacific wall-clock time into the real instant to store. **Any new scraper that learns a screening's local Pacific time must route through this.**
- **`pacificWallClock(instant)`** — projects an instant into a naive `Date` whose *local* components equal its Pacific wall-clock, so display code (`getHours()`, `toLocaleTimeString` without a `timeZone`, the timeline math) reads off Pacific time. Wrap every screening `datetime` with this before formatting it.

`pacificToday()` / `pacificHour()` (the date rail + the 10pm "show tomorrow" flip) are also IANA-based. "Is this screening in the future?" is now a plain `new Date()` comparison against the `timestamptz` column.

How each scraper produces the instant:

- **Rio**: API times carry an offset (`-07:00`), so `new Date(start_time)` is already the correct instant — used as-is.
- **Cineplex**: each session includes `showStartDateTimeUtc` — that UTC field is used directly.
- **VIFF**: API times are local with no offset (`2026-06-13T13:00:00`) → parsed and passed through `pacificWallClockToInstant`.
- **Cinematheque, Park, Hollywood**: parse out date/time components and build the instant via `pacificWallClockToInstant`.

If a new scraper returns times **with** a UTC offset, `new Date(str)` is enough. If it returns **naive local** times, convert them with `pacificWallClockToInstant`.

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

**Search**: `findGatedTMDBMatch()` (`src/utils/tmdb-match.ts`) is the single matcher used by scrape, audit and re-match. It keeps only results whose title matches, drops shorts (<60 min), then — if the scraper supplied a year — keeps the candidates closest to that year within `MAX_YEAR_GAP` (2) and returns **null** if none are that close (rather than an older namesake). Runtime breaks remaining ties. With a year it merges TMDB's year-filtered and unfiltered searches, since `&year=` alone drops films whose TMDB date is a year off the listing.

**Release years**: the year is the main signal for picking between same-titled films, so scrapers should fill `movie.year` when the venue publishes it. Shared helpers live in `src/scrapers/film-years.ts` (`extractCreditsYear` for the "(Director, YEAR / mins / rating)" credits line, `fetchFilmYears` for fetching film pages 5 at a time, best-effort). Current sources: VIFF (film page Year), Park (credits line in the listing description), Rio (credits line on `/movie/` pages; `/event/` pages are live shows), Cinematheque (`ul#details .filmYear` on the film page). Not used: Hollywood (year only in prose) and Cineplex (its `releaseDate` is the Canadian release, so re-releases would carry the re-release year).

**Letterboxd**: `scrape.ts` uses `searchLetterboxdByTmdbId()`, which resolves the canonical film URL via Letterboxd's `/tmdb/{id}/` redirect (Letterboxd sources its catalog from TMDB). Stores the URL or `null` — no sentinel. Only new movies (scrape) and the one-off `backfill-letterboxd.ts` populate it; the regular reclean/repair passes don't retry Letterboxd.

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
6. **Fill `movie.year` if the venue publishes it** (listing, API, or film detail page) — see Release years under TMDB Integration
7. **Convert to global models**: Map API data to `Screening[]`

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
  - The API has no release year, so it also fetches each film's "More Info" page (the stored `bookingUrl`) and reads the Year from the details sidebar (`extractFilmYear`) — see Release years below

- **`rio-scraper.ts`** - Rio Theatre
  - API: `https://riotheatre.ca/wp-json/barker/v1/listings`
  - WordPress custom plugin endpoint
  - Clean JSON with `tickets_link` for booking URLs
  - Date range: 1 month back, 2 months forward
  - The API has no release year, so it also fetches each `/movie/…` page (`event.link`; `/event/…` pages are live shows and are skipped) and reads the year from the credits line, e.g. `(Matt Johnson, 2026 / 106 mins / 14A)`, via `extractCreditsYear`. Screenings map 1:1 to events, so years are applied by index
  - **Note**: `start_time` carries a UTC offset, so `new Date(start_time)` is the correct instant (see Timezone Handling)

- **`cineplex-scraper.ts`** - Cineplex Theatres (Fifth Avenue, International Village, Scotiabank, Langley)
  - API: `https://apis.cineplex.com/prod/cpx/theatrical/api/v1/showtimes?language=en&locationId={theatreId}&date={M/D/YYYY}`
  - Azure API Management endpoint, requires header: `ocp-apim-subscription-key: 477f072109904a55927ba2c3bf9f77e3` (public key embedded in cineplex.com frontend)
  - Returns movies with sessions (showtimes) per theatre per day; fetches 7 days
  - Each session carries `showStartDateTimeUtc` (a UTC instant) — used directly as the screening time
  - Theatre name format: `"{venue} {auditorium}"` e.g. `"Fifth Ave Aud #3"`, `"Intl Village Aud 05"`
  - Uses `deeplinkUrl` for booking URLs
  - No year: the showtimes API has none, and the detail page's `releaseDate` is the Canadian release (a re-release would carry the re-release year), so it's deliberately not used
  - **To find theatre IDs**: `GET https://apis.cineplex.com/prod/cpx/theatrical/api/v1/theatres?language=en&city=Vancouver&latitude=49.2514&longitude=-123.0972` (same API key header). Returns `theatreId` and `theatreName` for nearby theatres. This is not used by the scraper but is useful for adding new Cineplex locations.

- **`hollywood-scraper.ts`** - Hollywood Theatre
  - Uses cheerio to scrape event pages
  - Crawls individual event detail pages with a delay between requests
  - No year: it only appears in prose ("John Landis' 1980 comedy classic"), too unreliable to parse

**Puppeteer-Based** (slower, more brittle):
- **`cinematheque-scraper.ts`** - Cinematheque
  - URL: `https://thecinematheque.ca/films/calendar`
  - Custom PHP application, no API available
  - Scrapes `#eventCalendar` DOM structure
  - The calendar has no release year, so it fetches each film page (the stored `bookingUrl`; plain `fetch`, no Puppeteer) and reads the first `span.filmYear` inside `ul#details` (`extractCinemathequeYear`) — the headline film on a double bill. The `/films/2026/…` in the URL is the programme year, not the film's

- **`park-scraper.ts`** - Park Theatre
  - URL: `https://tickets.theparktheatre.ca/`
  - Igniter ticketing system, no API available
  - Scrapes event listings from HTML
  - Year comes from the listing itself: each `div.event-description` (clamped behind "show more", but fully in the DOM) ends with a credits line like `TONY (Matt Johnson, 2026 / 106 mins / 14A)`, parsed with `extractCreditsYear`. No extra requests. Events without a credits line (live shows, fundraisers) get no year

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

### Step 3: Add the venue to the config

Add a `Location` to `LOCATIONS` in `src/venues.ts` with its `name`, `grouping`, and `auditoriums` (each `theatreName` matching exactly what the scraper emits). `THEATRE_ORDER`, the timeline grouping, and the listing cards all derive from it — no other files to touch.

- A single-screen venue is one `Location` with one auditorium and `grouping: 'collapse'`.
- A multi-screen venue you want shown as **separate** cards (like VIFF) uses `grouping: 'separate'` and lists each auditorium.
- A multi-screen venue you want **pooled** into one card (like Cineplex) uses `grouping: 'collapse'` plus a `prefix`, so its auditoriums collapse together and new screens resolve automatically.

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
GOOGLE_CLIENT_ID=...            # Optional — Google OAuth login; omit either half and sign-in is simply absent
GOOGLE_CLIENT_SECRET=...
BASE_URL=...                    # Optional — public origin, used for OAuth redirect URIs + sitemap.
                                # Defaults to http://localhost:3000 outside production, https://movieclock.app in it.
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

**"Neon Night / Glass"** design system (dark mode). All styling is driven by CSS custom properties on `:root` in `public/css/global.css` — themes are intended to be swappable token blocks. Fonts: **Space Grotesk** (display) + **Inter** (body), self-hosted as variable woff2 files in `public/fonts/` (`@font-face` blocks at the top of `global.css`; latin + latin-ext subsets, originally from Google Fonts). Frosted-glass cards (`backdrop-filter: blur`), violet→cyan gradient accent.

Core tokens (`public/css/global.css`):
- Background: `--bg: #0a0a14` (deep indigo)
- Glass surfaces: `--glass: rgba(255,255,255,.045)`, `--glass2: rgba(255,255,255,.07)`
- Text: `--ink: #eef0ff`; muted: `--muted: #9a9ec2`; faint: `--faint: #646891`
- Borders/lines: `--line: rgba(255,255,255,.09)`
- Accent: `--violet: #8b5cf6`, `--cyan: #22d3ee`, `--pink: #f472b6` (notes), gradient `--grad: linear-gradient(100deg,#8b5cf6,#22d3ee)`
- Radii: `--radius-card: 20px`, `--radius-chip: 999px`

Per-page CSS lives in `public/css/{global,index,movie,movies,theatre,theatre-card,tmdb-modal,login}.css` (the nav's account control lives in `global.css` with the rest of the top bar). Favicon is `public/favicon.svg` (+ `.png` fallback) matching the gradient. The three earlier design explorations are kept under `design-prototypes/` (reference only, not wired in) as seeds for a future theme switcher.

**Note**: `/internal-movies` is intentionally left on the old teal styling and was not redesigned.
