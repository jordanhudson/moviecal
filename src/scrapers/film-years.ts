// Release-year helpers shared by scrapers. Venue listing feeds rarely carry a
// film's year, but it's what lets the TMDB matcher tell a new film from an
// older one with the same title (e.g. 2026's "Atonement" vs. the 2007 one).

/**
 * Year from a programme credits line — "TONY (Matt Johnson, 2026 / 106 mins /
 * 14A)" — the format the Park and Rio write their film descriptions in. Keyed
 * on "(…, YEAR /" because the fields after the year vary in order ("2026 / 14A
 * / 105 mins"). Returns the first credits line found, i.e. the headline film.
 */
export function extractCreditsYear(text: string): number | null {
  const m = text.match(/\([^()]+?,\s*((?:18|19|20)\d{2})\s*\//);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Fetch each film page (a few at a time) and pull a year out of it with
 * `extract`. Best-effort: a page that fails to load maps to null.
 */
export async function fetchFilmYears(
  urls: Iterable<string>,
  extract: (html: string) => number | null,
): Promise<Map<string, number | null>> {
  const years = new Map<string, number | null>();
  const queue = [...new Set(urls)].filter(Boolean);
  const worker = async () => {
    while (queue.length > 0) {
      const url = queue.shift()!;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        years.set(url, response.ok ? extract(await response.text()) : null);
      } catch (error) {
        console.warn(`Could not fetch film page ${url}:`, (error as Error).message);
        years.set(url, null);
      }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  return years;
}
