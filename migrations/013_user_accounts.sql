-- User accounts, OAuth identities, and sessions.
--
-- Login is OAuth-only — there is no password column anywhere by design. An
-- `app_user` is the person; a `user_identity` is one provider login (Google
-- today, others later) pointing at them, so the same person signing in with a
-- second provider later links to the existing account instead of forking it.
--
-- Sessions are server-side and opaque: the cookie holds a random token, the
-- table holds only its SHA-256, so a dump of this table can't be replayed as a
-- login. Rows are deleted on sign-out and swept once they expire.

CREATE TABLE IF NOT EXISTS app_user (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive uniqueness: providers hand back mixed-case addresses, and
-- two casings of the same mailbox are the same person. Partial, because a
-- provider that declines to share an email still gets an account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_email_unique
  ON app_user (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_identity (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_identity_user_id ON user_identity(user_id);

CREATE TABLE IF NOT EXISTS user_session (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_session_user_id ON user_session(user_id);
CREATE INDEX IF NOT EXISTS idx_user_session_expires_at ON user_session(expires_at);
