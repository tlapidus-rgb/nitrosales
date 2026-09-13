// ══════════════════════════════════════════════════════════════════════════
// src/lib/aurum/consumo-actual.ts — cuánto lleva gastado esta org, ahora
// ══════════════════════════════════════════════════════════════════════════
// E-23. Es lo que la cuota necesita saber antes de dejar pasar una consulta.
// Corre en el camino caliente del chat, así que:
//
//   · son DOS queries, en paralelo, las dos contra el índice
//     `(organizationId, createdAt)` que `aurum_usage_logs` ya tiene;
//   · las dos van con su propio catch y devuelven `null` al fallar. `null`
//     significa "no se pudo medir" y la cuota lo trata como fail-open — ver
//     `cuota.ts` para por qué, y para el costo de esa decisión;
//   · nada de esto puede tirar. Una excepción acá sería el asistente caído por
//     una consulta de telemetría.
// ══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import {
  AURUM_DEL_MES_DE_UNA_ORG,
  AURUM_ULTIMO_MINUTO_DE_UNA_ORG,
} from "@/lib/costos/consultas";
import { costoDeAurum, type LlamadaDeAurum } from "@/lib/costos/consumo-por-cliente";
import type { ConsumoActual } from "./cuota";

/** Arranque del mes en curso, en UTC. El tope es mensual y se reinicia solo. */
export function arranqueDelMes(ahora: Date = new Date()): Date {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
}

export async function consumoActualDe(orgId: string, ahora: Date = new Date()): Promise<ConsumoActual> {
  const haceUnMinuto = new Date(ahora.getTime() - 60_000);

  const [grupos, ultimoMinuto] = await Promise.all([
    prisma
      .$queryRawUnsafe<Array<LlamadaDeAurum & { llamadas: number }>>(
        AURUM_DEL_MES_DE_UNA_ORG,
        orgId,
        arranqueDelMes(ahora),
      )
      .catch(() => null),
    prisma
      .$queryRawUnsafe<Array<{ n: number }>>(
        AURUM_ULTIMO_MINUTO_DE_UNA_ORG,
        orgId,
        haceUnMinuto,
      )
      .then((r) => Number(r[0]?.n ?? 0))
      .catch(() => null),
  ]);

  return {
    // Si la consulta falló, `null`. Si devolvió vacío, CERO — la org existe y
    // no gastó nada este mes. Las dos cosas se ven parecidas y significan lo
    // contrario: una es "no sé", la otra es "sé que es cero".
    usdDelMes:
      grupos === null
        ? null
        : costoDeAurum(
            grupos.map((g) => ({
              organizationId: g.organizationId,
              mode: g.mode,
              model: g.model,
              inputTokens: Number(g.inputTokens),
              outputTokens: Number(g.outputTokens),
              llamadas: Number(g.llamadas),
            })),
          ).usdConocido,
    consultasUltimoMinuto: ultimoMinuto,
  };
}
