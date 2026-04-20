// Sync Tracker — NitroSales [FASE 1.3 + Multi-tenant S52]
// Actualiza lastSuccessfulSyncAt en Connection después de sync exitoso.
// Multi-tenant safe: cada org trackea su propia Connection.
import { prisma } from "@/lib/db/client";

/**
 * Marca sync exitoso para una org + plataforma específica.
 * orgId es OBLIGATORIO.
 */
export async function markSyncSuccess(
  orgId: string,
  platform: string = "VTEX"
) {
  if (!orgId) {
    console.error("[sync-tracker] markSyncSuccess sin orgId — skipped");
    return;
  }
  try {
    await prisma.connection.updateMany({
      where: { organizationId: orgId, platform: platform as any },
      data: { lastSuccessfulSyncAt: new Date(), lastSyncAt: new Date(), lastSyncError: null },
    });
  } catch (error) {
    console.error("[sync-tracker] Failed to update lastSuccessfulSyncAt:", error);
  }
}

/**
 * Marca sync fallido para una org + plataforma específica.
 * orgId es OBLIGATORIO.
 */
export async function markSyncError(
  orgId: string,
  platform: string = "VTEX",
  errorMsg: string
) {
  if (!orgId) {
    console.error("[sync-tracker] markSyncError sin orgId — skipped");
    return;
  }
  try {
    await prisma.connection.updateMany({
      where: { organizationId: orgId, platform: platform as any },
      data: { lastSyncAt: new Date(), lastSyncError: errorMsg },
    });
  } catch (err) {
    console.error("[sync-tracker] Failed to update sync error:", err);
  }
}
