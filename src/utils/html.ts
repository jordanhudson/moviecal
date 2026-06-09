// Validates the URL protocol only. Escaping is left to the JSX renderer:
// hono/jsx escapes attribute values, so escaping here would double-escape
// (`&` became `&amp;amp;` in the HTML, breaking multi-param booking URLs).
export function safeHref(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return url;
    }
  } catch {}
  return '#';
}
