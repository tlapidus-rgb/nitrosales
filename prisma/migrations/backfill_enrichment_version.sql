-- Apply first in an authorized isolated database. No backfill of this marker:
-- existing rows have not demonstrated successful enrichment for their version.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "backfillEnrichedVersion" TIMESTAMPTZ;
