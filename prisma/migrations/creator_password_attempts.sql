-- Apply before deploying creator-password.ts. Not applied by this change.
CREATE TABLE IF NOT EXISTS creator_password_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS creator_password_attempts_expiry_idx
  ON creator_password_attempts (expires_at);
-- Periodic retention, in bounded batches:
-- DELETE FROM creator_password_attempts WHERE key IN (
--   SELECT key FROM creator_password_attempts WHERE expires_at < now() - interval '1 day'
--   ORDER BY expires_at LIMIT 10000
-- );
