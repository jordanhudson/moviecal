// Loose title comparison for deciding whether a TMDB result really is the movie
// we searched for. A wrong TMDB match becomes a movie's canonical identity
// (poster, links), so the matcher gates on this and the audit script uses it to
// flag existing mismatches — both must normalize titles the same way.

/**
 * Normalize a title for equality comparison: strip diacritics, lowercase,
 * fold "&"→"and", reduce punctuation to spaces, drop a leading article, and
 * collapse whitespace. "Amélie" and "Amelie", "Fast & Furious" and
 * "Fast and Furious", "WALL·E" and "Wall-E" all converge.
 */
export function normalizeTitle(input: string): string {
  const s = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining diacritical marks
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return s.replace(/^(the|a|an) /, '');
}

/** True when two titles match after normalization (exact — no prefix/substring). */
export function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  return na.length > 0 && na === normalizeTitle(b);
}
