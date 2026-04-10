import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Screening } from '../models.js';
import {
  computeReconcileWindow,
  planReconciliation,
  type ExistingScreening,
} from './reconcile.js';

// --- test helpers --------------------------------------------------------

const HOUR = 60 * 60 * 1000;

function dt(iso: string): Date {
  return new Date(iso);
}

function makeScreening(overrides: {
  title?: string;
  datetime?: Date;
  theatreName?: string;
  bookingUrl?: string;
  note?: string | null;
} = {}): Screening {
  return {
    id: null,
    datetime: overrides.datetime ?? dt('2026-05-01T19:00:00Z'),
    theatreName: overrides.theatreName ?? 'The Rio',
    bookingUrl: overrides.bookingUrl ?? 'https://example.com/book/1',
    note: overrides.note ?? null,
    movie: {
      id: null,
      title: overrides.title ?? 'Test Movie',
      year: null,
      director: null,
      runtime: null,
    },
  };
}

function makeExisting(overrides: Partial<ExistingScreening> = {}): ExistingScreening {
  return {
    id: overrides.id ?? 1,
    movieId: overrides.movieId ?? 1,
    datetime: overrides.datetime ?? dt('2026-05-01T19:00:00Z'),
    theatreName: overrides.theatreName ?? 'The Rio',
    bookingUrl: overrides.bookingUrl ?? 'https://example.com/book/1',
    note: overrides.note ?? null,
  };
}

const DEFAULT_MOVIE_IDS = new Map<string, number>([
  ['Test Movie', 1],
  ['Other Movie', 2],
  ['Third Movie', 3],
]);

// --- computeReconcileWindow ----------------------------------------------

test('computeReconcileWindow: empty incoming returns null', () => {
  const result = computeReconcileWindow([], dt('2026-05-01T12:00:00Z'));
  assert.equal(result, null);
});

test('computeReconcileWindow: single screening yields ±1h window', () => {
  const incoming = [makeScreening({ datetime: dt('2026-05-01T19:00:00Z') })];
  const result = computeReconcileWindow(incoming, dt('2026-05-01T12:00:00Z'));
  assert.ok(result);
  assert.equal(result.lowerBound.toISOString(), '2026-05-01T18:00:00.000Z');
  assert.equal(result.upperBound.toISOString(), '2026-05-01T20:00:00.000Z');
});

test('computeReconcileWindow: multi-screening spans min..max with ±1h cushions', () => {
  const incoming = [
    makeScreening({ datetime: dt('2026-05-01T19:00:00Z') }),
    makeScreening({ datetime: dt('2026-05-03T22:00:00Z') }),
    makeScreening({ datetime: dt('2026-05-02T14:00:00Z') }),
  ];
  const result = computeReconcileWindow(incoming, dt('2026-05-01T12:00:00Z'));
  assert.ok(result);
  assert.equal(result.lowerBound.toISOString(), '2026-05-01T18:00:00.000Z');
  assert.equal(result.upperBound.toISOString(), '2026-05-03T23:00:00.000Z');
});

test('computeReconcileWindow: clamps lower bound at now when minDt - 1h is in the past', () => {
  // minDt = 14:30, now = 14:00 → minDt - 1h = 13:30 (before now) → clamp to 14:00
  const incoming = [makeScreening({ datetime: dt('2026-05-01T14:30:00Z') })];
  const now = dt('2026-05-01T14:00:00Z');
  const result = computeReconcileWindow(incoming, now);
  assert.ok(result);
  assert.equal(result.lowerBound.toISOString(), '2026-05-01T14:00:00.000Z');
  assert.equal(result.upperBound.toISOString(), '2026-05-01T15:30:00.000Z');
});

test('computeReconcileWindow: does not clamp when minDt - 1h is in the future', () => {
  // now = 10:00, minDt = 19:00 → minDt - 1h = 18:00 (after now) → no clamping
  const incoming = [makeScreening({ datetime: dt('2026-05-01T19:00:00Z') })];
  const now = dt('2026-05-01T10:00:00Z');
  const result = computeReconcileWindow(incoming, now);
  assert.ok(result);
  assert.equal(result.lowerBound.toISOString(), '2026-05-01T18:00:00.000Z');
});

// --- planReconciliation: trivial cases -----------------------------------

test('plan: empty incoming and empty existing → no-op', () => {
  const plan = planReconciliation([], DEFAULT_MOVIE_IDS, []);
  assert.deepEqual(plan.stats, { matched: 0, updated: 0, inserted: 0, deleted: 0, skipped: 0 });
  assert.equal(plan.metadataUpdates.length, 0);
  assert.equal(plan.reschedules.length, 0);
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.deleteIds.length, 0);
});

