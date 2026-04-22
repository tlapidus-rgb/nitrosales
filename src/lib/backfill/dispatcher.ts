// ══════════════════════════════════════════════════════════════
// Backfill dispatcher: elige el processor según plataforma
// ══════════════════════════════════════════════════════════════

import { processVtexChunk } from "./processors/vtex-processor";
import { processMercadoLibreChunk } from "./processors/ml-processor";
import type { ChunkResult } from "./types";

export async function processChunk(job: any): Promise<ChunkResult> {
  switch (job.platform) {
    case "VTEX":
      return await processVtexChunk(job);

    case "MERCADOLIBRE":
      return await processMercadoLibreChunk(job);

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
