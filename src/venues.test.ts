import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THEATRE_ORDER,
  VENUE_FILTERS,
  venueFilterKey,
  auditoriumLabel,
  canonicalTheatreName,
  theatreNamesFor,
  locationForTheatre,
  venueGroup,
  buildDayListingGroups,
} from './venues.js';
import type { ScreeningWithMovie } from './pages/index.js';

function screening(theatre_name: string, movie_id: number, iso: string): ScreeningWithMovie {
  return {
    screening_id: movie_id * 1000 + new Date(iso).getHours(),
    datetime: new Date(iso),
    theatre_name,
    booking_url: 'https://example.com/book',
    movie_id,
    movie_title: `Movie ${movie_id}`,
    movie_year: 2026,
    movie_runtime: 100,
    poster_url: null,
    tmdb_url: null,
    letterboxd_url: null,
  };
}

function mapOf(...screenings: ScreeningWithMovie[]): Map<string, ScreeningWithMovie[]> {
  const m = new Map<string, ScreeningWithMovie[]>();
  for (const s of screenings) {
    if (!m.has(s.theatre_name)) m.set(s.theatre_name, []);
    m.get(s.theatre_name)!.push(s);
  }
  return m;
}

test('THEATRE_ORDER flattens all auditoriums in display order', () => {
  assert.equal(THEATRE_ORDER.length, 51);
  assert.equal(THEATRE_ORDER[0], 'VIFF Cinema');
  assert.equal(THEATRE_ORDER[1], 'VIFF Lochmaddy Studio');
  assert.equal(THEATRE_ORDER.at(-1), 'Langley IMAX');
  assert.ok(THEATRE_ORDER.includes('Fifth Ave Aud #5'));
  assert.ok(THEATRE_ORDER.includes('Scotiabank AVX #2'));
});

test('VENUE_FILTERS: one per auditorium when separate, one per location when collapsed', () => {
  assert.deepEqual(
    VENUE_FILTERS.map((f) => f.key),
    [
      'VIFF Cinema',
      'VIFF Lochmaddy Studio',
      'The Cinematheque',
      'The Park',
      'The Rio',
      'Hollywood Theatre',
      'Fifth Avenue',
      'International Village',
      'Scotiabank',
      'Langley',
    ],
  );
  // Labels apply shortName overrides; only Cineplex locations carry a prefix.
  assert.equal(VENUE_FILTERS[1].label, 'VIFF Lochmaddy');
  assert.deepEqual(VENUE_FILTERS[1].theatreNames, ['VIFF Lochmaddy Studio']);
  assert.equal(VENUE_FILTERS[1].prefix, undefined);
  assert.equal(VENUE_FILTERS[6].prefix, 'Fifth Ave');
  assert.ok(VENUE_FILTERS[6].theatreNames.includes('Fifth Ave Aud #3'));
});

test('venueFilterKey resolves exact names, Cineplex prefixes, and unknowns', () => {
  assert.equal(venueFilterKey('The Rio'), 'The Rio');
  assert.equal(venueFilterKey('VIFF Lochmaddy Studio'), 'VIFF Lochmaddy Studio');
  assert.equal(venueFilterKey('Fifth Ave Aud #3'), 'Fifth Avenue');
  // A screen not enumerated in config still resolves by prefix.
  assert.equal(venueFilterKey('Fifth Ave Aud #6'), 'Fifth Avenue');
  // An unknown venue is filterable by its own name rather than silently unmatched.
  assert.equal(venueFilterKey('Unknown Theatre'), 'Unknown Theatre');
});

