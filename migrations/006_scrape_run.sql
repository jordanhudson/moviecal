-- Track every scraper execution so failures/zero-result runs are visible
-- (and alertable) instead of only living in transient logs.

CREATE TABLE IF NOT EXISTS scrape_run (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  scraper TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP NOT NULL,
  screening_count INTEGER NOT NULL,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrape_run_scraper_created ON scrape_run(scraper, created_at);
