import { prisma } from "@/lib/db/client";

// Locks selected rows so a concurrent admission cannot refresh an expired key
// between selection and deletion. SKIP LOCKED avoids waiting on active requests.
export const PURGE_CREATOR_ATTEMPTS_SQL = `
WITH expired AS (
  SELECT key FROM creator_password_attempts
  WHERE expires_at < statement_timestamp() - interval '1 day'
  ORDER BY expires_at, key
  LIMIT $1::int
  FOR UPDATE SKIP LOCKED
)
DELETE FROM creator_password_attempts AS attempts
USING expired WHERE attempts.key = expired.key`;

/** -1 reports failure; zero means the query ran and found nothing to delete. */
export async function purgeCreatorPasswordAttempts(batchSize = 500): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new RangeError("Cleanup batch must be between 1 and 1000");
  }
  try {
    return await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '3000ms'");
      return tx.$executeRawUnsafe(PURGE_CREATOR_ATTEMPTS_SQL, batchSize);
    }, { maxWait: 1000, timeout: 5000 });
  } catch (error) {
    console.error("[creator-password] No se pudieron limpiar contadores vencidos:", error);
    return -1;
  }
}