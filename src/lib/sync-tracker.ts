// ══════════════════════════════════════════════
// Sync Tracker — NitroSales
// ══════════════════════════════════════════════
// [FASE 1.3] Actualiza lastSuccessfulSyncAt en la Connection
// despues de cada sync exitoso.
// Llamar desde sync/route.ts y sync/chain/route.ts

import { db } from '@/lib/db/client';

const ORG_ID = process.env.ORG_ID || 'cmmmga1uq0000sb43w0krvvys';

export async function markSyncSuccess(platform: string = 'VTEX') {
  try {
    await db.connection.updateMany({
      where: {
        organizationId: ORG_ID,
        platform: platform as any,
      },
      data: {
        lastSuccessfulSyncAt: new Date(),
        lastSyncAt: new Date(),
        lastSyncError: null,
      },
    });
  } catch (error) {
    // Non-critical — log but don't fail the sync
    console.error('[sync-tracker] Failed to update lastSuccessfulSyncAt:', error);
  }
}

export async function markSyncError(platform: string = 'VTEX', error: string) {
  try {
    await db.connection.updateMany({
      where: {
        organizationId: ORG_ID,
        platform: platform as any,
      },
      data: {
        lastSyncAt: new Date(),
        lastSyncError: error,
      },
    });
  } catch (err) {
    console.error('[sync-tracker] Failed to update sync error:', err);
  }
}
