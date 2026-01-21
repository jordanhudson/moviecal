// Global models used across all scrapers and for database persistence

export interface Movie {
  id: number | null;
  title: string;
  year: number | null;
  director: string | null;
  runtime: number | null;
}

export interface Screening {
  id: number | null;
  datetime: Date;
  theatreName: string;
  bookingUrl: string;
  movie: Movie;
}
