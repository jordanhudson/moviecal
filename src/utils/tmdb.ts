// Shared TMDB API helpers

import { cleanMovieTitle } from './title-cleaner.js';

export interface TMDBMovieDetails {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  runtime: number | null;
  popularity?: number;
}

export interface TMDBMovieFields {
  tmdb_id: number;
  tmdb_url: string;
  poster_url: string | null;
  runtime: number | null;
  year: number | null;
  tmdb_popularity: number | null;
}

export interface VerifiedCleanResult {
  title: string;
  note: string | null;
  /** TMDB data found during verification (only when no existingTmdbId was provided) */
  tmdbData?: TMDBMovieFields;
}

export async function getTMDBMovieDetails(tmdbId: number): Promise<TMDBMovieDetails | null> {
  const apiToken = process.env.TMDB_API_TOKEN;
  if (!apiToken) {
    return null;
  }

  try {
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(`TMDB details fetch failed for ID ${tmdbId}: ${response.status}`);
      return null;
    }

    const data: TMDBMovieDetails = await response.json();
    return data;
  } catch (error) {
    console.warn(`Error fetching TMDB details for ID ${tmdbId}:`, error);
    return null;
  }
}

export interface TMDBSearchResult {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  popularity?: number;
}

/** Returns all TMDB search results for a title query. */
async function searchTMDBResults(title: string, year?: number | null): Promise<TMDBSearchResult[]> {
  const apiToken = process.env.TMDB_API_TOKEN;
  if (!apiToken) return [];

  try {
    let url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}`;
    if (year) url += `&year=${year}`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiToken}`, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return [];

    const data = await response.json() as { results: TMDBSearchResult[] };
    return data.results;
  } catch {
    return [];
  }
}

/**
 * Simple TMDB title search. Returns the first result, or null.
 * For more advanced matching (runtime, short filtering), use searchTMDB in scrape.ts.
 */
export async function searchTMDBByTitle(title: string, year?: number | null): Promise<TMDBSearchResult | null> {
  const results = await searchTMDBResults(title, year);
  return results[0] ?? null;
}

export function tmdbDetailsToMovieFields(details: TMDBMovieDetails): TMDBMovieFields {
  return {
    tmdb_id: details.id,
    tmdb_url: `https://www.themoviedb.org/movie/${details.id}`,
    poster_url: details.poster_path
      ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
      : null,
    runtime: details.runtime,
    year: details.release_date
      ? parseInt(details.release_date.substring(0, 4), 10)
      : null,
    tmdb_popularity: details.popularity ?? null,
  };
}

/**
 * Clean a movie title and verify with TMDB that any stripped parenthesized text
 * isn't part of the real title.
 *
 * Uses two checks:
 * 1. Exact match: does TMDB know a movie with the full uncleaned title?
 * 2. Alternate title: does searching the note content on TMDB return the same
 *    movie as the cleaned title? (catches foreign films with English subtitles
 *    in parens, e.g. "Él (This Strange Passion)")
 *
 * @param rawTitle - The original (potentially uncleaned) title
 * @param year - Release year for better TMDB matching
 * @param existingTmdbId - If the movie already has a TMDB match, use it for verification
 */
export async function verifyTitleCleaning(
  rawTitle: string,
  year?: number | null,
  existingTmdbId?: number | null,
): Promise<VerifiedCleanResult> {
  const { title: cleaned, note } = cleanMovieTitle(rawTitle);

  // If nothing was stripped, return as-is
  if (cleaned === rawTitle || !note) {
    return { title: cleaned, note };
  }

  // Check TMDB to verify parens aren't part of the real title
  if (existingTmdbId) {
    // Already matched — check if note content resolves to the same movie
    const noteResults = await searchTMDBResults(note);
    if (noteResults.some(r => r.id === existingTmdbId)) {
      return { title: rawTitle, note: null };
    }
  } else {
    // No TMDB match yet — search for the raw title and note content
    const rawResults = await searchTMDBResults(rawTitle, year);
    const rawMatch = rawResults[0];

    // Check 1: exact title match on raw title
    if (rawMatch && rawMatch.title.toLowerCase() === rawTitle.toLowerCase()) {
      const details = await getTMDBMovieDetails(rawMatch.id);
      return {
        title: rawTitle,
        note: null,
        tmdbData: details ? tmdbDetailsToMovieFields(details) : undefined,
      };
    }

    // Check 2: note content resolves to the same movie as the raw title search
    if (rawMatch) {
      const noteResults = await searchTMDBResults(note);
      if (noteResults.some(r => r.id === rawMatch.id)) {
        const details = await getTMDBMovieDetails(rawMatch.id);
        return {
          title: rawTitle,
          note: null,
          tmdbData: details ? tmdbDetailsToMovieFields(details) : undefined,
        };
      }
    }
  }

  return { title: cleaned, note };
}
