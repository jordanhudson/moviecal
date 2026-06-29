// Shared TMDB API helpers

import { cleanMovieTitle } from './title-cleaner.js';

export interface TMDBMovieDetails {
  id: number;
  title: string;
  original_title?: string;
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
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
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
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as { results: TMDBSearchResult[] };
    return data.results;
  } catch {
    return [];
  }
}

/** Returns all alternative titles registered on TMDB for a movie. */
export async function getAlternativeTitles(tmdbId: number): Promise<string[]> {
  const apiToken = process.env.TMDB_API_TOKEN;
  if (!apiToken) return [];

  try {
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}/alternative_titles`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { titles?: { title: string }[] };
    return (data.titles ?? []).map((t) => t.title);
  } catch {
    return [];
  }
}

/**
 * Simple TMDB title search. Returns the first result, or null.
 * For more advanced matching (runtime, short filtering), use searchTMDB in scrape.ts.
 */
export async function searchTMDBByTitle(
  title: string,
  year?: number | null,
): Promise<TMDBSearchResult | null> {
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
    year: details.release_date ? parseInt(details.release_date.substring(0, 4), 10) : null,
    tmdb_popularity: details.popularity ?? null,
  };
}

/**
 * If a title looks like "{Real Title}: {annotation}" (e.g. "Oppenheimer: 70mm
 * Presentation"), try to recover the real title and the trailing annotation as a
 * note, using TMDB to avoid mangling titles that genuinely contain a colon.
 *
 * Splits only when:
 * 1. TMDB has NO movie titled exactly like the full string — real colon titles
 *    ("Dune: Part Two", "Mission: Impossible") are stored that way on TMDB, so an
 *    exact full-title match means "leave it alone".
 * 2. TMDB DOES have a movie titled exactly like the part before the colon.
 *
 * Splits on the last colon, so multi-colon real titles aren't truncated to their
 * first segment.
 */
async function tryColonNote(
  title: string,
  year?: number | null,
  existingTmdbId?: number | null,
): Promise<VerifiedCleanResult | null> {
  const idx = title.lastIndexOf(':');
  if (idx === -1) return null;

  const base = title.slice(0, idx).trim();
  const suffix = title.slice(idx + 1).trim();
  if (base.length < 2 || suffix.length < 2) return null;

  // (1) If the full string is itself an exact TMDB title, it's a real title — keep it.
  const fullResults = await searchTMDBResults(title, year);
  if (fullResults.some((r) => r.title.toLowerCase() === title.toLowerCase())) {
    return null;
  }

  // (2) The part before the colon must itself be an exact TMDB title to be trusted.
  const baseResults = await searchTMDBResults(base, year);
  const baseMatch = baseResults.find((r) => r.title.toLowerCase() === base.toLowerCase());
  if (!baseMatch) return null;

  // When the movie is already matched, only split if the base resolves to that same movie.
  if (existingTmdbId != null && baseMatch.id !== existingTmdbId) return null;

  // (3) If searching the full string surfaces a *different* movie than the base, the
  // suffix belongs to a real, distinct title (e.g. "Star Wars: The Mandalorian and
  // Grogu") — keep it.
  const fullTop = fullResults[0];
  if (fullTop && fullTop.id !== baseMatch.id) return null;

  // (4) If the full string is a known alternative title of the base movie, the colon
  // is part of the real title (e.g. TMDB lists "Star Wars" with the alternative title
  // "Star Wars: Episode IV - A New Hope") — keep it.
  const altTitles = await getAlternativeTitles(baseMatch.id);
  if (altTitles.some((t) => t.toLowerCase() === title.toLowerCase())) return null;

  const details = await getTMDBMovieDetails(baseMatch.id);
  return {
    title: base,
    note: suffix,
    tmdbData: details ? tmdbDetailsToMovieFields(details) : undefined,
  };
}

/**
 * Clean a movie title and verify with TMDB that stripped text isn't part of the
 * real title. Handles two annotation styles:
 *
 * - Parenthesized: "Él (This Strange Passion)" — verified via exact-title match
 *   and alternate-title lookup (foreign films with English subtitles in parens).
 * - Colon-separated: "Oppenheimer: 70mm Presentation" — verified via tryColonNote.
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

  // --- Parenthesized-note verification (only when parens were stripped) ---
  if (note) {
    // Check TMDB to verify parens aren't part of the real title
    if (existingTmdbId) {
      // Already matched — check if note content resolves to the same movie
      const noteResults = await searchTMDBResults(note);
      if (noteResults.some((r) => r.id === existingTmdbId)) {
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
        if (noteResults.some((r) => r.id === rawMatch.id)) {
          const details = await getTMDBMovieDetails(rawMatch.id);
          return {
            title: rawTitle,
            note: null,
            tmdbData: details ? tmdbDetailsToMovieFields(details) : undefined,
          };
        }
      }
    }

    // Parens annotation confirmed as a real note.
    return { title: cleaned, note };
  }

  // --- Colon-note extraction: "{Real Title}: {annotation}" ---
  const colonResult = await tryColonNote(cleaned, year, existingTmdbId);
  if (colonResult) return colonResult;

  return { title: cleaned, note };
}
