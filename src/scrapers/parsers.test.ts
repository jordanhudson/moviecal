import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVIFFEvents, VIFFApiEvent } from './viff-scraper.js';
import { parseRioEvents, RioApiEvent } from './rio-scraper.js';
import { parseCineplexResponses, dedupeScreenings, CineplexTheatreResponse } from './cineplex-scraper.js';

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
  // Naive local parse — compare against the same construction
  assert.equal(first.datetime.getTime(), new Date('2026-06-13T13:00:00').getTime());
  assert.equal(first.movie.runtime, 106); // end minus start

  assert.equal(screenings[1].theatreName, 'VIFF Lochmaddy Studio');
  assert.equal(screenings[2].movie.title, 'Mistura');
  assert.equal(screenings[2].note, null);
  assert.equal(screenings[2].movie.runtime, 97);
});

test('Rio: converts UTC offsets to Pacific-naive and extracts notes', () => {
  const events = loadFixture<RioApiEvent[]>('rio-events.json');
  const screenings = parseRioEvents(events);

  assert.equal(screenings.length, 3);

  const first = screenings[0];
  assert.equal(first.movie.title, "John Woo's 'A Better Tomorrow'");
  assert.equal(first.note, '40th Anniversary Restoration');
  assert.equal(first.theatreName, 'The Rio');
  assert.equal(first.bookingUrl, 'https://riotheatretickets.ca/events/41803-john-woo-s-a-better-tomorrow-40th-anniversary-restoration');
  // "2026-05-31T19:00:00-07:00" is 7pm Pacific → stored as a naive timestamp
  // whose UTC components read 7pm
  assert.equal(first.datetime.toISOString(), '2026-05-31T19:00:00.000Z');

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
  // "2026-06-12T12:00:00" is Pacific-naive → stored with those components as UTC
  assert.equal(first.datetime.toISOString(), '2026-06-12T12:00:00.000Z');
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
