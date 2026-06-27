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
  { name: 'The Rio', grouping: 'collapse', auditoriums: [aud('The Rio')] },
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

// Flattened auditorium names in display order — drives the timeline rows and
// the fixed theatre order on the home page.
export const THEATRE_ORDER: string[] = LOCATIONS.flatMap((l) =>
  l.auditoriums.map((a) => a.theatreName),
);

// The collapse-by-prefix (Cineplex) locations, in the shape the client-side
// timeline script and the listing builder consume.
export const CINEPLEX_VENUES: { display: string; prefix: string }[] = LOCATIONS.filter(
  (l) => l.prefix,
).map((l) => ({ display: l.name, prefix: l.prefix! }));

const auditoriumByName = new Map<string, { location: Location; auditorium: Auditorium }>();
for (const location of LOCATIONS) {
  for (const auditorium of location.auditoriums) {
    auditoriumByName.set(auditorium.theatreName, { location, auditorium });
  }
}

/** The location a `theatre_name` belongs to (exact match, then Cineplex prefix). */
export function locationForTheatre(theatreName: string): Location | undefined {
  const exact = auditoriumByName.get(theatreName);
  if (exact) return exact.location;
  return LOCATIONS.find((l) => l.prefix && theatreName.startsWith(l.prefix));
}

/** Per-auditorium label for timeline rows (applies `shortName` overrides). */
export function auditoriumLabel(theatreName: string): string {
  return auditoriumByName.get(theatreName)?.auditorium.shortName ?? theatreName;
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
  return { name: auditoriumLabel(theatreName), theatreLink: theatreName };
}

// --- listing groups --------------------------------------------------------

// Build a listing group from screenings: group by movie, dedupe showtimes.
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
      showtimes: Map<number, { datetime: Date; booking_url: string }>;
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
    if (!movie.showtimes.has(timeKey)) {
      movie.showtimes.set(timeKey, { datetime: new Date(s.datetime), booking_url: s.booking_url });
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
        showtimes: Array.from(m.showtimes.values()).sort(
          (a, b) => a.datetime.getTime() - b.datetime.getTime(),
        ),
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
 */
export function buildDayListingGroups(
  theatreMap: Map<string, ScreeningWithMovie[]>,
): ListingGroup[] {
  const groups: ListingGroup[] = [];

  for (const loc of LOCATIONS) {
    if (loc.grouping === 'separate') {
      for (const a of loc.auditoriums) {
        const screenings = theatreMap.get(a.theatreName) ?? [];
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
    for (const a of loc.auditoriums) {
      const screenings = theatreMap.get(a.theatreName);
      if (screenings) pooled.push(...screenings);
    }
    if (loc.prefix) {
      for (const [theatreName, screenings] of theatreMap) {
        if (theatreName.startsWith(loc.prefix) && !auditoriumByName.has(theatreName)) {
          pooled.push(...screenings);
        }
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

  return groups;
}
