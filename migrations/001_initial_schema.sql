-- Initial schema for MovieCal database

CREATE TABLE IF NOT EXISTS movie (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  title TEXT NOT NULL,
  year INTEGER,
  director TEXT,
  runtime INTEGER,
  tmdb_id INTEGER,
  tmdb_url TEXT,
  poster_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS screening (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  movie_id INTEGER NOT NULL REFERENCES movie(id) ON DELETE CASCADE,
  datetime TIMESTAMP NOT NULL,
  theatre_name TEXT NOT NULL,
  booking_url TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_screening_datetime ON screening(datetime);
CREATE INDEX IF NOT EXISTS idx_screening_movie_id ON screening(movie_id);
CREATE INDEX IF NOT EXISTS idx_screening_theatre_name ON screening(theatre_name);
CREATE INDEX IF NOT EXISTS idx_movie_title ON movie(title);

-- Unique constraint to prevent duplicate screening
CREATE UNIQUE INDEX IF NOT EXISTS idx_screening_unique
  ON screening(movie_id, datetime, theatre_name);
