import { prisma } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { AURUM_DEL_MES_DE_UNA_ORG, AURUM_ULTIMO_MINUTO_DE_UNA_ORG } from "@/lib/costos/consultas";
import { costoDeAurum, type LlamadaDeAurum } from "@/lib/costos/consumo-por-cliente";
import type { ConsumoActual } from "./cuota";

export function arranqueDelMes(ahora: Date = new Date()): Date {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
}

/** Errors propagate to admission; an unreadable counter must not admit work. */
export async function consumoActualDe(
  orgId: string, ahora: Date = new Date(),
  db: Pick<Prisma.TransactionClient, "$queryRawUnsafe"> = prisma,
): Promise<ConsumoActual> {
  const grupos = await db.$queryRawUnsafe<Array<LlamadaDeAurum & { llamadas: number }>>(
    AURUM_DEL_MES_DE_UNA_ORG, orgId, arranqueDelMes(ahora),
  );
  const [ultimoMinuto] = await db.$queryRawUnsafe<Array<{ n: number }>>(
    AURUM_ULTIMO_MINUTO_DE_UNA_ORG, orgId, new Date(ahora.getTime() - 60_000),
  );
  const costo = costoDeAurum(grupos.map(g => ({
    ...g, inputTokens: Number(g.inputTokens), outputTokens: Number(g.outputTokens),
    llamadas: Number(g.llamadas),
  })));
  return {
    // Unknown models and unfinished admissions are not zero dollars.
    usdDelMes: costo.modelosSinPrecio.length ? null : costo.usdConocido,
    consultasUltimoMinuto: Number(ultimoMinuto?.n ?? 0),
  };
}