test('plan: empty existing → everything inserts', () => {
  const incoming = [
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T19:00:00Z') }),
    makeScreening({ title: 'Other Movie', datetime: dt('2026-05-01T21:00:00Z') }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, []);
  assert.equal(plan.stats.inserted, 2);
  assert.equal(plan.stats.matched, 0);
  assert.equal(plan.inserts.length, 2);
  assert.equal(plan.inserts[0].movieId, 1);
  assert.equal(plan.inserts[1].movieId, 2);
});

test('plan: empty incoming but existing in window → everything deletes', () => {
  const existing = [
    makeExisting({ id: 10 }),
    makeExisting({ id: 11, datetime: dt('2026-05-01T21:00:00Z') }),
  ];
  const plan = planReconciliation([], DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.deleted, 2);
  assert.deepEqual(plan.deleteIds.sort(), [10, 11]);
});

// --- pass 1: exact match -------------------------------------------------

test('pass 1: exact match on (theatre, movie, datetime) → matched, no ops', () => {
  const incoming = [makeScreening({ title: 'Test Movie' })];
  const existing = [makeExisting({ id: 10, movieId: 1 })];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.matched, 1);
  assert.equal(plan.stats.inserted, 0);
  assert.equal(plan.stats.deleted, 0);
  assert.equal(plan.metadataUpdates.length, 0);
});

test('pass 1: exact match with drifted booking_url → metadata update queued', () => {
  const incoming = [
    makeScreening({ title: 'Test Movie', bookingUrl: 'https://example.com/NEW' }),
  ];
  const existing = [
    makeExisting({ id: 10, movieId: 1, bookingUrl: 'https://example.com/OLD' }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.matched, 1);
  assert.equal(plan.metadataUpdates.length, 1);
  assert.deepEqual(plan.metadataUpdates[0], {
    id: 10,
    bookingUrl: 'https://example.com/NEW',
    note: null,
  });
});

test('pass 1: exact match with drifted note → metadata update queued', () => {
  const incoming = [makeScreening({ title: 'Test Movie', note: '4K Restoration' })];
  const existing = [makeExisting({ id: 10, movieId: 1, note: null })];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.matched, 1);
  assert.equal(plan.metadataUpdates.length, 1);
  assert.equal(plan.metadataUpdates[0].note, '4K Restoration');
});

test('pass 1: exact match with identical metadata → no update queued', () => {
  const incoming = [
    makeScreening({
      title: 'Test Movie',
      bookingUrl: 'https://example.com/same',
      note: 'same note',
    }),
  ];
  const existing = [
    makeExisting({
      id: 10,
      movieId: 1,
      bookingUrl: 'https://example.com/same',
      note: 'same note',
    }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.matched, 1);
  assert.equal(plan.metadataUpdates.length, 0);
});

test('pass 1: exact match requires theatre to match — different theatre does not match', () => {
  const incoming = [makeScreening({ title: 'Test Movie', theatreName: 'The Rio' })];
  const existing = [makeExisting({ id: 10, movieId: 1, theatreName: 'VIFF Centre' })];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.matched, 0);
  assert.equal(plan.stats.inserted, 1);
  assert.equal(plan.stats.deleted, 1);
});

// --- pass 2: time-shift (reschedule) -------------------------------------

