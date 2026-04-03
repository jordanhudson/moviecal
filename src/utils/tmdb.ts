// Shared TMDB API helpers

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
