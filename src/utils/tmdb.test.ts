import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { verifyTitleCleaning, TMDBSearchResult } from './tmdb.js';

// verifyTitleCleaning consults the TMDB API; these tests stub global fetch
// with a router keyed on the API paths it calls, so the decision logic
// (when to strip parens / split on colons) is tested without the network.

interface MockTmdb {
  /** search query string -> results */
  search?: Record<string, TMDBSearchResult[]>;
  /** tmdb id -> alternative titles */
  altTitles?: Record<number, string[]>;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockTmdbFetch(mock: MockTmdb) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === '/3/search/movie') {
      const query = url.searchParams.get('query') ?? '';
      return json({ results: mock.search?.[query] ?? [] });
    }
    const alt = url.pathname.match(/^\/3\/movie\/(\d+)\/alternative_titles$/);
    if (alt) {
      const titles = (mock.altTitles?.[Number(alt[1])] ?? []).map((title) => ({ title }));
      return json({ titles });
    }
    const details = url.pathname.match(/^\/3\/movie\/(\d+)$/);
    if (details) {
      const id = Number(details[1]);
      // Find the title from the search mock so details stay consistent
      const found = Object.values(mock.search ?? {})
        .flat()
        .find((r) => r.id === id);
      return json({
        id,
        title: found?.title ?? 'unknown',
        release_date: '2000-01-01',
        poster_path: null,
        runtime: 100,
      });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  }) as typeof fetch;
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  process.env.TMDB_API_TOKEN = 'test-token';
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('strips a paren annotation when TMDB has no movie under the full title', async () => {
  mockTmdbFetch({ search: {} });
  const result = await verifyTitleCleaning('Backrooms (Advance Screening)');
  assert.equal(result.title, 'Backrooms');
  assert.equal(result.note, 'Advance Screening');
});

test('keeps parens that are an alternate title (foreign film with English subtitle)', async () => {
  mockTmdbFetch({
    search: {
      'Él (This Strange Passion)': [{ id: 5, title: 'Él' }],
      'This Strange Passion': [{ id: 5, title: 'Él' }],
    },
  });
  const result = await verifyTitleCleaning('Él (This Strange Passion)');
  assert.equal(result.title, 'Él (This Strange Passion)');
  assert.equal(result.note, null);
  assert.equal(result.tmdbData?.tmdb_id, 5);
});

test('keeps parens when the note resolves to the existing TMDB match', async () => {
  mockTmdbFetch({
    search: { 'This Strange Passion': [{ id: 99, title: 'Él' }] },
  });
  const result = await verifyTitleCleaning('Él (This Strange Passion)', null, 99);
  assert.equal(result.title, 'Él (This Strange Passion)');
  assert.equal(result.note, null);
});

test('keeps a real colon title that exists on TMDB', async () => {
  mockTmdbFetch({
    search: { 'Dune: Part Two': [{ id: 1, title: 'Dune: Part Two' }] },
  });
  const result = await verifyTitleCleaning('Dune: Part Two');
  assert.equal(result.title, 'Dune: Part Two');
  assert.equal(result.note, null);
});

test('splits a colon annotation when only the base title exists on TMDB', async () => {
  mockTmdbFetch({
    search: {
      'Grave of the Fireflies: Bleak Week': [],
      'Grave of the Fireflies': [{ id: 42, title: 'Grave of the Fireflies' }],
    },
    altTitles: { 42: [] },
  });
  const result = await verifyTitleCleaning('Grave of the Fireflies: Bleak Week');
  assert.equal(result.title, 'Grave of the Fireflies');
  assert.equal(result.note, 'Bleak Week');
  assert.equal(result.tmdbData?.tmdb_id, 42);
});

test('does not split when the full title is a known alternative title of the base movie', async () => {
  mockTmdbFetch({
    search: {
      'Star Wars: Episode IV - A New Hope': [],
      'Star Wars': [{ id: 11, title: 'Star Wars' }],
    },
    altTitles: { 11: ['Star Wars: Episode IV - A New Hope'] },
  });
  const result = await verifyTitleCleaning('Star Wars: Episode IV - A New Hope');
  assert.equal(result.title, 'Star Wars: Episode IV - A New Hope');
  assert.equal(result.note, null);
});

test('does not split when the full title surfaces a different, more specific movie', async () => {
  mockTmdbFetch({
    search: {
      'Mission: Impossible': [{ id: 200, title: 'Mission: Impossible - Fallout' }],
      Mission: [{ id: 7, title: 'Mission' }],
    },
  });
  const result = await verifyTitleCleaning('Mission: Impossible');
  assert.equal(result.title, 'Mission: Impossible');
  assert.equal(result.note, null);
});

test('with an existing TMDB id, only splits when the base resolves to that movie', async () => {
  mockTmdbFetch({
    search: {
      'Oppenheimer: 70mm Presentation': [],
      Oppenheimer: [{ id: 50, title: 'Oppenheimer' }],
    },
    altTitles: { 50: [] },
  });
  const splits = await verifyTitleCleaning('Oppenheimer: 70mm Presentation', null, 50);
  assert.equal(splits.title, 'Oppenheimer');
  assert.equal(splits.note, '70mm Presentation');

  const keeps = await verifyTitleCleaning('Oppenheimer: 70mm Presentation', null, 51);
  assert.equal(keeps.title, 'Oppenheimer: 70mm Presentation');
  assert.equal(keeps.note, null);
});
