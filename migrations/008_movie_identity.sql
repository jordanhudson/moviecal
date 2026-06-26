-- Movie identity: make tmdb_id canonical, and make screenings unique at the DB
-- level. Until now a movie was identified by its exact title string, so the same
-- film scraped under two spellings ("Terminator 2: Judgment Day" vs "Judgement",
-- "A: B" vs "A - B") matched to one TMDB id but landed in two movie rows. This
-- merges any such duplicates, then enforces both invariants with unique indexes
-- so reconciliation is race-safe at the database level rather than only in code.
--
-- Idempotent: after the first run there are no duplicates left, so the merges and
-- the dedup become no-ops and the indexes already exist.

-- 1. Repoint screenings from duplicate movie rows onto the canonical row (the
--    lowest id sharing a tmdb_id), before the duplicates are deleted.
WITH keep AS (
  SELECT tmdb_id, MIN(id) AS keep_id
  FROM movie
  WHERE tmdb_id IS NOT NULL
  GROUP BY tmdb_id
  HAVING COUNT(*) > 1
)
UPDATE screening s
SET movie_id = k.keep_id, updated_at = NOW()
FROM movie m
JOIN keep k ON m.tmdb_id = k.tmdb_id
WHERE s.movie_id = m.id AND m.id <> k.keep_id;

-- 2. Delete the now-orphaned duplicate movie rows.
WITH keep AS (
  SELECT tmdb_id, MIN(id) AS keep_id
  FROM movie
  WHERE tmdb_id IS NOT NULL
  GROUP BY tmdb_id
  HAVING COUNT(*) > 1
)
DELETE FROM movie m
USING keep k
WHERE m.tmdb_id = k.tmdb_id AND m.id <> k.keep_id;

-- 3. Repointing can produce two screenings with the same (theatre, movie,
--    datetime) when both spellings had a showtime at the same place and time.
--    Collapse those to the oldest row so the unique index below can be created.
DELETE FROM screening s
USING (
  SELECT theatre_name, movie_id, datetime, MIN(id) AS keep_id
  FROM screening
  GROUP BY theatre_name, movie_id, datetime
  HAVING COUNT(*) > 1
) d
WHERE s.theatre_name = d.theatre_name
  AND s.movie_id = d.movie_id
  AND s.datetime = d.datetime
  AND s.id <> d.keep_id;

-- 4. tmdb_id is now canonical: at most one movie row per TMDB id. Partial so the
--    many TMDB-less movies (tmdb_id IS NULL) are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_tmdb_id_unique
  ON movie (tmdb_id) WHERE tmdb_id IS NOT NULL;

-- 5. A screening is uniquely identified by theatre + movie + time. This is the
--    tuple the reconciler already keys on; enforcing it at the DB level makes
--    concurrent/duplicate inserts a no-op (see ON CONFLICT in reconcile.ts)
--    instead of silently doubling rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_screening_identity_unique
  ON screening (theatre_name, movie_id, datetime);
