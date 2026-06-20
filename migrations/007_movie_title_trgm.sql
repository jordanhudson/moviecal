-- The nav-bar search runs `title ILIKE '%q%'` (leading wildcard, case-insensitive).
-- The plain B-tree idx_movie_title can't serve a leading-wildcard/ILIKE pattern,
-- so that query seq-scans. A trigram GIN index makes LIKE/ILIKE substring
-- matches index-backed, keeping search fast as the movie table grows (it now
-- holds every movie ever scraped, including those with no upcoming screenings).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_movie_title_trgm ON movie USING gin (title gin_trgm_ops);
