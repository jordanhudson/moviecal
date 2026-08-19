// OAuth provider registry.
//
// Login is OAuth-only. Google is the only provider wired up today, but every
// provider-specific detail lives in one entry of the LIST below — endpoints,
// scopes, which env vars carry its credentials, how to turn its token response
// into a profile, and which host serves its avatars (so the CSP can allow it).
// Adding a second provider is one more entry plus its two env vars; nothing in
// the routes, session layer, or UI is provider-aware.

import { assertIdTokenClaims, decodeJwtPayload } from './jwt.js';

// What a provider tells us about the person who just signed in.
export interface OAuthProfile {
  // Stable, provider-scoped id. Never an email — emails get reassigned.
  providerUserId: string;
  email: string | null;
  // Only a provider-verified email is trusted enough to link two identities to
  // one account; an unverified one would let a fake account claim a real inbox.
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

// The subset of an OAuth token response we care about. Providers are free to
// return more.
export interface TokenResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
}

export interface OAuthProvider {
  id: string;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  // PKCE is required for some providers and harmless for the rest; it removes
  // the value of a stolen authorization code.
  usePkce: boolean;
  // Extra provider-specific query params on the authorize request.
  authorizeParams?: Record<string, string>;
  // Hosts this provider serves profile pictures from, folded into img-src.
  avatarHosts: readonly string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  profile(tokens: TokenResponse, credentials: ProviderCredentials): Promise<OAuthProfile>;
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const google: OAuthProvider = {
  id: 'google',
  label: 'Google',
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scope: 'openid email profile',
  usePkce: true,
  authorizeParams: {
    // We never call Google's APIs on the user's behalf, so no refresh token.
    access_type: 'online',
    // Always let the visitor pick which Google account, rather than silently
    // reusing whichever one the browser is already signed into.
    prompt: 'select_account',
  },
  avatarHosts: ['https://lh3.googleusercontent.com'],
  clientIdEnv: 'GOOGLE_CLIENT_ID',
  clientSecretEnv: 'GOOGLE_CLIENT_SECRET',

  async profile(tokens, credentials) {
    // Google returns the full profile in the id_token, so there's no second
    // round trip to a userinfo endpoint.
    if (!tokens.id_token) throw new Error('Google token response had no id_token');
    const claims = decodeJwtPayload(tokens.id_token);
    assertIdTokenClaims(claims, { issuers: GOOGLE_ISSUERS, clientId: credentials.clientId });

    return {
      providerUserId: String(claims.sub),
      email: typeof claims.email === 'string' ? claims.email : null,
      emailVerified: claims.email_verified === true,
      name: typeof claims.name === 'string' ? claims.name : null,
      avatarUrl: typeof claims.picture === 'string' ? claims.picture : null,
    };
  },
};

export const PROVIDERS: readonly OAuthProvider[] = [google];

export function getProvider(id: string): OAuthProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

// Credentials come from the environment, so a provider is "available" only on
// deployments that have configured it. Returns null when either half is missing
// — a half-configured provider should look absent, not fail mid-flow.
export function credentialsFor(provider: OAuthProvider): ProviderCredentials | null {
  const clientId = process.env[provider.clientIdEnv];
  const clientSecret = process.env[provider.clientSecretEnv];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function configuredProviders(): OAuthProvider[] {
  return PROVIDERS.filter((p) => credentialsFor(p) !== null);
}

// Avatar hosts of the providers this deployment actually uses, for img-src.
export function avatarImgSrc(): string[] {
  return [...new Set(configuredProviders().flatMap((p) => [...p.avatarHosts]))];
}
