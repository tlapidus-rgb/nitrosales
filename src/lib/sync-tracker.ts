// Sync Tracker — NitroSales [FASE 1.3]
// Actualiza lastSuccessfulSyncAt en Connection despues de sync exitoso
import { prisma } from "@/lib/db/client";

const ORG_ID = process.env.ORG_ID || "cmmmga1uq0000sb43w0krvvys";

export async function markSyncSuccess(platform: string = "VTEX") {
  try {
    await prisma.connection.updateMany({
      where: { organizationId: ORG_ID, platform: platform as any },
      data: { lastSuccessfulSyncAt: new Date(), lastSyncAt: new Date(), lastSyncError: null },
    });
  } catch (error) {
    console.error("[sync-tracker] Failed to update lastSuccessfulSyncAt:", error);
  }
}

export async function markSyncError(platform: string = "VTEX", errorMsg: string) {
  try {
    await prisma.connection.updateMany({
      where: { organizationId: ORG_ID, platform: platform as any },
      data: { lastSyncAt: new Date(), lastSyncError: errorMsg },
    });
  } catch (err) {
    console.error("[sync-tracker] Failed to update sync error:", err);
  }
}
