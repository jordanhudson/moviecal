// Minimal JWT payload reader for OIDC id_tokens.
//
// Deliberately does NOT verify the signature. We only ever read tokens fetched
// by the server itself, over TLS, directly from the provider's token endpoint
// in exchange for a client secret — the channel is the proof of authenticity,
// which is exactly the case Google documents as not requiring local validation.
// (Anything received via the browser, or from a discovery-less third party,
// would need full JWKS verification instead — don't reuse this for that.)

export interface JwtClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  [claim: string]: unknown;
}

export function decodeJwtPayload(token: string): JwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT: expected three dot-separated segments');
  }
  const json = Buffer.from(parts[1], 'base64url').toString('utf8');
  const claims = JSON.parse(json) as unknown;
  if (typeof claims !== 'object' || claims === null || Array.isArray(claims)) {
    throw new Error('Malformed JWT: payload is not an object');
  }
  return claims as JwtClaims;
}

// The checks that still matter once the transport has established who sent the
// token: that it was minted for *us*, by the issuer we expect, and hasn't
// expired. `aud` may be a single value or an array.
export function assertIdTokenClaims(
  claims: JwtClaims,
  expected: { issuers: string[]; clientId: string; now?: number },
): void {
  const now = expected.now ?? Date.now();

  if (!claims.iss || !expected.issuers.includes(claims.iss)) {
    throw new Error(`id_token issuer mismatch: ${claims.iss}`);
  }

  const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (!audiences.includes(expected.clientId)) {
    throw new Error('id_token audience mismatch');
  }

  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) {
    throw new Error('id_token is expired');
  }

  if (!claims.sub) {
    throw new Error('id_token has no subject');
  }
}
