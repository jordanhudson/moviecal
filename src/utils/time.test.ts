import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pacificWallClockToInstant, pacificWallClock } from './time.js';

test('pacificWallClockToInstant resolves a summer (PDT, −07) wall time', () => {
  // June → daylight time, UTC−7. 1pm Pacific is 20:00 UTC.
  assert.equal(
    pacificWallClockToInstant(2026, 6, 13, 13, 0).toISOString(),
    '2026-06-13T20:00:00.000Z',
  );
});

test('pacificWallClockToInstant resolves a winter (PST, −08) wall time', () => {
  // January → standard time, UTC−8. 1pm Pacific is 21:00 UTC. This is the case
  // a hardcoded −07 offset would get wrong until BC's permanent-DST law is live.
  assert.equal(
    pacificWallClockToInstant(2026, 1, 13, 13, 0).toISOString(),
    '2026-01-13T21:00:00.000Z',
  );
});

test('pacificWallClock projects an instant back to Pacific wall-clock components', () => {
  // 20:00 UTC in June is 1pm Pacific; the returned naive Date reads off as 13:00.
  const local = pacificWallClock(new Date('2026-06-13T20:00:00Z'));
  assert.equal(local.getHours(), 13);
  assert.equal(local.getMinutes(), 0);
  assert.equal(local.getDate(), 13);
});

test('wall-clock → instant → wall-clock round-trips across a DST boundary', () => {
  for (const [y, mo, d, h] of [
    [2026, 1, 15, 9],
    [2026, 7, 15, 21],
    [2026, 11, 5, 0],
  ] as const) {
    const local = pacificWallClock(pacificWallClockToInstant(y, mo, d, h, 30));
    assert.equal(local.getFullYear(), y);
    assert.equal(local.getMonth(), mo - 1);
    assert.equal(local.getDate(), d);
    assert.equal(local.getHours(), h);
    assert.equal(local.getMinutes(), 30);
  }
});
