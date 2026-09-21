import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { consumoActualDe } from "./consumo-actual";
import { evaluarCuota, limitesDeAurum, type ModoDeAurum, type LimitesDeAurum } from "./cuota";

export const MODELO_PENDIENTE = "__aurum_pending__";
export const MODELO_USO_INCIERTO = "__aurum_usage_unknown__";
export const LOCK_AURUM_SQL = "SELECT pg_advisory_xact_lock(160022, hashtext($1))::text";

/** The lock spans admission only; never a provider request. */
export async function admitirAurum(orgId: string, modoPedido: ModoDeAurum,
  limites: LimitesDeAurum = limitesDeAurum()) {
  return prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe(LOCK_AURUM_SQL, orgId);
    // After acquiring the lock, obtain a fresh snapshot and the database clock.
    const [clock] = await tx.$queryRawUnsafe<Array<{ ahora: Date }>>("SELECT clock_timestamp() AS ahora");
    const consumo = await consumoActualDe(orgId, clock.ahora, tx);
    const cuota = evaluarCuota({ modoPedido, consumo, limites });
    if (!cuota.permitido) return { cuota, id: null };
    const id = randomUUID();
    await tx.aurumUsageLog.create({ data: {
      id, organizationId: orgId, mode: cuota.modoEfectivo, model: MODELO_PENDIENTE,
      latencyMs: 0, success: false, stopReason: "admission-pending", createdAt: clock.ahora,
    } });
    return { cuota, id };
  }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 15000 });
}
