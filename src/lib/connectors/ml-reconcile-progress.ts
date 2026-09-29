import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";

export interface ReconcileWindow { from: number; to: number; offset: number; total?: number }
export interface ReconcileClaim {
  organizationId: string;
  layer: "incremental" | "deep";
  toDate: Date;
  cursor: ReconcileWindow[];
  leaseToken: string;
}

/** The caller supplies the legacy watermark boundary only for a new scan. */
export async function claimReconcile(organizationId: string, layer: ReconcileClaim["layer"], from: Date, to: Date): Promise<ReconcileClaim | null> {
  const rows = await prisma.$queryRawUnsafe<ReconcileClaim[]>(`
    INSERT INTO ml_reconcile_progress ("organizationId", layer, "toDate", cursor, "leaseToken", "leaseUntil")
    VALUES ($1,$2,$3,$4::jsonb,$5,now()+interval '6 minutes')
    ON CONFLICT ("organizationId",layer) DO UPDATE SET
      "toDate"=CASE WHEN ml_reconcile_progress.cursor IS NULL THEN EXCLUDED."toDate" ELSE ml_reconcile_progress."toDate" END,
      cursor=COALESCE(ml_reconcile_progress.cursor,EXCLUDED.cursor),
      "leaseToken"=EXCLUDED."leaseToken", "leaseUntil"=EXCLUDED."leaseUntil", "lastAttemptAt"=now()
    WHERE ml_reconcile_progress."leaseUntil" IS NULL OR ml_reconcile_progress."leaseUntil"<now()
    RETURNING "organizationId",layer,"toDate",cursor,"leaseToken"`,
    organizationId, layer, to, JSON.stringify([{ from: from.getTime(), to: to.getTime(), offset: 0 }]), randomUUID());
  return rows[0] ?? null;
}

/** Save only completed pages; optionally release for a subsequent invocation. */
export async function checkpointReconcile(claim: ReconcileClaim, windows: ReconcileWindow[], release = false): Promise<boolean> {
  const changed = await prisma.$executeRawUnsafe(`UPDATE ml_reconcile_progress SET cursor=$4::jsonb,
    "leaseToken"=CASE WHEN $5::boolean THEN NULL ELSE "leaseToken" END,
    "leaseUntil"=CASE WHEN $5::boolean THEN NULL ELSE "leaseUntil" END
    WHERE "organizationId"=$1 AND layer=$2 AND "leaseToken"=$3 AND "leaseUntil">now()`,
    claim.organizationId,claim.layer,claim.leaseToken,JSON.stringify(windows),release);
  return changed === 1;
}

/** Cursor completion and legacy watermark publish in ONE SQL statement. */
export async function completeReconcile(claim: ReconcileClaim, stats: unknown): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ organizationId: string }>>(`
    WITH completed AS (
      UPDATE ml_reconcile_progress SET cursor=NULL,"leaseToken"=NULL,"leaseUntil"=NULL
      WHERE "organizationId"=$1 AND layer=$2 AND "leaseToken"=$3 AND "leaseUntil">now() AND cursor='[]'::jsonb
      RETURNING "organizationId",layer,"toDate"
    )
    INSERT INTO sync_watermarks ("organizationId",platform,"syncLayer","lastSuccessfulSyncAt","lastRunAt","lastRunStatus",metadata)
    SELECT "organizationId",'MERCADOLIBRE',layer,"toDate",now(),'ok',$4::jsonb FROM completed
    ON CONFLICT ("organizationId",platform,"syncLayer") DO UPDATE SET
      "lastSuccessfulSyncAt"=GREATEST(sync_watermarks."lastSuccessfulSyncAt",EXCLUDED."lastSuccessfulSyncAt"),
      "lastRunAt"=now(),"lastRunStatus"='ok',metadata=EXCLUDED.metadata,"updatedAt"=now()
    RETURNING "organizationId"`,claim.organizationId,claim.layer,claim.leaseToken,JSON.stringify(stats));
  return rows.length === 1;
}
