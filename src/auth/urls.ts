// URL helpers shared by the OAuth routes.

// The public origin of this deployment. OAuth redirect URIs must match what's
// registered with the provider exactly, so this is configuration rather than
// something derived from the request's Host header (which is attacker-supplied
// and, behind Fly's proxy, doesn't carry the scheme).
//
// The default follows NODE_ENV (set to production in the Dockerfile) so local
// development gets an http://localhost origin without extra setup — otherwise
// the session cookie would be marked Secure and the browser would drop it.
export function baseUrl(): string {
  const fallback =
    process.env.NODE_ENV === 'production' ? 'https://movieclock.app' : 'http://localhost:3000';
  return (process.env.BASE_URL || fallback).replace(/\/$/, '');
}

// Where the provider sends the browser back. Registered per provider in the
// provider's own console.
export function redirectUriFor(providerId: string): string {
  return `${baseUrl()}/auth/${providerId}/callback`;
}

// Session cookies get the Secure flag whenever we're actually served over
// https; local http development would otherwise drop them silently.
export function usingHttps(): boolean {
  return baseUrl().startsWith('https:');
}

// Paths that must never be used as a post-login destination: bouncing back to
// the flow itself would either loop or immediately re-consume a spent code.
function isAuthPath(path: string): boolean {
  return path === '/login' || path === '/auth' || path.startsWith('/auth/');
}

// Clamp a caller-supplied "send me back here" value to a path on this site.
// Anything absolute, protocol-relative (`//evil.com`), backslash-obfuscated, or
// pointing back into the login flow falls back to the home page — an open
// redirect on a login endpoint is a phishing primitive.
export function safeReturnTo(raw: string | undefined | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (raw.includes('\\')) return '/';
  const path = raw.split(/[?#]/)[0];
  if (isAuthPath(path)) return '/';
  return raw;
}

// Same clamp, but for a Referer header: the sign-in link and the sign-out form
// carry no explicit destination, so the page the visitor came from is the
// destination. Cross-origin referers are rejected outright.
export function returnToFromReferer(referer: string | undefined | null): string {
  if (!referer) return '/';
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return '/';
  }
  if (url.origin !== baseUrl()) return '/';
  return safeReturnTo(`${url.pathname}${url.search}`);
}
