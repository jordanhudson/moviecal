-- TMDB synopsis text for movies. Used on /movie/:id for richer, unique page
-- content (and the Movie JSON-LD `description`). Populated by the same TMDB
-- write paths as the other tmdb_* fields; repair Pass 1 backfills existing rows.
ALTER TABLE movie ADD COLUMN IF NOT EXISTS overview text;
