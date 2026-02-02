// Utility function to clean up movie titles by removing common suffixes and annotations

/**
 * Removes common annotations from movie titles like:
 * - (Final Screening)
 * - (50th Anniversary Edition)
 * - (4K Restoration)
 * etc.
 */
export function cleanMovieTitle(title: string): string {
  return title
    .replace(/\s*\(Final Screening\)\s*/gi, '')
    .replace(/\s*\(Film Screening\)\s*/gi, '')
    .replace(/\s*\(.+?\s+Anniversary\s+Edition\)\s*/gi, '')
    .replace(/\s*\(.+?\s+Restoration\)\s*/gi, '')
    .trim();
}
