// Find and (optionally) remove duplicate screening rows.
//
// A duplicate is a screening row that shares (theatre_name, movie_id, datetime)
// with another row. When deleting, the lowest-id row in each group is kept so
// the original created_at is preserved.
//
// Usage:
//   node dist/db/dedup.js           # dry run — report only
//   node dist/db/dedup.js --apply   # actually delete duplicates

import 'dotenv/config';
import { sql } from 'kysely';
import { db, closeDb } from './connection.js';

interface DupeGroupRow {
  theatre_name: string;
  movie_id: number;
  datetime: Date;
  count: string | number;
  keep_id: string | number;
}

async function main() {
  const apply = process.argv.includes('--apply');

  console.log(apply ? 'Dedup: APPLY mode\n' : 'Dedup: dry run (pass --apply to delete)\n');

  // Find all (theatre_name, movie_id, datetime) groups with > 1 row.
  // Record the min(id) we'd keep for each group.
  const groups = await sql<DupeGroupRow>`
    SELECT theatre_name, movie_id, datetime, COUNT(*) AS count, MIN(id) AS keep_id
    FROM screening
    GROUP BY theatre_name, movie_id, datetime
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, theatre_name, datetime
  `.execute(db);

  if (groups.rows.length === 0) {
    console.log('✓ No duplicate screening rows found.');
    await closeDb();
    process.exit(0);
  }

  let totalExtras = 0;
  const byTheatre = new Map<string, { groups: number; extras: number }>();
  for (const r of groups.rows) {
    const count = Number(r.count);
    const extras = count - 1;
    totalExtras += extras;
    const t = byTheatre.get(r.theatre_name) ?? { groups: 0, extras: 0 };
    t.groups++;
    t.extras += extras;
    byTheatre.set(r.theatre_name, t);
  }

  console.log(`Found ${groups.rows.length} duplicate groups, ${totalExtras} extra row(s) total.`);
  console.log('\nBy theatre:');
  for (const [theatre, t] of [...byTheatre.entries()].sort((a, b) => b[1].extras - a[1].extras)) {
    console.log(`  ${theatre}: ${t.groups} groups, ${t.extras} extras`);
  }

  console.log('\nSample (top 10 groups):');
  for (const r of groups.rows.slice(0, 10)) {
    console.log(`  ${r.theatre_name} | movie_id=${r.movie_id} | ${new Date(r.datetime).toISOString()} | count=${r.count} | keep_id=${r.keep_id}`);
  }

  if (!apply) {
    console.log('\nDry run — no changes made. Re-run with --apply to delete duplicates.');
    await closeDb();
    process.exit(0);
  }

  // Delete: for each group, drop all rows whose id > MIN(id).
  console.log('\nDeleting duplicates...');
  const result = await sql`
    DELETE FROM screening a
    USING screening b
    WHERE a.id > b.id
      AND a.theatre_name = b.theatre_name
      AND a.movie_id = b.movie_id
      AND a.datetime = b.datetime
  `.execute(db);

  console.log(`✓ Deleted ${result.numAffectedRows ?? 'unknown'} duplicate row(s).`);
  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Error running dedup:', err);
  await closeDb();
  process.exit(1);
});
