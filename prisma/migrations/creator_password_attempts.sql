-- Apply before deploying creator-password.ts. Not applied by this change.
CREATE TABLE IF NOT EXISTS creator_password_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS creator_password_attempts_expiry_idx
  ON creator_password_attempts (expires_at);
-- Periodic bounded cleanup is implemented in src/lib/creator-password-cleanup.ts.
-- Called by warm-cache when its time budget permits. Validate DELETE permissions.
