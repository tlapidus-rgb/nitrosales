-- Prepare in an isolated database first. Do not run on production implicitly.
-- Before rollout, drain old workers: old binaries do not enforce fencing.
ALTER TABLE "backfill_jobs" ADD COLUMN IF NOT EXISTS "leaseToken" TEXT;
-- Additive and repeatable. Rollback requires stopping all new workers before
-- reverting code; retain the nullable column to avoid invalidating live leases.
