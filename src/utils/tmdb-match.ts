// The single title-gated TMDB matcher, shared by the scrape pipeline, the
// audit, and the re-match script. A wrong match becomes a movie's canonical
// identity (poster, links), so matching is precision-first: only accept a
// result whose title actually matches, and return null otherwise.

import { getTMDBMovieDetails, getAlternativeTitles } from './tmdb.js';
import type { TMDBMovieDetails } from './tmdb.js';
import { titlesMatch } from './title-match.js';

interface TMDBSearchHit {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
}

async function searchTMDB(title: string, year?: number | null): Promise<TMDBSearchHit[]> {
  const apiToken = process.env.TMDB_API_TOKEN;
  if (!apiToken) return [];

  let url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}`;
  if (year) url += `&year=${year}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    console.warn(`TMDB search failed for "${title}": ${response.status}`);
    return [];
  }
  const data = (await response.json()) as { results?: TMDBSearchHit[] };
  return data.results ?? [];
}

/**
 * Title-gated match: among TMDB search results, keep only those whose title or
 * original title matches the query, drop shorts (< 60 min), then disambiguate
 * same-titled films by release year and finally closest runtime. Returns the
 * chosen movie's full details, or null when nothing matches the title.
 */
export async function findGatedTMDBMatch(
  title: string,
  year?: number | null,
  runtime?: number | null,
): Promise<TMDBMovieDetails | null> {
  const results = await searchTMDB(title, year);

  const titleMatches = results.filter(
    (r) =>
      titlesMatch(title, r.title) ||
      (r.original_title != null && titlesMatch(title, r.original_title)),
  );
  if (titleMatches.length === 0) return null;

  const detailsMap = new Map<number, TMDBMovieDetails>();
  const candidates: TMDBSearchHit[] = [];
  for (const hit of titleMatches) {
    const details = await getTMDBMovieDetails(hit.id);
    if (details) {
      detailsMap.set(hit.id, details);
      if (details.runtime && details.runtime >= 60) candidates.push(hit);
    }
  }
  if (candidates.length === 0) return null;

  let pool = candidates;
  if (year) {
    const sameYear = pool.filter(
      (r) => r.release_date && parseInt(r.release_date.substring(0, 4), 10) === year,
    );
    if (sameYear.length > 0) pool = sameYear;
  }

  let chosen = pool[0];
  if (pool.length > 1 && runtime) {
    let smallestDiff = Infinity;
    for (const hit of pool) {
      const details = detailsMap.get(hit.id);
      if (details && details.runtime) {
        const diff = Math.abs(details.runtime - runtime);
        if (diff < smallestDiff) {
          smallestDiff = diff;
          chosen = hit;
        }
      }
    }
  }

  return detailsMap.get(chosen.id) ?? null;
}

/**
 * Whether a movie's stored title still matches the TMDB record its tmdb_id
 * points at — checked against the primary title, original title, and (only if
 * those miss) the registered alternative titles. A `false` is the "likely wrong
 * match" signal the audit and re-match tooling key on.
 */
export async function currentTitleMatchesStored(
  storedTitle: string,
  tmdbId: number,
): Promise<{ matches: boolean; details: TMDBMovieDetails | null }> {
  const details = await getTMDBMovieDetails(tmdbId);
  if (!details) return { matches: true, details: null }; // can't fetch — don't flag

  if (
    titlesMatch(storedTitle, details.title) ||
    (details.original_title != null && titlesMatch(storedTitle, details.original_title))
  ) {
    return { matches: true, details };
  }

  const alts = await getAlternativeTitles(tmdbId);
  return { matches: alts.some((t) => titlesMatch(storedTitle, t)), details };
}
