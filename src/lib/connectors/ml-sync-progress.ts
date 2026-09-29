import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import type { ChunkResult } from "@/lib/backfill/types";

export interface MlSyncClaim {
  organizationId: string;
  fromDate: Date;
  toDate: Date;
  cursor: any;
  leaseToken: string;
}

export async function claimMlSync(organizationId: string): Promise<MlSyncClaim | null> {
  const token = randomUUID();
  const rows = await prisma.$queryRawUnsafe<MlSyncClaim[]>(`
    INSERT INTO ml_sync_progress ("organizationId", "fromDate", "toDate", cursor, "leaseToken", "leaseUntil")
    VALUES ($1, now() - interval '72 hours', now(), '{}'::jsonb, $2, now() + interval '6 minutes')
    ON CONFLICT ("organizationId") DO UPDATE SET
      "fromDate" = CASE WHEN ml_sync_progress.cursor IS NULL
        THEN COALESCE(ml_sync_progress."completedThrough", now()) - interval '72 hours'
        ELSE ml_sync_progress."fromDate" END,
      "toDate" = CASE WHEN ml_sync_progress.cursor IS NULL THEN now() ELSE ml_sync_progress."toDate" END,
      cursor = COALESCE(ml_sync_progress.cursor, '{}'::jsonb),
      "leaseToken" = $2, "leaseUntil" = now() + interval '6 minutes', "lastAttemptAt" = now()
    WHERE ml_sync_progress."leaseUntil" IS NULL OR ml_sync_progress."leaseUntil" < now()
    RETURNING "organizationId", "fromDate", "toDate", cursor, "leaseToken"`, organizationId, token);
  return rows[0] ?? null;
}

export async function saveMlSync(claim: MlSyncClaim, result: ChunkResult): Promise<boolean> {
  const updated = await prisma.$executeRawUnsafe(`UPDATE ml_sync_progress
    SET cursor=$3::jsonb,
        "completedThrough"=CASE WHEN $4::boolean THEN "toDate" ELSE "completedThrough" END,
        "lastError"=$5, "leaseToken"=NULL, "leaseUntil"=NULL
    WHERE "organizationId"=$1 AND "leaseToken"=$2 AND "leaseUntil">now()`,
    claim.organizationId, claim.leaseToken,
    result.isComplete && !result.error ? null : JSON.stringify(result.newCursor),
    result.isComplete && !result.error, result.error?.slice(0, 1000) ?? null);
  return updated === 1;
}

/** Least recently attempted first; a failed heavy org moves behind untouched orgs. */
export async function orderMlConnections<T extends { organizationId: string; id: string }>(connections: T[]): Promise<T[]> {
  if (!connections.length) return [];
  const rows = await prisma.$queryRawUnsafe<Array<{ organizationId: string; lastAttemptAt: Date }>>(
    `SELECT "organizationId", "lastAttemptAt" FROM ml_sync_progress WHERE "organizationId"=ANY($1::text[])`,
    connections.map(c => c.organizationId));
  const attempted = new Map(rows.map(row => [row.organizationId, new Date(row.lastAttemptAt).getTime()]));
  return [...connections].sort((a, b) => (attempted.get(a.organizationId) ?? 0) - (attempted.get(b.organizationId) ?? 0) || a.id.localeCompare(b.id));
}
