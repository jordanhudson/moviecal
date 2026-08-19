// The mechanics of the OAuth 2.0 authorization-code flow, provider-agnostic.
// Everything here is pure except `exchangeCode`, which is the one network call.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { OAuthProvider, ProviderCredentials, TokenResponse } from './providers.js';

// 256 bits of entropy, URL-safe. Used for `state`, PKCE verifiers, and session
// tokens — anything that must be unguessable.
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

// PKCE S256: the challenge goes out in the authorize request, the verifier is
// held back and presented at the token exchange, so a code intercepted in
// transit is useless without the verifier.
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// State carried across the redirect to the provider and back. It can't live in
// memory (multiple Fly machines, restarts), so it rides in a short-lived
// HttpOnly cookie; `state` is echoed by the provider and compared against the
// cookie's copy, which is what makes the callback CSRF-resistant.
export interface PendingFlow {
  provider: string;
  state: string;
  verifier: string;
  returnTo: string;
}

export function encodePendingFlow(flow: PendingFlow): string {
  return Buffer.from(JSON.stringify(flow), 'utf8').toString('base64url');
}

// Returns null rather than throwing: a malformed or truncated cookie is an
// expired/tampered flow, which the caller handles the same as a missing one.
export function decodePendingFlow(raw: string | undefined): PendingFlow | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<
      Record<keyof PendingFlow, unknown>
    >;
    if (
      typeof parsed.provider !== 'string' ||
      typeof parsed.state !== 'string' ||
      typeof parsed.verifier !== 'string' ||
      typeof parsed.returnTo !== 'string' ||
      parsed.state.length === 0
    ) {
      return null;
    }
    return {
      provider: parsed.provider,
      state: parsed.state,
      verifier: parsed.verifier,
      returnTo: parsed.returnTo,
    };
  } catch {
    return null;
  }
}

// Constant-time, and length-mismatch-safe (timingSafeEqual throws on unequal
// lengths).
export function statesMatch(a: string, b: string): boolean {
  const expected = Buffer.from(a);
  const actual = Buffer.from(b);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function buildAuthorizeUrl(
  provider: OAuthProvider,
  credentials: ProviderCredentials,
  opts: { redirectUri: string; state: string; verifier: string },
): string {
  const url = new URL(provider.authorizeUrl);
  const params = url.searchParams;
  params.set('client_id', credentials.clientId);
  params.set('redirect_uri', opts.redirectUri);
  params.set('response_type', 'code');
  params.set('scope', provider.scope);
  params.set('state', opts.state);
  if (provider.usePkce) {
    params.set('code_challenge', pkceChallenge(opts.verifier));
    params.set('code_challenge_method', 'S256');
  }
  for (const [key, value] of Object.entries(provider.authorizeParams ?? {})) {
    params.set(key, value);
  }
  return url.toString();
}

export async function exchangeCode(
  provider: OAuthProvider,
  credentials: ProviderCredentials,
  opts: { code: string; redirectUri: string; verifier: string },
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });
  if (provider.usePkce) body.set('code_verifier', opts.verifier);

  const resp = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    // The body carries the provider's error code (invalid_grant, etc.), which
    // is the only thing that makes these debuggable. It contains no secret.
    const detail = await resp.text().catch(() => '');
    throw new Error(
      `${provider.id} token exchange failed (${resp.status}): ${detail.slice(0, 300)}`,
    );
  }

  return (await resp.json()) as TokenResponse;
}
