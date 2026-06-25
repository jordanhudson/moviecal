// Utility function to clean up movie titles by removing common suffixes and annotations

export interface CleanTitleResult {
  title: string;
  note: string | null;
}

export function decodeHtmlEntities(str: string): string {
  const named: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
  };
  return str
    .replace(/&(?:amp|lt|gt|quot|apos|#039);/g, (m) => named[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/**
 * Cleans movie titles:
 * 1. Decodes HTML entities (e.g. &#8217; → ', &#038; → &)
 * 2. Strips parenthesized annotations (5+ chars) at end of title, saved as note
 *
 * Returns the cleaned title and the extracted annotation (without parens) as a note.
 */
export function cleanMovieTitle(title: string): CleanTitleResult {
  const notes: string[] = [];

  const patterns = [
    // Catch-all: any parenthesized text (5+ chars) at end of title
    /\s*\((.{5,})\)$/,
  ];

  let cleaned = decodeHtmlEntities(title);
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
