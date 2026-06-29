-- Review queue for likely-wrong TMDB matches. Populated by
-- build-tmdb-review.ts (the audit + a top-result suggestion per flagged movie)
-- and consumed by the /internal-tmdb-review admin page, which lets an operator
-- accept the suggestion, pick another match, or dismiss. Rows are deleted as
-- they're resolved, so the table is a transient work list, not durable data.

CREATE TABLE IF NOT EXISTS tmdb_review (
  movie_id INTEGER PRIMARY KEY REFERENCES movie(id) ON DELETE CASCADE,
  stored_title TEXT NOT NULL,
  current_tmdb_id INTEGER,
  current_title TEXT,
  current_year INTEGER,
  current_poster_url TEXT,
  suggested_tmdb_id INTEGER,
  suggested_title TEXT,
  suggested_year INTEGER,
  suggested_poster_url TEXT,
  suggested_overview TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