// The home page's chips are rendered from listing groups and write `venue` into
// the visitor's hiddenTheatres list; every other page matches those strings via
// venueFilterKey. If this identity ever breaks, hiding a venue on the home page
// silently stops working everywhere else.
test('every listing group venue is a valid VenueFilter key', () => {
  const keys = new Set(VENUE_FILTERS.map((f) => f.key));
  const groups = buildDayListingGroups(
    mapOf(
      screening('VIFF Cinema', 1, '2026-06-26T19:00:00'),
      screening('VIFF Lochmaddy Studio', 2, '2026-06-26T20:00:00'),
      screening('The Cinematheque', 3, '2026-06-26T18:00:00'),
      screening('The Park', 4, '2026-06-26T18:00:00'),
      screening('The Rio', 5, '2026-06-26T18:00:00'),
      screening('Hollywood Theatre', 6, '2026-06-26T18:00:00'),
      screening('Fifth Ave Aud #1', 7, '2026-06-26T17:00:00'),
      screening('Intl Village Aud 05', 8, '2026-06-26T17:00:00'),
      screening('Scotiabank IMAX #1', 9, '2026-06-26T17:00:00'),
      screening('Langley IMAX', 10, '2026-06-26T17:00:00'),
    ),
  );
  assert.equal(groups.length, VENUE_FILTERS.length);
  for (const g of groups) assert.ok(keys.has(g.venue), `${g.venue} is not a filter key`);
});

test('auditoriumLabel applies shortName overrides only', () => {
  assert.equal(auditoriumLabel('VIFF Lochmaddy Studio'), 'VIFF Lochmaddy');
  assert.equal(auditoriumLabel('VIFF Cinema'), 'VIFF Cinema');
  assert.equal(auditoriumLabel('The Rio'), 'The Rio');
  assert.equal(auditoriumLabel('Fifth Ave Aud #3'), 'Fifth Ave Aud #3');
});

test('locationForTheatre resolves exact names and Cineplex prefixes (incl. unlisted auds)', () => {
  assert.equal(locationForTheatre('The Rio')?.name, 'The Rio');
  assert.equal(locationForTheatre('VIFF Lochmaddy Studio')?.name, 'VIFF Centre');
  assert.equal(locationForTheatre('Fifth Ave Aud #3')?.name, 'Fifth Avenue');
  // A screen not enumerated in config still resolves by prefix.
  assert.equal(locationForTheatre('Fifth Ave Aud #6')?.name, 'Fifth Avenue');
  assert.equal(locationForTheatre('Unknown Theatre'), undefined);
});

test('venueGroup: Cineplex collapses with no link, others link to their theatre', () => {
  assert.deepEqual(venueGroup('Fifth Ave Aud #3'), { name: 'Fifth Avenue', theatreLink: null });
  assert.deepEqual(venueGroup('The Rio'), { name: 'The Rio', theatreLink: 'The Rio' });
  assert.deepEqual(venueGroup('VIFF Lochmaddy Studio'), {
    name: 'VIFF Lochmaddy',
    theatreLink: 'VIFF Lochmaddy Studio',
  });
});

test('buildDayListingGroups: VIFF separate, Cineplex pooled, indie single', () => {
  const groups = buildDayListingGroups(
    mapOf(
      screening('VIFF Cinema', 1, '2026-06-26T19:00:00'),
      screening('VIFF Lochmaddy Studio', 2, '2026-06-26T20:00:00'),
      screening('The Rio', 3, '2026-06-26T18:00:00'),
      screening('Fifth Ave Aud #1', 4, '2026-06-26T17:00:00'),
      screening('Fifth Ave Aud #2', 5, '2026-06-26T21:00:00'),
    ),
  );

  // Order follows LOCATIONS: the two VIFF auditoriums (separate), then The Rio,
  // then one pooled Fifth Avenue card.
  assert.deepEqual(
    groups.map((g) => g.venue),
    ['VIFF Cinema', 'VIFF Lochmaddy Studio', 'The Rio', 'Fifth Avenue'],
  );

  // VIFF + indie groups link to their theatre page; the pooled Cineplex one does not.
  assert.equal(groups[0].theatreName, 'VIFF Cinema');
  assert.equal(groups[2].theatreName, 'The Rio');
  assert.equal(groups[3].theatreName, undefined);

  // Fifth Avenue pools both auditoriums' movies into one card.
  assert.deepEqual(groups[3].movies.map((m) => m.movie_id).sort(), [4, 5]);
});

