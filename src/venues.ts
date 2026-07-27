// Venue configuration — the single source of truth for the cinemas we track.
//
// This is application configuration, not data: locations and their auditoriums
// change rarely and are known at build time, so they live here as constants
// rather than in the database. Screenings carry a free-text `theatre_name`
// (whatever the scraper emitted); everything else — display order, listing
// grouping, labels — is derived from this file.
//
// Model:
//   - A Location is a physical cinema (The Rio, VIFF Centre, a Cineplex site).
//   - A Location has one or more Auditoriums; a screening belongs to one
//     auditorium, matched by its `theatreName` (the scraper's string).
//   - grouping controls how the Location appears in the listing view:
//       'collapse' — one card for the whole location, auditoriums pooled
//                    (every Cineplex site; also the single-screen indies).
//       'separate' — each auditorium is its own card (VIFF Cinema and VIFF
//                    Lochmaddy are two rooms of VIFF Centre shown separately).

import type { ScreeningWithMovie, ListingGroup } from './pages/index.js';

export type Grouping = 'collapse' | 'separate';

export interface Auditorium {
  /** The exact `theatre_name` a scraper emits — the join key to a screening. */
  theatreName: string;
  /** Listing/label override (e.g. 'VIFF Lochmaddy'); defaults to `theatreName`. */
  shortName?: string;
  /**
   * Other `theatre_name`s the same room gets scraped under, because a venue can
   * be listed by more than one source (VIFF presents at the Rio and calls it
   * 'The Rio Theatre'). Aliases resolve to this auditorium everywhere — grouping,
   * labels, and the visitor's venue filter — so one room is never two venues.
   */
  aliases?: string[];
}

