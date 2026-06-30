import { sql } from 'kysely';
import { db } from './connection.js';

// Merge a duplicate movie into the keeper that already owns the same tmdb_id:
// repoint the duplicate's screenings to the keeper (dropping any that would
// collide with the keeper's (theatre_name, datetime) identity), then delete the
// duplicate — whose remaining screenings and any tmdb_review row cascade away.
//
// Used wherever a new tmdb_id assignment could otherwise hit the unique
// idx_movie_tmdb_id_unique: the fix-match API and repair's Pass 2 retry.
export async function mergeMovieInto(keeperId: number, duplicateId: number): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await sql`
      DELETE FROM screening s
      WHERE s.movie_id = ${duplicateId}
        AND EXISTS (
          SELECT 1 FROM screening k
          WHERE k.movie_id = ${keeperId}
            AND k.theatre_name = s.theatre_name
            AND k.datetime = s.datetime
        )
    `.execute(trx);
    await sql`UPDATE screening SET movie_id = ${keeperId} WHERE movie_id = ${duplicateId}`.execute(
      trx,
    );
    await sql`DELETE FROM movie WHERE id = ${duplicateId}`.execute(trx);
  });
}
