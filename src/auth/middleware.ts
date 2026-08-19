// Populates `c.get('user')` for every request, so pages can render the nav
// without each route doing its own session lookup.

import type { Context, MiddlewareHandler } from 'hono';
import {
  clearSessionCookie,
  getSessionToken,
  loadSession,
  setSessionCookie,
  type SessionUser,
} from './session.js';

export interface AuthEnv {
  Variables: {
    user: SessionUser | null;
  };
}

export const sessionMiddleware: MiddlewareHandler<AuthEnv> = async (c, next) => {
  c.set('user', null);

  const token = getSessionToken(c);
  if (token) {
    try {
      const session = await loadSession(token);
      if (session) {
        c.set('user', session.user);
        // Rolled-forward expiry: re-issue the cookie so its Max-Age tracks the
        // row, otherwise the browser would drop it 30 days after sign-in no
        // matter how active the visitor was.
        if (session.renewed) setSessionCookie(c, token);
      } else {
        // Revoked or expired server-side — stop sending the dead token.
        clearSessionCookie(c);
      }
    } catch (err) {
      // The site is fully usable signed-out (and error pages render with the DB
      // down), so a session lookup failure degrades to anonymous rather than 500.
      console.error('Session lookup failed:', (err as Error).message);
    }
  }

  await next();
};

// Reads the current user from any context, including ones where the middleware
// never ran (the error handler can fire before it).
export function currentUser(c: Context): SessionUser | null {
  return (c.get('user') as SessionUser | undefined) ?? null;
}
