-- Apply only in an authorized isolated database first. Additive; safe to rerun.
CREATE TABLE IF NOT EXISTS ml_sync_progress (
  "organizationId" text PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  "fromDate" timestamptz NOT NULL,
  "toDate" timestamptz NOT NULL,
  cursor jsonb,
  "completedThrough" timestamptz,
  "lastAttemptAt" timestamptz NOT NULL DEFAULT now(),
  "leaseToken" text,
  "leaseUntil" timestamptz,
  "lastError" text
);
