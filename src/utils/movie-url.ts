import { decodeHtmlEntities } from './title-cleaner.js';

function slugify(title: string): string {
  return decodeHtmlEntities(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function movieUrl(id: number, title: string): string {
  const slug = slugify(title);
  return slug ? `/movie/${id}-${slug}` : `/movie/${id}`;
}
