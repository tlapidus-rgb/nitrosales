// ══════════════════════════════════════════════════════════════
// Backfill dispatcher: elige el processor según plataforma
// ══════════════════════════════════════════════════════════════

import { processVtexChunk } from "./processors/vtex-processor";
import type { ChunkResult } from "./types";

export async function processChunk(job: any): Promise<ChunkResult> {
  switch (job.platform) {
    case "VTEX":
      return await processVtexChunk(job);

    case "MERCADOLIBRE":
      // TODO: implementar ML processor. Por ahora marcamos como complete
      // sin hacer nada (el sync normal de ML ya incluye backfill propio
      // via /api/sync/mercadolibre/backfill).
      return {
        itemsProcessed: 0,
        newCursor: {},
        isComplete: true,
      };

    case "META_ADS":
    case "GOOGLE_ADS":
      // Son on-demand, no tienen backfill profundo: el sync ya trae
      // 90+ dias por defecto cuando se abre la pagina.
      return {
        itemsProcessed: 0,
        newCursor: {},
        isComplete: true,
      };

    default:
      return {
        itemsProcessed: 0,
        newCursor: {},
        isComplete: false,
        error: `Plataforma no soportada: ${job.platform}`,
      };
  }
}