// A collapsed card pools a location's auditoriums, so the client needs to know
// which screen each showtime is in — otherwise hiding one screen is invisible in
// the listing (it only ever worked on the timeline).
test('buildListingGroup: showtimes carry their auditorium(s)', () => {
  const groups = buildDayListingGroups(
    mapOf(
      screening('Fifth Ave Aud #1', 1, '2026-06-26T17:00:00'),
      screening('Fifth Ave Aud #3', 1, '2026-06-26T19:00:00'),
    ),
  );
  const showtimes = groups[0].movies[0].showtimes;
  assert.deepEqual(
    showtimes.map((st) => st.theatreNames),
    [['Fifth Ave Aud #1'], ['Fifth Ave Aud #3']],
  );
});

// Two screens at the same time dedupe to one button — which must survive until
// both are hidden, so it has to carry both names.
test('buildListingGroup: a deduped showtime keeps every auditorium behind it', () => {
  const groups = buildDayListingGroups(
    mapOf(
      screening('Fifth Ave Aud #1', 1, '2026-06-26T19:00:00'),
      screening('Fifth Ave Aud #3', 1, '2026-06-26T19:00:00'),
    ),
  );
  const showtimes = groups[0].movies[0].showtimes;
  assert.equal(showtimes.length, 1);
  assert.deepEqual(showtimes[0].theatreNames.sort(), ['Fifth Ave Aud #1', 'Fifth Ave Aud #3']);
});

// VIFF lists Rio screenings as 'The Rio Theatre'. Left unaliased that is a
// second, unfilterable venue: hiding 'The Rio' would leave those screenings
// showing on movie pages while the toggle claimed things were hidden.
test('an alias resolves to its room everywhere', () => {
  assert.equal(canonicalTheatreName('The Rio Theatre'), 'The Rio');
  assert.equal(canonicalTheatreName('The Rio'), 'The Rio');
  assert.equal(canonicalTheatreName('Some New Venue'), 'Some New Venue');
  assert.deepEqual(theatreNamesFor('The Rio'), ['The Rio', 'The Rio Theatre']);
  assert.deepEqual(theatreNamesFor('Some New Venue'), ['Some New Venue']);
  assert.equal(auditoriumLabel('The Rio Theatre'), 'The Rio');
  assert.equal(locationForTheatre('The Rio Theatre')?.name, 'The Rio');
  assert.deepEqual(venueGroup('The Rio Theatre'), { name: 'The Rio', theatreLink: 'The Rio' });
  // The filter key is what the client matches on — both names must map to it.
  assert.equal(venueFilterKey('The Rio Theatre'), 'The Rio');
  assert.ok(
    VENUE_FILTERS.find((f) => f.key === 'The Rio')?.theatreNames.includes('The Rio Theatre'),
  );
  // THEATRE_ORDER stays canonical, so the timeline shows one Rio row.
  assert.equal(THEATRE_ORDER.filter((t) => t.startsWith('The Rio')).length, 1);
});

test('buildDayListingGroups: aliases pool into their room', () => {
  const groups = buildDayListingGroups(
    mapOf(
      screening('The Rio', 1, '2026-06-26T18:00:00'),
      screening('The Rio Theatre', 2, '2026-06-26T21:00:00'),
    ),
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].venue, 'The Rio');
  assert.deepEqual(groups[0].movies.map((m) => m.movie_id).sort(), [1, 2]);
});

// Anything we have no config for used to be dropped from the home page
// entirely — invisible, and so impossible to filter.
test('buildDayListingGroups: an unconfigured venue gets its own trailing group', () => {
  const groups = buildDayListingGroups(
    mapOf(
      screening('The Pearl', 1, '2026-06-26T19:00:00'),
      screening('The Rio', 2, '2026-06-26T18:00:00'),
      screening('Chan Centre', 3, '2026-06-26T20:00:00'),
    ),
  );
  assert.deepEqual(
    groups.map((g) => g.venue),
    ['The Rio', 'Chan Centre', 'The Pearl'],
  );
  // Its own name is its filter key, so the chip it renders can hide it.
  assert.equal(venueFilterKey('The Pearl'), 'The Pearl');
  assert.equal(groups[1].theatreName, 'Chan Centre');
});

test('buildDayListingGroups: a Cineplex screen not in config still pools by prefix', () => {
  const groups = buildDayListingGroups(
    mapOf(screening('Fifth Ave Aud #9', 7, '2026-06-26T19:00:00')),
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].venue, 'Fifth Avenue');
  assert.equal(groups[0].movies[0].movie_id, 7);
});
