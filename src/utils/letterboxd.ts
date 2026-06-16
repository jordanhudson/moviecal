// Letterboxd exposes a redirect endpoint that maps a TMDB id to the canonical
// film page: GET https://letterboxd.com/tmdb/{id}/ responds 302 with a
// Location header pointing at /film/{slug}/. We resolve (not follow) the
// redirect so we capture the canonical URL without loading the film page.
export async function searchLetterboxdByTmdbId(tmdbId: number): Promise<string | null> {
  try {
    const response = await fetch(`https://letterboxd.com/tmdb/${tmdbId}/`, {
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location && location.includes('/film/')) {
        // Normalize to an absolute URL (Location may be relative).
        return new URL(location, 'https://letterboxd.com').toString();
      }
    }

    return null;
  } catch (error) {
    console.warn(`Error searching Letterboxd for TMDB id ${tmdbId}:`, error);
    return null;
  }
}
