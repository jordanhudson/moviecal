// Serialize a value as JSON safe to embed inside an inline <script> tag.
// Plain JSON.stringify is NOT safe there: scraped content (e.g. a movie title)
// containing "</script>" would terminate the script element and inject markup.
// Escaping <, >, & as \uXXXX keeps the JSON semantics identical while making
// the output inert in an HTML context. U+2028/U+2029 are escaped because they
// are valid in JSON strings but are line terminators in JavaScript source.
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

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
