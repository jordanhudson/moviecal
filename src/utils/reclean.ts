// Re-clean existing movie titles in the DB.
//
// When new patterns are added to the title cleaner, existing movie titles may
// need updating. This module handles the full re-clean pipeline:
//   1. Verify each title with TMDB (to avoid stripping real title parts)
//   2. Merge duplicates when a cleaned title matches an existing movie
//   3. Rename and retry TMDB/Letterboxd lookups for changed titles

import { db } from '../db/connection.js';
import {
  verifyTitleCleaning,
  searchTMDBByTitle,
  getTMDBMovieDetails,
  tmdbDetailsToMovieFields,
} from './tmdb.js';

/**
 * Apply a note extracted during re-cleaning to a movie's screenings. Only fills
 * screenings whose note is still null, so existing notes are never clobbered.
 */
async function applyNoteToScreenings(movieId: number, note: string | null) {
  if (!note) return;
  await db
    .updateTable('screening')
    .set({ note })
    .where('movie_id', '=', movieId)
    .where('note', 'is', null)
    .execute();
}

export async function recleanExistingTitles() {
  const existingMovies = await db
    .selectFrom('movie')
    .select(['id', 'title', 'year', 'tmdb_id'])
    .execute();

  for (const existing of existingMovies) {
    const verified = await verifyTitleCleaning(existing.title, existing.year, existing.tmdb_id);

    if (verified.title === existing.title) {
      // Title unchanged — either no cleaning needed, or TMDB confirmed parens are real
      if (verified.tmdbData) {
        await db
          .updateTable('movie')
          .set(verified.tmdbData)
          .where('id', '=', existing.id)
          .execute();
        console.log(
          `  → TMDB confirms "${existing.title}" is the real title, backfilled TMDB data`,
        );
      }
      continue;
    }

    // Title changed — check for duplicates
    const duplicate = await db
      .selectFrom('movie')
      .select('id')
      .where('title', '=', verified.title)
      .executeTakeFirst();

    if (duplicate) {
      // Carry the extracted note onto the stale record's screenings before they move
      await applyNoteToScreenings(existing.id, verified.note);
      // Reassign screenings from the stale record to the existing one, then delete stale
      await db
        .updateTable('screening')
        .set({ movie_id: duplicate.id })
        .where('movie_id', '=', existing.id)
        .execute();
      await db.deleteFrom('movie').where('id', '=', existing.id).execute();
      console.log(`  → Merged stale movie "${existing.title}" into "${verified.title}"`);
    } else {
      // Rename and retry missing external lookups with the cleaned title
      const updates: Record<string, unknown> = { title: verified.title };

      if (!existing.tmdb_id) {
        console.log(`  → Retrying TMDB for cleaned title "${verified.title}"...`);
        const tmdbResult = await searchTMDBByTitle(verified.title, existing.year);
        if (tmdbResult) {
          const tmdbDetails = await getTMDBMovieDetails(tmdbResult.id);
          if (tmdbDetails) {
            if (tmdbDetails.runtime && tmdbDetails.runtime < 60) {
              console.log(`    ✗ Skipped (short: ${tmdbDetails.runtime} min)`);
            } else {
              Object.assign(updates, tmdbDetailsToMovieFields(tmdbDetails));
              console.log(`    ✓ Found on TMDB: ${updates.tmdb_url}`);
            }
          }
        } else {
          console.log(`    ✗ Not found on TMDB`);
        }
      }

      await db.updateTable('movie').set(updates).where('id', '=', existing.id).execute();
      await applyNoteToScreenings(existing.id, verified.note);
      console.log(`  → Cleaned movie title "${existing.title}" → "${verified.title}"`);
    }
  }
}
