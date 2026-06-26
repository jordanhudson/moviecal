-- Drop the 'MISS' letterboxd sentinel. letterboxd_url is now simply a real URL
-- or NULL; NULL means "no known Letterboxd URL" whether or not we've searched.
--
-- Letterboxd sources its catalog from TMDB, so a film with a tmdb_id almost
-- always has a Letterboxd page — the lookup is the tmdb_id -> /tmdb/{id}/ redirect.
-- Genuine "on TMDB but not Letterboxd" cases are vanishingly rare, and most
-- stored 'MISS' values were stale false-misses from the old slug-guessing lookup.
-- Not worth a dedicated sentinel (or a letterboxd_checked_at column): collapse
-- them to NULL.
UPDATE movie SET letterboxd_url = NULL WHERE letterboxd_url = 'MISS';
