// Reconcile a scraper's incoming screenings against the DB.
//
// Four-pass algorithm:
//   1. Exact match on (theatre_name, movie_id, datetime). Update booking_url/note if drifted.
//   2. Time-shift match on (theatre_name, movie_id) within ±1h. Update row to incoming data.
//   3. Remaining incoming → INSERT.
//   4. Remaining existing (in window) → DELETE.
//
// The existing-side query window is [max(now, minDt - 1h), maxDt + 1h] where minDt/maxDt
// are the extremes of the incoming batch. Clamping the lower bound at `now` means past
// screenings are never fetched, so they're never deleted — they become historical records.
// The ±1h cushions let pass 2 catch reschedules at the edges of the batch.
//
// The pure decision logic (`computeReconcileWindow`, `planReconciliation`) is exported
// separately so it can be unit-tested without a live database.

import type { Transaction } from 'kysely';
import type { Database } from './schema.js';
import type { Screening } from '../models.js';

export interface ReconcileStats {
  matched: number;
  updated: number;
  inserted: number;
  deleted: number;
  skipped: number;
}

export interface ExistingScreening {
  id: number;
  movieId: number;
  datetime: Date;
  theatreName: string;
  bookingUrl: string;
  note: string | null;
}

export interface ReconcilePlan {
  metadataUpdates: Array<{ id: number; bookingUrl: string; note: string | null }>;
  reschedules: Array<{ id: number; datetime: Date; bookingUrl: string; note: string | null }>;
  inserts: Array<{
    movieId: number;
    datetime: Date;
    theatreName: string;
    bookingUrl: string;
    note: string | null;
  }>;
  deleteIds: number[];
  skippedTitles: string[];
  stats: ReconcileStats;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Compute the [lowerBound, upperBound] window for fetching existing screenings.
 * Returns null if incoming is empty.
 *
 * Window spans (minDt - 1h) to (maxDt + 1h) so pass 2 can catch reschedules at
 * the edges of the batch. The window extends into the past so the reconciler can
 * see (and match) past screenings — pass 4 protects them from deletion separately.
 */
export function computeReconcileWindow(
  incoming: Screening[]
): { lowerBound: Date; upperBound: Date } | null {
  if (incoming.length === 0) return null;

  let minMs = incoming[0].datetime.getTime();
  let maxMs = minMs;
  for (const s of incoming) {
    const ms = s.datetime.getTime();
    if (ms < minMs) minMs = ms;
    if (ms > maxMs) maxMs = ms;
  }

  const lowerBound = new Date(minMs - ONE_HOUR_MS);
  const upperBound = new Date(maxMs + ONE_HOUR_MS);
  return { lowerBound, upperBound };
}

interface IncomingItem {
  screening: Screening;
  movieId: number;
  datetimeMs: number;
  reconciled: boolean;
}

interface ExistingItem extends ExistingScreening {
  datetimeMs: number;
  reconciled: boolean;
}

/**
 * Pure four-pass reconciliation. Given incoming screenings, a title→movie_id map,
 * and the existing screenings already filtered to the reconciliation window,
 * returns a plan describing which records to update, insert, and delete.
 *
 * `now` controls pass 4: unmatched existing screenings in the past (datetime < now)
 * are preserved as historical records; only future unmatched existing are deleted.
 *
 * Incoming screenings whose title isn't in `titleToMovieId` are collected into
 * `skippedTitles` so the caller can log them.
 */
export function planReconciliation(
  incoming: Screening[],
  titleToMovieId: Map<string, number>,
  existing: ExistingScreening[],
  now: Date
): ReconcilePlan {
  const plan: ReconcilePlan = {
    metadataUpdates: [],
    reschedules: [],
    inserts: [],
    deleteIds: [],
    skippedTitles: [],
    stats: { matched: 0, updated: 0, inserted: 0, deleted: 0, skipped: 0 },
  };

  // Resolve movie_id for each incoming; track any whose movie isn't in the DB.
  const incomingItems: IncomingItem[] = [];
  for (const s of incoming) {
    const movieId = titleToMovieId.get(s.movie.title);
    if (movieId == null) {
      plan.skippedTitles.push(s.movie.title);
      plan.stats.skipped++;
      continue;
    }
    incomingItems.push({
      screening: s,
      movieId,
      datetimeMs: s.datetime.getTime(),
      reconciled: false,
    });
  }

  const existingItems: ExistingItem[] = existing.map(e => ({
    ...e,
    datetimeMs: e.datetime.getTime(),
    reconciled: false,
  }));

  // Pass 1: exact match on (theatre_name, movie_id, datetime).
  // Queue metadata updates if booking_url or note drifted — same screening, stale metadata.
  for (const inc of incomingItems) {
    const exact = existingItems.find(e =>
      !e.reconciled &&
      e.theatreName === inc.screening.theatreName &&
      e.movieId === inc.movieId &&
      e.datetimeMs === inc.datetimeMs
    );
    if (!exact) continue;

    inc.reconciled = true;
    exact.reconciled = true;
    plan.stats.matched++;

    if (exact.bookingUrl !== inc.screening.bookingUrl || exact.note !== inc.screening.note) {
      plan.metadataUpdates.push({
        id: exact.id,
        bookingUrl: inc.screening.bookingUrl,
        note: inc.screening.note,
      });
    }
  }

  // Pass 2: same (theatre, movie), datetime within ±1h — a reschedule.
  // Iterate incoming in datetime order, greedy closest-time pairing.
  // Each existing can only be paired once (reconciled flag enforces it).
  const unreconciledIncoming = incomingItems
    .filter(i => !i.reconciled)
    .sort((a, b) => a.datetimeMs - b.datetimeMs);

  for (const inc of unreconciledIncoming) {
    let best: ExistingItem | null = null;
    let bestDiff = Infinity;
    for (const e of existingItems) {
      if (e.reconciled) continue;
      if (e.theatreName !== inc.screening.theatreName) continue;
      if (e.movieId !== inc.movieId) continue;
      const diff = Math.abs(e.datetimeMs - inc.datetimeMs);
      if (diff <= ONE_HOUR_MS && diff < bestDiff) {
        bestDiff = diff;
        best = e;
      }
    }
    if (!best) continue;

    inc.reconciled = true;
    best.reconciled = true;
    plan.stats.updated++;

    plan.reschedules.push({
      id: best.id,
      datetime: inc.screening.datetime,
      bookingUrl: inc.screening.bookingUrl,
      note: inc.screening.note,
    });
  }

  // Pass 3: remaining incoming → INSERT.
  for (const inc of incomingItems) {
    if (inc.reconciled) continue;
    plan.inserts.push({
      movieId: inc.movieId,
      datetime: inc.screening.datetime,
      theatreName: inc.screening.theatreName,
      bookingUrl: inc.screening.bookingUrl,
      note: inc.screening.note,
    });
    plan.stats.inserted++;
  }

  // Pass 4: remaining existing (inside the query window) → DELETE.
  // Only delete future screenings — past ones are preserved as historical records.
  const nowMs = now.getTime();
  for (const e of existingItems) {
    if (e.reconciled) continue;
    if (e.datetimeMs < nowMs) continue;
    plan.deleteIds.push(e.id);
    plan.stats.deleted++;
  }

  return plan;
}

/**
 * Reconcile a scraper's incoming screenings against the DB. Queries the
 * existing screenings in the reconciliation window, computes a plan via
 * `planReconciliation`, and executes it against the given transaction.
 */
export async function reconcileScreenings(
  trx: Transaction<Database>,
  theatreNames: string[],
  incoming: Screening[],
  titleToMovieId: Map<string, number>
): Promise<ReconcileStats> {
  const emptyStats: ReconcileStats = { matched: 0, updated: 0, inserted: 0, deleted: 0, skipped: 0 };

  const now = new Date();
  const window = computeReconcileWindow(incoming);
  if (!window) return emptyStats;

  const existingRows = await trx
    .selectFrom('screening')
    .select(['id', 'movie_id', 'datetime', 'theatre_name', 'booking_url', 'note'])
    .where('theatre_name', 'in', theatreNames)
    .where('datetime', '>=', window.lowerBound)
    .where('datetime', '<=', window.upperBound)
    .execute();

  const existing: ExistingScreening[] = existingRows.map(r => ({
    id: r.id,
    movieId: r.movie_id,
    datetime: new Date(r.datetime),
    theatreName: r.theatre_name,
    bookingUrl: r.booking_url,
    note: r.note,
  }));

  const plan = planReconciliation(incoming, titleToMovieId, existing, now);

  if (plan.skippedTitles.length > 0) {
    console.error(
      `  🚨 BUG: ${plan.skippedTitles.length} incoming screening(s) had no matching movie row after the insert phase — this should never happen. Dropping them to avoid a crash, but this indicates a bug upstream (title mutation out of sync, failed insert, or unicode mismatch). Titles: ${plan.skippedTitles.map(t => JSON.stringify(t)).join(', ')}`
    );
  }

  const updatedAt = new Date();

  for (const u of plan.metadataUpdates) {
    await trx
      .updateTable('screening')
      .set({
        booking_url: u.bookingUrl,
        note: u.note,
        updated_at: updatedAt,
      })
      .where('id', '=', u.id)
      .execute();
  }

  for (const r of plan.reschedules) {
    await trx
      .updateTable('screening')
      .set({
        datetime: r.datetime,
        booking_url: r.bookingUrl,
        note: r.note,
        updated_at: updatedAt,
      })
      .where('id', '=', r.id)
      .execute();
  }

  for (const i of plan.inserts) {
    await trx
      .insertInto('screening')
      .values({
        movie_id: i.movieId,
        datetime: i.datetime,
        theatre_name: i.theatreName,
        booking_url: i.bookingUrl,
        note: i.note,
      })
      .execute();
  }

  if (plan.deleteIds.length > 0) {
    await trx
      .deleteFrom('screening')
      .where('id', 'in', plan.deleteIds)
      .executeTakeFirst();
  }

  return plan.stats;
}
