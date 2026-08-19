// OAuth login routes: /login, /auth/:provider, /auth/:provider/callback,
// and POST /auth/logout.
//
// Nothing here is Google-specific — the provider comes out of the registry in
// src/auth/providers.ts, so a second provider needs no changes in this file.

import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AuthEnv } from '../auth/middleware.js';
import { currentUser } from '../auth/middleware.js';
import { configuredProviders, credentialsFor, getProvider } from '../auth/providers.js';
import {
  buildAuthorizeUrl,
  decodePendingFlow,
  encodePendingFlow,
  exchangeCode,
  randomToken,
  statesMatch,
} from '../auth/oauth.js';
import {
  createSession,
  clearSessionCookie,
  destroySession,
  getSessionToken,
  setSessionCookie,
} from '../auth/session.js';
import { findOrCreateUser } from '../auth/users.js';
import { redirectUriFor, returnToFromReferer, safeReturnTo, usingHttps } from '../auth/urls.js';
import { renderLoginPage } from '../pages/login.js';

export const authRoutes = new Hono<AuthEnv>();

// Holds the in-flight authorization request (state + PKCE verifier + where the
// visitor was headed) across the round trip to the provider. It can't be kept
// in memory — Fly runs more than one machine and restarts freely — so it rides
// in a short-lived cookie scoped to the flow's own path.
const OAUTH_COOKIE = 'mc_oauth';
const OAUTH_COOKIE_PATH = '/auth';
const OAUTH_TTL_SECONDS = 600;

function loginRedirect(error: string, returnTo: string): string {
  const params = new URLSearchParams({ error });
  if (returnTo !== '/') params.set('next', returnTo);
  return `/login?${params.toString()}`;
}

// Where to send the visitor afterwards: an explicit ?next= wins, otherwise the
// page they came from. Both are clamped to same-site paths.
function destinationFor(c: Context): string {
  const explicit = c.req.query('next');
  if (explicit) return safeReturnTo(explicit);
  return returnToFromReferer(c.req.header('referer'));
}

authRoutes.get('/login', (c) => {
  return c.html(
    renderLoginPage(configuredProviders(), {
      returnTo: destinationFor(c),
      error: c.req.query('error'),
      user: currentUser(c),
    }),
  );
});

// Kick off the flow.
authRoutes.get('/auth/:provider', (c) => {
  const returnTo = destinationFor(c);

  // Already signed in — nothing to do but go where they were headed.
  if (currentUser(c)) return c.redirect(returnTo);

  const provider = getProvider(c.req.param('provider'));
  const credentials = provider ? credentialsFor(provider) : null;
  if (!provider || !credentials) {
    return c.redirect(loginRedirect('provider', returnTo));
  }

  const state = randomToken();
  const verifier = randomToken();

  setCookie(
    c,
    OAUTH_COOKIE,
    encodePendingFlow({ provider: provider.id, state, verifier, returnTo }),
    {
      httpOnly: true,
      secure: usingHttps(),
      // Lax so the cookie survives the provider's top-level redirect back to us.
      sameSite: 'Lax',
      path: OAUTH_COOKIE_PATH,
      maxAge: OAUTH_TTL_SECONDS,
    },
  );

  return c.redirect(
    buildAuthorizeUrl(provider, credentials, {
      redirectUri: redirectUriFor(provider.id),
      state,
      verifier,
    }),
  );
});

// Come back from the provider.
authRoutes.get('/auth/:provider/callback', async (c) => {
  const pending = decodePendingFlow(getCookie(c, OAUTH_COOKIE));
  // Single-use: clear it before doing anything else, so a replayed callback
  // can't reuse the state or verifier.
  deleteCookie(c, OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH, secure: usingHttps() });

  const returnTo = pending ? safeReturnTo(pending.returnTo) : '/';

  // The visitor declined at the provider's consent screen (or it refused us).
  const providerError = c.req.query('error');
  if (providerError) {
    if (providerError !== 'access_denied') {
      console.error(`OAuth provider returned error: ${providerError}`);
    }
    return c.redirect(
      loginRedirect(providerError === 'access_denied' ? 'denied' : 'failed', returnTo),
    );
  }

  const providerId = c.req.param('provider');
  const state = c.req.query('state');
  const code = c.req.query('code');

  // The state check is the CSRF defence: the value in the query has to be the
  // one we minted into the HttpOnly cookie for this same provider.
  if (
    !pending ||
    !state ||
    !code ||
    pending.provider !== providerId ||
    !statesMatch(pending.state, state)
  ) {
    return c.redirect(loginRedirect('expired', returnTo));
  }

  const provider = getProvider(providerId);
  const credentials = provider ? credentialsFor(provider) : null;
  if (!provider || !credentials) {
    return c.redirect(loginRedirect('provider', returnTo));
  }

  try {
    const tokens = await exchangeCode(provider, credentials, {
      code,
      redirectUri: redirectUriFor(provider.id),
      verifier: pending.verifier,
    });
    const profile = await provider.profile(tokens, credentials);
    const user = await findOrCreateUser(provider.id, profile);
    setSessionCookie(c, await createSession(user.id));
    return c.redirect(returnTo);
  } catch (err) {
    // Anything from here on is our problem, not the visitor's: bad credentials,
    // a spent code, TMDB-style flakiness at the provider, or the DB being down.
    console.error(`Sign-in with ${providerId} failed:`, err);
    return c.redirect(loginRedirect('failed', returnTo));
  }
});

// POST, not GET: a link would let any page (or a prefetching browser) sign the
// visitor out. The form lives in the nav's account menu.
authRoutes.post('/auth/logout', async (c) => {
  const token = getSessionToken(c);
  if (token) {
    try {
      await destroySession(token);
    } catch (err) {
      // Cookie still gets cleared, so the visitor is signed out here regardless.
      console.error('Failed to delete session row:', (err as Error).message);
    }
  }
  clearSessionCookie(c);
  // 303: turn the POST into a GET on the page they were on.
  return c.redirect(returnToFromReferer(c.req.header('referer')), 303);
});
