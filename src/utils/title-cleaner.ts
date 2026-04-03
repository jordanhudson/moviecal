// Utility function to clean up movie titles by removing common suffixes and annotations

export interface CleanTitleResult {
  title: string;
  note: string | null;
}

/**
 * Removes common annotations from movie titles like:
 * - (Final Screening)
 * - (50th Anniversary Edition)
 * - (4K Restoration)
 * - (French w/e.s.t.)
 * - (Korean w/ e.s.t.)
 * etc.
 *
 * Returns the cleaned title and the extracted annotations (without parens) as a note.
 */
export function cleanMovieTitle(title: string): CleanTitleResult {
  const notes: string[] = [];

  const patterns = [
    // Catch-all: any parenthesized text (5+ chars) at end of title
    /\s*\((.{5,})\)$/,
  ];

  let cleaned = title;
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, (_match, captured) => {
      notes.push(captured.trim());
      return '';
    });
  }

  return {
    title: cleaned.trim(),
    note: notes.length > 0 ? notes.join('; ') : null,
  };
}
