import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THEATRE_ORDER,
  CINEPLEX_VENUES,
  auditoriumLabel,
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

test('CINEPLEX_VENUES are the four prefix locations', () => {
  assert.deepEqual(CINEPLEX_VENUES, [
    { display: 'Fifth Avenue', prefix: 'Fifth Ave' },
    { display: 'International Village', prefix: 'Intl Village' },
    { display: 'Scotiabank', prefix: 'Scotiabank' },
    { display: 'Langley', prefix: 'Langley' },
  ]);
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

test('buildDayListingGroups: a Cineplex screen not in config still pools by prefix', () => {
  const groups = buildDayListingGroups(
    mapOf(screening('Fifth Ave Aud #9', 7, '2026-06-26T19:00:00')),
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].venue, 'Fifth Avenue');
  assert.equal(groups[0].movies[0].movie_id, 7);
});
