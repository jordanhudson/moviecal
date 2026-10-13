import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractFilmYear,
  extractRestNonce,
  parseVIFFEvents,
  VIFFApiEvent,
} from './viff-scraper.js';
import { parseRioEvents, RioApiEvent } from './rio-scraper.js';
import { extractCinemathequeYear } from './cinematheque-scraper.js';
import { extractCreditsYear } from './film-years.js';
import {
  parseCineplexResponses,
  dedupeScreenings,
  CineplexTheatreResponse,
} from './cineplex-scraper.js';

// Real API responses saved as fixtures (June 2026). If a venue changes its
// response format, re-capture the fixture and update the expectations here.
function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

test('VIFF: parses screenings out of the calendar API HTML payload', () => {
  const events = loadFixture<VIFFApiEvent[]>('viff-events.json');
  const screenings = parseVIFFEvents(events);

  assert.equal(screenings.length, 4);

  const first = screenings[0];
  assert.equal(first.movie.title, 'Alipato At Muog');
  assert.equal(first.note, 'Flying Embers & A Fortress');
  assert.equal(first.theatreName, 'VIFF Cinema');
  assert.equal(first.bookingUrl, 'https://viff.org/whats-on/alipato-at-muog/');
  // "2026-06-13T13:00:00" has no offset → 1pm Pacific (PDT, −07) → 20:00 UTC
  assert.equal(first.datetime.toISOString(), '2026-06-13T20:00:00.000Z');
  assert.equal(first.movie.runtime, 106); // end minus start

  assert.equal(screenings[1].theatreName, 'VIFF Lochmaddy Studio');
  assert.equal(screenings[2].movie.title, 'Mistura');
  assert.equal(screenings[2].note, null);
  assert.equal(screenings[2].movie.runtime, 97);
});

test('VIFF: pulls the REST nonce out of the inlined wpApiSettings', () => {
  const html =
    '<script>var wpApiSettings = {"root":"https://viff.org/wp-json/","nonce":"54ef619566","versionString":"wp/v2/"};</script>';
  assert.equal(extractRestNonce(html), '54ef619566');
  assert.equal(extractRestNonce('<html><body>no settings here</body></html>'), null);
});

test('VIFF: reads the release year from a film page details sidebar', () => {
  // Trimmed from https://viff.org/whats-on/atonement/ (Oct 2026)
  const html = readFileSync(new URL('./fixtures/viff-film-page.html', import.meta.url), 'utf8');
  assert.equal(extractFilmYear(html), 2026);
  assert.equal(extractFilmYear('<html><body>no details</body></html>'), null);
});

test('Park/Rio: reads the year from a programme credits line', () => {
  // Real lines from the Park listings and Rio film pages (Oct 2026)
  assert.equal(
    extractCreditsYear(
      'Doors 9:00 pm\n\nTONY (Matt Johnson, 2026 / 106 mins / 14A) A 19-year-old Anthony Bourdain…',
    ),
    2026,
  );
  // Rating before runtime
  assert.equal(
    extractCreditsYear('WICKER  (Alex Huston Fischer & Eleanor Wilson, 2026 / 14A / 105 mins)'),
    2026,
  );
  // Original title in quotes before the parens
  assert.equal(
    extractCreditsYear(
      'THE SAMURAI AND THE PRISONER "Kokurôjô" (Kiyoshi Kurosawa, 2026 / 147 mins / 14A / Japanese w. EST)',
    ),
    2026,
  );
  assert.equal(extractCreditsYear('THE FLY (David Cronenberg, 1986 / 96 mins / 18A)'), 1986);
  // Years in prose or event notes aren't a credits line
  assert.equal(extractCreditsYear('Tuesday, October 13 (OFF-VIFF 2026 World Premiere)'), null);
  assert.equal(extractCreditsYear('created in 2024 by filmmaker Arran Shearing'), null);
});

test('Cinematheque: reads the headline film year from a film page', () => {
  // Trimmed from https://thecinematheque.ca/films/2026/begotten (Oct 2026)
  const html = readFileSync(
    new URL('./fixtures/cinematheque-film-page.html', import.meta.url),
    'utf8',
  );
  assert.equal(extractCinemathequeYear(html), 1989);
  assert.equal(extractCinemathequeYear('<html><body>no details</body></html>'), null);
});

test('Rio: keeps the offset-bearing instant and extracts notes', () => {
  const events = loadFixture<RioApiEvent[]>('rio-events.json');
  const screenings = parseRioEvents(events);

  assert.equal(screenings.length, 3);

  const first = screenings[0];
  assert.equal(first.movie.title, "John Woo's 'A Better Tomorrow'");
  assert.equal(first.note, '40th Anniversary Restoration');
  assert.equal(first.theatreName, 'The Rio');
  assert.equal(
    first.bookingUrl,
    'https://riotheatretickets.ca/events/41803-john-woo-s-a-better-tomorrow-40th-anniversary-restoration',
  );
  // "2026-05-31T19:00:00-07:00" carries its offset → the real instant is 02:00 UTC
  assert.equal(first.datetime.toISOString(), '2026-06-01T02:00:00.000Z');

  assert.equal(screenings[1].movie.title, 'Beat Street');
  assert.equal(screenings[1].note, null);

  // Empty tickets_link falls back to the event page link
  assert.equal(screenings[2].bookingUrl, 'https://riotheatre.ca/event/private-event/');
});

test('Cineplex: flattens movies/experiences/sessions into screenings', () => {
  const responses = loadFixture<CineplexTheatreResponse[]>('cineplex-showtimes.json');
  const screenings = parseCineplexResponses(responses, 'Fifth Ave');

  assert.equal(screenings.length, 4);

  const first = screenings[0];
  assert.equal(first.movie.title, 'Disclosure Day');
  assert.equal(first.movie.runtime, 145);
  assert.equal(first.theatreName, 'Fifth Ave Aud #3');
  // The session's showStartDateTimeUtc ("2026-06-12T19:00:00Z") is the instant
  assert.equal(first.datetime.toISOString(), '2026-06-12T19:00:00.000Z');
  assert.ok(first.bookingUrl.startsWith('https://apis.cineplex.com/prod/cpx/theatrical/deeplink'));

  assert.equal(screenings[2].movie.title, 'Obsession');
  assert.equal(screenings[2].theatreName, 'Fifth Ave Aud #4');
});

test('Cineplex: dedupeScreenings drops identical showtimes from overlapping day fetches', () => {
  const responses = loadFixture<CineplexTheatreResponse[]>('cineplex-showtimes.json');
  const screenings = parseCineplexResponses(responses, 'Fifth Ave');
  const doubled = [...screenings, ...parseCineplexResponses(responses, 'Fifth Ave')];

  assert.equal(dedupeScreenings(doubled).length, screenings.length);
  assert.deepEqual(dedupeScreenings(doubled), screenings);
});
