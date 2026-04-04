import { decodeHtmlEntities } from './title-cleaner.js';

function slugify(title: string): string {
  return decodeHtmlEntities(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractYearFromLetterboxd(html: string): number | null {
  const match = html.match(/<title>[^<]*\((\d{4})\)/);
  return match ? parseInt(match[1], 10) : null;
}

export async function searchLetterboxd(title: string, year: number | null): Promise<string | null> {
  const slug = slugify(title);

  try {
    const url = `https://letterboxd.com/film/${slug}/`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });

    if (response.ok) {
      const html = await response.text();
      const pageYear = extractYearFromLetterboxd(html);

      if (year && pageYear && pageYear !== year) {
        // Year mismatch — likely a different film with same title, try slug-year
      } else {
        return response.url;
      }
    }

    // Try slug-year if we have a year
    if (year) {
      const yearUrl = `https://letterboxd.com/film/${slug}-${year}/`;
      const yearResponse = await fetch(yearUrl, {
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow',
      });

      if (yearResponse.ok) {
        return yearResponse.url;
      }
    }

    return null;
  } catch (error) {
    console.warn(`Error searching Letterboxd for "${title}":`, error);
    return null;
  }
}