test('pass 2: same theatre+movie within 1h → reschedule', () => {
  const incoming = [
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T19:30:00Z') }),
  ];
  const existing = [
    makeExisting({ id: 10, movieId: 1, datetime: dt('2026-05-01T19:00:00Z') }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.matched, 0);
  assert.equal(plan.stats.updated, 1);
  assert.equal(plan.stats.inserted, 0);
  assert.equal(plan.stats.deleted, 0);
  assert.equal(plan.reschedules.length, 1);
  assert.equal(plan.reschedules[0].id, 10);
  assert.equal(plan.reschedules[0].datetime.toISOString(), '2026-05-01T19:30:00.000Z');
});

test('pass 2: reschedule works symmetrically (existing later than incoming)', () => {
  const incoming = [
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T19:00:00Z') }),
  ];
  const existing = [
    makeExisting({ id: 10, movieId: 1, datetime: dt('2026-05-01T19:45:00Z') }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.updated, 1);
  assert.equal(plan.reschedules[0].id, 10);
});

test('pass 2: exactly 1h diff is within window', () => {
  const incoming = [
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T20:00:00Z') }),
  ];
  const existing = [
    makeExisting({ id: 10, movieId: 1, datetime: dt('2026-05-01T19:00:00Z') }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.updated, 1);
});

test('pass 2: > 1h diff is not a reschedule → insert + delete', () => {
  const incoming = [
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T21:00:01Z') }),
  ];
  const existing = [
    makeExisting({ id: 10, movieId: 1, datetime: dt('2026-05-01T20:00:00Z') }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.updated, 0);
  assert.equal(plan.stats.inserted, 1);
  assert.equal(plan.stats.deleted, 1);
});

test('pass 2: different movie at same theatre → not a reschedule', () => {
  const incoming = [
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T19:30:00Z') }),
  ];
  const existing = [
    makeExisting({ id: 10, movieId: 2, datetime: dt('2026-05-01T19:00:00Z') }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.updated, 0);
  assert.equal(plan.stats.inserted, 1);
  assert.equal(plan.stats.deleted, 1);
});

test('pass 2: same movie at different theatre → not a reschedule', () => {
  const incoming = [
    makeScreening({
      title: 'Test Movie',
      theatreName: 'The Rio',
      datetime: dt('2026-05-01T19:30:00Z'),
    }),
  ];
  const existing = [
    makeExisting({
      id: 10,
      movieId: 1,
      theatreName: 'VIFF Centre',
      datetime: dt('2026-05-01T19:00:00Z'),
    }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.updated, 0);
  assert.equal(plan.stats.inserted, 1);
  assert.equal(plan.stats.deleted, 1);
});

test('pass 2: picks the closest existing when multiple candidates are within 1h', () => {
  // Incoming at 19:30. Two existing candidates at 19:00 (30min) and 20:15 (45min).
  // Should pair with 19:00.
  const incoming = [
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T19:30:00Z') }),
  ];
  const existing = [
    makeExisting({ id: 20, movieId: 1, datetime: dt('2026-05-01T20:15:00Z') }),
    makeExisting({ id: 10, movieId: 1, datetime: dt('2026-05-01T19:00:00Z') }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.updated, 1);
  assert.equal(plan.reschedules[0].id, 10);
  // The 20:15 existing goes unmatched and is deleted.
  assert.deepEqual(plan.deleteIds, [20]);
});

test('pass 2: each existing can only pair once (greedy, closest-time)', () => {
  // Two incoming for the same movie+theatre. Only one existing.
  // The closer incoming should claim it; the other inserts.
  const incoming = [
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T19:10:00Z') }), // 10min diff
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T19:45:00Z') }), // 45min diff
  ];
  const existing = [
    makeExisting({ id: 10, movieId: 1, datetime: dt('2026-05-01T19:00:00Z') }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.updated, 1);
  assert.equal(plan.stats.inserted, 1);
  assert.equal(plan.stats.deleted, 0);
  // Pass 2 iterates incoming in datetime order, so 19:10 (earliest) claims the existing first.
  assert.equal(plan.reschedules[0].id, 10);
  // The 19:45 incoming becomes an insert.
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0].datetime.toISOString(), '2026-05-01T19:45:00.000Z');
});

test('pass 2: two incoming + two existing for the same movie → both pair up', () => {
  const incoming = [
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T19:15:00Z') }),
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T21:45:00Z') }),
  ];
  const existing = [
    makeExisting({ id: 10, movieId: 1, datetime: dt('2026-05-01T19:00:00Z') }),
    makeExisting({ id: 20, movieId: 1, datetime: dt('2026-05-01T22:00:00Z') }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.updated, 2);
  assert.equal(plan.stats.inserted, 0);
  assert.equal(plan.stats.deleted, 0);
  // 19:15 pairs with id 10 (15min), 21:45 pairs with id 20 (15min).
  const pairings = plan.reschedules.map(r => r.id).sort();
  assert.deepEqual(pairings, [10, 20]);
});

test('pass 2: reschedule update carries incoming booking_url and note', () => {
  const incoming = [
    makeScreening({
      title: 'Test Movie',
      datetime: dt('2026-05-01T19:30:00Z'),
      bookingUrl: 'https://example.com/new-booking',
      note: '70mm print',
    }),
  ];
  const existing = [
    makeExisting({
      id: 10,
      movieId: 1,
      datetime: dt('2026-05-01T19:00:00Z'),
      bookingUrl: 'https://example.com/old-booking',
      note: null,
    }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.reschedules.length, 1);
  assert.deepEqual(plan.reschedules[0], {
    id: 10,
    datetime: dt('2026-05-01T19:30:00Z'),
    bookingUrl: 'https://example.com/new-booking',
    note: '70mm print',
  });
});

test('pass 2: pass 1 exact match gets priority over pass 2 reschedule', () => {
  // Three incoming at 19:00, 19:30, 20:00 — all Test Movie @ Rio.
  // Three existing at 19:00, 19:30, 20:00 — all Test Movie @ Rio.
  // All should be pass 1 exact matches; pass 2 should not fire.
  const incoming = [
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T19:00:00Z') }),
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T19:30:00Z') }),
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T20:00:00Z') }),
  ];
  const existing = [
    makeExisting({ id: 10, movieId: 1, datetime: dt('2026-05-01T19:00:00Z') }),
    makeExisting({ id: 20, movieId: 1, datetime: dt('2026-05-01T19:30:00Z') }),
    makeExisting({ id: 30, movieId: 1, datetime: dt('2026-05-01T20:00:00Z') }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.matched, 3);
  assert.equal(plan.stats.updated, 0);
});

// --- pass 3/4: inserts and deletes ---------------------------------------

test('pass 3 + 4: unreconciled incoming inserts, unreconciled existing deletes', () => {
  const incoming = [
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T19:00:00Z') }),
    makeScreening({ title: 'Other Movie', datetime: dt('2026-05-01T21:00:00Z') }),
  ];
  // One exact match (Test Movie @ 19:00), one unrelated existing to delete.
  const existing = [
    makeExisting({ id: 10, movieId: 1, datetime: dt('2026-05-01T19:00:00Z') }),
    makeExisting({ id: 99, movieId: 3, datetime: dt('2026-05-01T23:00:00Z') }),
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);
  assert.equal(plan.stats.matched, 1);
  assert.equal(plan.stats.inserted, 1);
  assert.equal(plan.stats.deleted, 1);
  assert.equal(plan.inserts[0].movieId, 2); // Other Movie
  assert.deepEqual(plan.deleteIds, [99]);
});

// --- skipped (missing movie) ---------------------------------------------

test('skipped: incoming whose title is not in titleToMovieId is collected and not processed', () => {
  const incoming = [
    makeScreening({ title: 'Test Movie' }),
    makeScreening({ title: 'Ghost Movie' }), // not in the map
  ];
  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, []);
  assert.equal(plan.stats.skipped, 1);
  assert.deepEqual(plan.skippedTitles, ['Ghost Movie']);
  assert.equal(plan.stats.inserted, 1);
  assert.equal(plan.inserts[0].movieId, 1);
});

// --- realistic mixed scenario --------------------------------------------

test('mixed scenario: match + metadata drift + reschedule + insert + delete + skip', () => {
  const incoming = [
    // exact match, no drift
    makeScreening({ title: 'Test Movie', datetime: dt('2026-05-01T19:00:00Z') }),
    // exact match with booking_url drift
    makeScreening({
      title: 'Test Movie',
      datetime: dt('2026-05-01T22:00:00Z'),
      bookingUrl: 'https://example.com/updated',
    }),
    // reschedule (was 15:00, now 15:30)
    makeScreening({ title: 'Other Movie', datetime: dt('2026-05-02T15:30:00Z') }),
    // brand new
    makeScreening({ title: 'Third Movie', datetime: dt('2026-05-03T20:00:00Z') }),
    // missing movie
    makeScreening({ title: 'Ghost Movie', datetime: dt('2026-05-01T23:00:00Z') }),
  ];
  const existing = [
    // exact match for first incoming
    makeExisting({ id: 100, movieId: 1, datetime: dt('2026-05-01T19:00:00Z') }),
    // exact match for second incoming (with old booking_url)
    makeExisting({
      id: 101,
      movieId: 1,
      datetime: dt('2026-05-01T22:00:00Z'),
      bookingUrl: 'https://example.com/stale',
    }),
    // the reschedule target
    makeExisting({ id: 102, movieId: 2, datetime: dt('2026-05-02T15:00:00Z') }),
    // stale existing that should be deleted
    makeExisting({ id: 103, movieId: 3, datetime: dt('2026-05-02T18:00:00Z') }),
  ];

  const plan = planReconciliation(incoming, DEFAULT_MOVIE_IDS, existing);

  assert.deepEqual(plan.stats, {
    matched: 2,
    updated: 1,
    inserted: 1,
    deleted: 1,
    skipped: 1,
  });
  assert.equal(plan.metadataUpdates.length, 1);
  assert.equal(plan.metadataUpdates[0].id, 101);
  assert.equal(plan.metadataUpdates[0].bookingUrl, 'https://example.com/updated');
  assert.equal(plan.reschedules.length, 1);
  assert.equal(plan.reschedules[0].id, 102);
  assert.equal(plan.reschedules[0].datetime.toISOString(), '2026-05-02T15:30:00.000Z');
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0].movieId, 3);
  assert.deepEqual(plan.deleteIds, [103]);
  assert.deepEqual(plan.skippedTitles, ['Ghost Movie']);
});
