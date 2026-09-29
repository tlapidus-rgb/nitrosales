-- Prepared migration: execute only in an explicitly authorized isolated database.
-- Separate table: does not alter ml-sync's existing key or cursor format.
CREATE TABLE IF NOT EXISTS ml_reconcile_progress (
  "organizationId" text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  layer text NOT NULL CHECK (layer IN ('incremental', 'deep')),
  "toDate" timestamptz NOT NULL,
  cursor jsonb,
  "leaseToken" text,
  "leaseUntil" timestamptz,
  "lastAttemptAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("organizationId", layer)
);