export interface Location {
  /** Display name for the location (the listing card label when collapsed). */
  name: string;
  grouping: Grouping;
  auditoriums: Auditorium[];
  /**
   * Cineplex sites add and drop auditoriums over time. When set, any
   * `theatre_name` starting with this prefix belongs to this location even if
   * it isn't enumerated above — so a new "Aud #6" still pools into the right
   * card without a code change. Also drives the client-side timeline grouping.
   */
  prefix?: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
const aud = (theatreName: string): Auditorium => ({ theatreName });

export const LOCATIONS: Location[] = [
  {
    name: 'VIFF Centre',
    grouping: 'separate',
    auditoriums: [
      aud('VIFF Cinema'),
      { theatreName: 'VIFF Lochmaddy Studio', shortName: 'VIFF Lochmaddy' },
    ],
  },
  { name: 'The Cinematheque', grouping: 'collapse', auditoriums: [aud('The Cinematheque')] },
  { name: 'The Park', grouping: 'collapse', auditoriums: [aud('The Park')] },
  {
    name: 'The Rio',
    grouping: 'collapse',
    // VIFF's calendar lists Rio screenings as 'The Rio Theatre'.
    auditoriums: [{ theatreName: 'The Rio', aliases: ['The Rio Theatre'] }],
  },
  { name: 'Hollywood Theatre', grouping: 'collapse', auditoriums: [aud('Hollywood Theatre')] },
  {
    name: 'Fifth Avenue',
    grouping: 'collapse',
    prefix: 'Fifth Ave',
    auditoriums: range(1, 5).map((n) => aud(`Fifth Ave Aud #${n}`)),
  },
  {
    name: 'International Village',
    grouping: 'collapse',
    prefix: 'Intl Village',
    auditoriums: range(1, 12).map((n) => aud(`Intl Village Aud ${pad2(n)}`)),
  },
  {
    name: 'Scotiabank',
    grouping: 'collapse',
    prefix: 'Scotiabank',
    auditoriums: [
      aud('Scotiabank IMAX #1'),
      aud('Scotiabank AVX #2'),
      ...range(3, 9).map((n) => aud(`Scotiabank Aud ${pad2(n)}`)),
    ],
  },
  {
    name: 'Langley',
    grouping: 'collapse',
    prefix: 'Langley',
    auditoriums: [
      aud('Langley Cinema 1 (UltraAVX)'),
      ...range(2, 18).map((n) => aud(`Langley Cinema ${n}`)),
      aud('Langley IMAX'),
    ],
  },
];

// --- derived lookups -------------------------------------------------------

/** Every `theatre_name` that resolves to this auditorium (canonical first). */
const auditoriumNames = (a: Auditorium): string[] => [a.theatreName, ...(a.aliases ?? [])];

// Flattened auditorium names in display order — drives the timeline rows and
// the fixed theatre order on the home page. Canonical names only: aliases are
// folded into their canonical row by `canonicalTheatreName`.
export const THEATRE_ORDER: string[] = LOCATIONS.flatMap((l) =>
  l.auditoriums.map((a) => a.theatreName),
);

/**
 * The unit the visitor filters by ("hide The Rio") — the same thing a home-page
 * listing card / chip represents, which is *not* always a location:
 *   - grouping 'separate' → one filter per auditorium (VIFF's two rooms)
 *   - grouping 'collapse' → one filter for the whole location (Cineplex, indies)
 *
 * `key` is the string persisted in the visitor's `hiddenTheatres` localStorage
 * list, so it must stay stable. It is deliberately identical to the listing
 * group's `venue` (see `buildDayListingGroups`) — that identity is what makes
 * the home-page chips write keys that every other page can read back.
 */
export interface VenueFilter {
  key: string;
  label: string;
  /** The `theatre_name`s this filter covers. */
  theatreNames: string[];
  /** Cineplex catch-all: any `theatre_name` starting with this also matches. */
  prefix?: string;
}

// Every filterable venue, in LOCATIONS order. Shipped to the client as a JSON
// island (`#venueFilters`) and consumed by public/js/venue-filter.js — the one
// place that decides whether a screening is hidden.
export const VENUE_FILTERS: VenueFilter[] = LOCATIONS.flatMap((l) =>
  l.grouping === 'separate'
    ? l.auditoriums.map((a) => ({
        key: a.theatreName,
        label: a.shortName ?? a.theatreName,
        theatreNames: auditoriumNames(a),
      }))
    : [
        {
          key: l.name,
          label: l.name,
          theatreNames: l.auditoriums.flatMap(auditoriumNames),
          ...(l.prefix ? { prefix: l.prefix } : {}),
        },
      ],
);

const venueFilterByTheatre = new Map<string, VenueFilter>();
for (const f of VENUE_FILTERS) {
  for (const name of f.theatreNames) venueFilterByTheatre.set(name, f);
}

/**
 * The payload public/js/venue-filter.js runs on (shipped as the `#venueFilters`
 * JSON island). `aliases` maps every alias to its canonical `theatre_name` so
 * the client can collapse the two before matching, exactly as the server does.
 */
export const VENUE_FILTER_CONFIG = {
  filters: VENUE_FILTERS,
  aliases: Object.fromEntries(
    LOCATIONS.flatMap((l) =>
      l.auditoriums.flatMap((a) => (a.aliases ?? []).map((alias) => [alias, a.theatreName])),
    ),
  ) as Record<string, string>,
};

/**
 * The filter a `theatre_name` belongs to (exact match, then Cineplex prefix).
 * Falls back to the raw name so an unknown venue is still filterable by itself.
 */
export function venueFilterKey(theatreName: string): string {
  const exact = venueFilterByTheatre.get(theatreName);
  if (exact) return exact.key;
  return (
    VENUE_FILTERS.find((f) => f.prefix && theatreName.startsWith(f.prefix))?.key ?? theatreName
  );
}

// Curated venue links for the site footer (internal linking / crawl paths): the
// indie & repertory cinemas, which each have a clean single /theatre/ page.
// Cineplex multiplexes (prefix locations) are omitted — their per-auditorium
// pages are already in the sitemap and aren't useful footer links.
export const FOOTER_VENUES: { label: string; theatreName: string }[] = LOCATIONS.filter(
  (l) => !l.prefix,
).flatMap((l) =>
  l.auditoriums.map((a) => ({ label: a.shortName ?? a.theatreName, theatreName: a.theatreName })),
);

const auditoriumByName = new Map<string, { location: Location; auditorium: Auditorium }>();
for (const location of LOCATIONS) {
  for (const auditorium of location.auditoriums) {
    for (const name of auditoriumNames(auditorium)) {
      auditoriumByName.set(name, { location, auditorium });
    }
  }
}

/**
 * The canonical `theatre_name` for a scraped one — resolves aliases, and is the
 * identity anything grouping by theatre should key on. Unknown names pass
 * through unchanged (they still get their own row/card, see
 * `buildDayListingGroups`).
 */
export function canonicalTheatreName(theatreName: string): string {
  return auditoriumByName.get(theatreName)?.auditorium.theatreName ?? theatreName;
}

/** Every `theatre_name` a screening in this room could be stored under. */
export function theatreNamesFor(theatreName: string): string[] {
  const entry = auditoriumByName.get(theatreName);
  return entry ? auditoriumNames(entry.auditorium) : [theatreName];
}

/** The location a `theatre_name` belongs to (exact match, then Cineplex prefix). */
export function locationForTheatre(theatreName: string): Location | undefined {
  const exact = auditoriumByName.get(theatreName);
  if (exact) return exact.location;
  return LOCATIONS.find((l) => l.prefix && theatreName.startsWith(l.prefix));
}

/**
 * Per-auditorium label for timeline rows (applies `shortName` overrides, and
 * resolves an alias to the room's real name rather than echoing the alias).
 */
export function auditoriumLabel(theatreName: string): string {
  const entry = auditoriumByName.get(theatreName);
  if (!entry) return theatreName;
  return entry.auditorium.shortName ?? entry.auditorium.theatreName;
}

/**
 * Listing label + optional theatre-page link for a `theatre_name`. Cineplex
 * auditoriums collapse under their location name with no link (the page is
 * per-auditorium); everything else links to its own theatre page.
 */
export function venueGroup(theatreName: string): { name: string; theatreLink: string | null } {
  const location = locationForTheatre(theatreName);
  if (location?.grouping === 'collapse' && location.prefix) {
    return { name: location.name, theatreLink: null };
  }
  return { name: auditoriumLabel(theatreName), theatreLink: canonicalTheatreName(theatreName) };
}

// --- listing groups --------------------------------------------------------

// Build a listing group from screenings: group by movie, dedupe showtimes.
//
// Each showtime keeps the `theatre_name`s it plays in, because a collapsed card
// pools a location's auditoriums and the visitor may have hidden only some of
// them. Two screens at the same time still dedupe to one button — one that only
// disappears when *both* auditoriums are hidden.
export function buildListingGroup(
  venue: string,
  screenings: ScreeningWithMovie[],
  sortByTime = false,
): ListingGroup {
  const movieMap = new Map<
    number,
    {
      movie_id: number;
      movie_title: string;
      movie_year: number | null;
      movie_runtime: number | null;
      poster_url: string | null;
      letterboxd_url: string | null;
      tmdb_url: string | null;
      showtimes: Map<number, { datetime: Date; booking_url: string; theatreNames: Set<string> }>;
    }
  >();
  for (const s of screenings) {
    let movie = movieMap.get(s.movie_id);
    if (!movie) {
      movie = {
        movie_id: s.movie_id,
        movie_title: s.movie_title,
        movie_year: s.movie_year,
        movie_runtime: s.movie_runtime,
        poster_url: s.poster_url,
        letterboxd_url: s.letterboxd_url,
        tmdb_url: s.tmdb_url,
        showtimes: new Map(),
      };
      movieMap.set(s.movie_id, movie);
    }
    const timeKey = new Date(s.datetime).getTime();
    const existing = movie.showtimes.get(timeKey);
    if (existing) existing.theatreNames.add(s.theatre_name);
    else {
      movie.showtimes.set(timeKey, {
        datetime: new Date(s.datetime),
        booking_url: s.booking_url,
        theatreNames: new Set([s.theatre_name]),
      });
    }
  }
  return {
    venue,
    movies: Array.from(movieMap.values())
      .map((m) => ({
        movie_id: m.movie_id,
        movie_title: m.movie_title,
        movie_year: m.movie_year,
        movie_runtime: m.movie_runtime,
        poster_url: m.poster_url,
        letterboxd_url: m.letterboxd_url,
        tmdb_url: m.tmdb_url,
        showtimes: Array.from(m.showtimes.values())
          .sort((a, b) => a.datetime.getTime() - b.datetime.getTime())
          .map((st) => ({
            datetime: st.datetime,
            booking_url: st.booking_url,
            theatreNames: Array.from(st.theatreNames),
          })),
      }))
      .sort(
        sortByTime
          ? (a, b) => a.showtimes[0].datetime.getTime() - b.showtimes[0].datetime.getTime()
          : (a, b) => a.movie_title.localeCompare(b.movie_title),
      ),
  };
}

/**
 * Build the home page's listing groups for one day's screenings (already
 * grouped by `theatre_name`), honoring each location's grouping mode:
 *   - separate          → one group per auditorium, linked to its theatre page
 *   - collapse (Cineplex) → one pooled group per location, no link
 *   - collapse (single)  → one group for the location, linked
 *
 * Every group's `venue` is a VenueFilter key, because these groups are what the
 * home page renders its filter chips from. Anything left over after the
 * configured locations gets its own trailing group rather than being dropped —
 * an unknown venue must still be visible, and hideable, without a config change.
 */
export function buildDayListingGroups(
  theatreMap: Map<string, ScreeningWithMovie[]>,
): ListingGroup[] {
  const groups: ListingGroup[] = [];
  const unclaimed = new Map<string, ScreeningWithMovie[]>();
  for (const [theatreName, screenings] of theatreMap) {
    if (screenings.length === 0) continue;
    const canonical = canonicalTheatreName(theatreName);
    const bucket = unclaimed.get(canonical);
    if (bucket) bucket.push(...screenings);
    else unclaimed.set(canonical, [...screenings]);
  }
  const claim = (theatreName: string): ScreeningWithMovie[] => {
    const screenings = unclaimed.get(theatreName) ?? [];
    unclaimed.delete(theatreName);
    return screenings;
  };

  for (const loc of LOCATIONS) {
    if (loc.grouping === 'separate') {
      for (const a of loc.auditoriums) {
        const screenings = claim(a.theatreName);
        if (screenings.length === 0) continue;
        const group = buildListingGroup(a.theatreName, screenings, true);
        group.theatreName = a.theatreName;
        groups.push(group);
      }
      continue;
    }

    // collapse: pool the location's auditoriums (plus any prefix-matching ones
    // not explicitly enumerated, e.g. a newly added Cineplex screen).
    const pooled: ScreeningWithMovie[] = [];
    for (const a of loc.auditoriums) pooled.push(...claim(a.theatreName));
    if (loc.prefix) {
      for (const theatreName of [...unclaimed.keys()]) {
        if (theatreName.startsWith(loc.prefix)) pooled.push(...claim(theatreName));
      }
    }
    if (pooled.length === 0) continue;

    // A single-screen location (no prefix) links to its one theatre page and
    // sorts by showtime; a pooled Cineplex site has no link and sorts by title.
    const single = !loc.prefix && loc.auditoriums.length === 1;
    const group = buildListingGroup(loc.name, pooled, single);
    if (single) group.theatreName = loc.auditoriums[0].theatreName;
    groups.push(group);
  }

  // Venues we have no config for (e.g. VIFF's off-site partner rooms). Each is
  // its own card, keyed by its raw name — which is also its VenueFilter key.
  for (const theatreName of [...unclaimed.keys()].sort()) {
    const group = buildListingGroup(theatreName, claim(theatreName), true);
    group.theatreName = theatreName;
    groups.push(group);
  }

  return groups;
}
