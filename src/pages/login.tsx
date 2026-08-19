/** @jsxImportSource hono/jsx */
import { renderPage } from './layout.js';
import type { SessionUser } from '../auth/session.js';
import type { OAuthProvider } from '../auth/providers.js';

// Provider marks live here rather than in the provider registry: the registry is
// configuration (endpoints, scopes, credentials), this is presentation. A
// provider with no mark just renders its label.
const providerIcons: Record<string, string> = {
  google:
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>',
};

// Human-readable text for the `error` codes the callback route redirects with.
// Deliberately vague about *why* a state check failed — that detail helps an
// attacker probe and helps a real visitor not at all.
const errorMessages: Record<string, string> = {
  denied: 'Sign-in was cancelled.',
  expired: 'That sign-in attempt expired. Please try again.',
  provider: "That sign-in method isn't available.",
  failed: "We couldn't complete sign-in. Please try again.",
};

export function renderLoginPage(
  providers: OAuthProvider[],
  opts: { returnTo: string; error?: string; user: SessionUser | null },
): string {
  const error = opts.error ? (errorMessages[opts.error] ?? errorMessages.failed) : null;
  const next = opts.returnTo && opts.returnTo !== '/' ? opts.returnTo : null;

  return renderPage({
    title: 'Sign in — MovieClock',
    description: 'Sign in to MovieClock.',
    // A login form is not a search result.
    noindex: true,
    styles: ['/css/login.css'],
    user: opts.user,
    body: (
      <div class="login-wrap">
        <div class="login-card">
          <h1 class="login-title">Sign in</h1>

          {opts.user ? (
            <>
              <p class="login-sub">
                You're already signed in{opts.user.email ? ` as ${opts.user.email}` : ''}.
              </p>
              <a class="login-back" href="/">
                Back to showtimes
              </a>
            </>
          ) : (
            <>
              <p class="login-sub">
                MovieClock uses your existing account elsewhere — there's no password to make or
                remember.
              </p>

              {error && (
                <p class="login-error" role="alert">
                  {error}
                </p>
              )}

              {providers.length === 0 ? (
                <p class="login-error" role="alert">
                  Sign-in isn't configured on this deployment yet.
                </p>
              ) : (
                <div class="login-providers">
                  {providers.map((p) => (
                    <a
                      class="login-provider"
                      href={`/auth/${p.id}${next ? `?next=${encodeURIComponent(next)}` : ''}`}
                      rel="nofollow"
                    >
                      {providerIcons[p.id] && (
                        <span
                          class="login-provider-icon"
                          aria-hidden="true"
                          dangerouslySetInnerHTML={{ __html: providerIcons[p.id] }}
                        />
                      )}
                      Continue with {p.label}
                    </a>
                  ))}
                </div>
              )}

              <p class="login-fine">
                We store the name, email, and profile picture your provider shares, and nothing
                else.
              </p>
            </>
          )}
        </div>
      </div>
    ),
  });
}
