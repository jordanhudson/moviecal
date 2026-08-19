import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertIdTokenClaims, decodeJwtPayload } from './jwt.js';
import {
  buildAuthorizeUrl,
  decodePendingFlow,
  encodePendingFlow,
  pkceChallenge,
  randomToken,
  statesMatch,
} from './oauth.js';
import { getProvider, credentialsFor, configuredProviders, avatarImgSrc } from './providers.js';
import { returnToFromReferer, safeReturnTo } from './urls.js';

// --- helpers -------------------------------------------------------------

function jwt(payload: object): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(payload)}.signature`;
}

// Each test that depends on env sets what it needs and restores after.
function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// --- return-to clamping --------------------------------------------------
// An open redirect on a login route is a phishing primitive, so these are the
// most security-relevant assertions in the file.

test('safeReturnTo keeps same-site paths', () => {
  assert.equal(safeReturnTo('/movies'), '/movies');
  assert.equal(
    safeReturnTo('/movie/1294-grave-of-the-fireflies'),
    '/movie/1294-grave-of-the-fireflies',
  );
  assert.equal(safeReturnTo('/date/2026-07-28?view=timeline'), '/date/2026-07-28?view=timeline');
});

test('safeReturnTo rejects anything that could leave the site', () => {
  assert.equal(safeReturnTo('https://evil.example/phish'), '/');
  assert.equal(safeReturnTo('//evil.example/phish'), '/');
  assert.equal(safeReturnTo('/\\evil.example'), '/');
  assert.equal(safeReturnTo('/movies\\@evil.example'), '/');
  assert.equal(safeReturnTo('javascript:alert(1)'), '/');
  assert.equal(safeReturnTo(''), '/');
  assert.equal(safeReturnTo(undefined), '/');
});

test('safeReturnTo refuses to bounce back into the login flow', () => {
  assert.equal(safeReturnTo('/login'), '/');
  assert.equal(safeReturnTo('/login?error=failed'), '/');
  assert.equal(safeReturnTo('/auth/google'), '/');
  assert.equal(safeReturnTo('/auth/google/callback?code=abc'), '/');
});

test('returnToFromReferer only trusts our own origin', () => {
  withEnv({ BASE_URL: 'https://movieclock.app' }, () => {
    assert.equal(returnToFromReferer('https://movieclock.app/movies'), '/movies');
    assert.equal(
      returnToFromReferer('https://movieclock.app/theatre/The%20Rio'),
      '/theatre/The%20Rio',
    );
    // Different origin, no referer, or a referer from the flow itself.
    assert.equal(returnToFromReferer('https://evil.example/movies'), '/');
    assert.equal(returnToFromReferer('http://movieclock.app/movies'), '/');
    assert.equal(returnToFromReferer('not a url'), '/');
    assert.equal(returnToFromReferer(undefined), '/');
    assert.equal(returnToFromReferer('https://movieclock.app/auth/google/callback?code=x'), '/');
  });
});

// --- pending-flow cookie -------------------------------------------------

test('pending flow survives an encode/decode round trip', () => {
  const flow = {
    provider: 'google',
    state: randomToken(),
    verifier: randomToken(),
    returnTo: '/movies',
  };
  assert.deepEqual(decodePendingFlow(encodePendingFlow(flow)), flow);
});

test('decodePendingFlow returns null for anything unusable', () => {
  assert.equal(decodePendingFlow(undefined), null);
  assert.equal(decodePendingFlow(''), null);
  assert.equal(decodePendingFlow('not-base64url-json'), null);
  // Well-formed base64url, wrong shape.
  const encode = (o: object) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
  assert.equal(decodePendingFlow(encode({ provider: 'google' })), null);
  assert.equal(
    decodePendingFlow(encode({ provider: 'google', state: '', verifier: 'v', returnTo: '/' })),
    null,
  );
  assert.equal(decodePendingFlow(encode(['google'])), null);
});

test('statesMatch is exact and tolerates length mismatches', () => {
  const state = randomToken();
  assert.equal(statesMatch(state, state), true);
  assert.equal(statesMatch(state, state.slice(0, -1)), false);
  assert.equal(statesMatch(state, randomToken()), false);
  assert.equal(statesMatch('', ''), true);
});

// --- PKCE ----------------------------------------------------------------

test('pkceChallenge is the base64url SHA-256 of the verifier', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const expected = createHash('sha256').update(verifier).digest('base64url');
  assert.equal(pkceChallenge(verifier), expected);
  // base64url: no padding or +/ characters that would need escaping in a URL.
  assert.match(pkceChallenge(verifier), /^[A-Za-z0-9_-]+$/);
});

test('randomToken is URL-safe and unguessable', () => {
  const a = randomToken();
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.ok(a.length >= 43); // 32 bytes of entropy
  assert.notEqual(a, randomToken());
});

// --- authorize URL -------------------------------------------------------

test('buildAuthorizeUrl carries the OAuth + PKCE parameters', () => {
  const provider = getProvider('google')!;
  const url = new URL(
    buildAuthorizeUrl(
      provider,
      { clientId: 'client-123', clientSecret: 'secret' },
      {
        redirectUri: 'https://movieclock.app/auth/google/callback',
        state: 'state-abc',
        verifier: 'verifier-xyz',
      },
    ),
  );

  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'client-123');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://movieclock.app/auth/google/callback');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(url.searchParams.get('state'), 'state-abc');
  assert.equal(url.searchParams.get('code_challenge'), pkceChallenge('verifier-xyz'));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  // Provider-specific extras.
  assert.equal(url.searchParams.get('prompt'), 'select_account');
  // The secret never belongs in a URL the browser sees.
  assert.equal(url.toString().includes('secret'), false);
});

// --- id_token handling ---------------------------------------------------

test('decodeJwtPayload reads the claims segment', () => {
  const claims = decodeJwtPayload(jwt({ sub: '1234', email: 'a@example.com' }));
  assert.equal(claims.sub, '1234');
  assert.equal(claims.email, 'a@example.com');
});

test('decodeJwtPayload rejects malformed tokens', () => {
  assert.throws(() => decodeJwtPayload('nope'));
  assert.throws(() => decodeJwtPayload('a.b'));
  assert.throws(() => decodeJwtPayload(jwt(['not', 'an', 'object'] as unknown as object)));
});

test('assertIdTokenClaims accepts a well-formed Google token', () => {
  const now = Date.UTC(2026, 6, 28);
  assert.doesNotThrow(() =>
    assertIdTokenClaims(
      { iss: 'https://accounts.google.com', aud: 'client-123', sub: '1', exp: now / 1000 + 600 },
      { issuers: ['https://accounts.google.com'], clientId: 'client-123', now },
    ),
  );
});

test('assertIdTokenClaims rejects wrong audience, issuer, expiry, or subject', () => {
  const now = Date.UTC(2026, 6, 28);
  const expected = { issuers: ['https://accounts.google.com'], clientId: 'client-123', now };
  const valid = {
    iss: 'https://accounts.google.com',
    aud: 'client-123',
    sub: '1',
    exp: now / 1000 + 600,
  };

  // A token minted for a *different* client is the classic confused-deputy
  // case: valid, correctly signed, and not ours.
  assert.throws(() => assertIdTokenClaims({ ...valid, aud: 'other-client' }, expected), /audience/);
  assert.throws(
    () => assertIdTokenClaims({ ...valid, iss: 'https://evil.example' }, expected),
    /issuer/,
  );
  assert.throws(() => assertIdTokenClaims({ ...valid, exp: now / 1000 - 1 }, expected), /expired/);
  assert.throws(() => assertIdTokenClaims({ ...valid, exp: undefined }, expected), /expired/);
  assert.throws(() => assertIdTokenClaims({ ...valid, sub: undefined }, expected), /subject/);
  // `aud` may legitimately be an array containing our client id.
  assert.doesNotThrow(() =>
    assertIdTokenClaims({ ...valid, aud: ['other', 'client-123'] }, expected),
  );
});

test("google profile comes from the id_token's claims", async () => {
  const provider = getProvider('google')!;
  const credentials = { clientId: 'client-123', clientSecret: 'secret' };
  const profile = await provider.profile(
    {
      id_token: jwt({
        iss: 'https://accounts.google.com',
        aud: 'client-123',
        sub: '110248495921238986420',
        exp: Math.floor(Date.now() / 1000) + 600,
        email: 'Person@Example.com',
        email_verified: true,
        name: 'A Person',
        picture: 'https://lh3.googleusercontent.com/a/abc',
      }),
    },
    credentials,
  );

  assert.deepEqual(profile, {
    providerUserId: '110248495921238986420',
    email: 'Person@Example.com',
    emailVerified: true,
    name: 'A Person',
    avatarUrl: 'https://lh3.googleusercontent.com/a/abc',
  });
});

test('google profile treats a missing or non-true email_verified as unverified', async () => {
  const provider = getProvider('google')!;
  const credentials = { clientId: 'client-123', clientSecret: 'secret' };
  const base = {
    iss: 'https://accounts.google.com',
    aud: 'client-123',
    sub: '1',
    exp: Math.floor(Date.now() / 1000) + 600,
    email: 'person@example.com',
  };

  assert.equal((await provider.profile({ id_token: jwt(base) }, credentials)).emailVerified, false);
  assert.equal(
    (await provider.profile({ id_token: jwt({ ...base, email_verified: 'true' }) }, credentials))
      .emailVerified,
    false,
  );
});

test('google profile requires an id_token', async () => {
  const provider = getProvider('google')!;
  await assert.rejects(
    () => provider.profile({ access_token: 'x' }, { clientId: 'c', clientSecret: 's' }),
    /id_token/,
  );
});

// --- provider registry ---------------------------------------------------

test('a provider missing either credential half counts as unconfigured', () => {
  const provider = getProvider('google')!;
  withEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: undefined }, () => {
    assert.equal(credentialsFor(provider), null);
    assert.deepEqual(configuredProviders(), []);
    assert.deepEqual(avatarImgSrc(), []);
  });
  withEnv({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: 'secret' }, () => {
    assert.equal(credentialsFor(provider), null);
  });
  withEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }, () => {
    assert.deepEqual(credentialsFor(provider), { clientId: 'id', clientSecret: 'secret' });
    assert.deepEqual(
      configuredProviders().map((p) => p.id),
      ['google'],
    );
    assert.deepEqual(avatarImgSrc(), ['https://lh3.googleusercontent.com']);
  });
});

test('unknown providers are not resolvable', () => {
  assert.equal(getProvider('facebook'), undefined);
  assert.equal(getProvider(''), undefined);
});
