// ══════════════════════════════════════════════════════════════
// Aura — Lógica de comisión (FUERA del motor CORE de atribución)
// ══════════════════════════════════════════════════════════════
// Lote 2B · Piezas 4 y 2. Centraliza:
//   - accruesCommission(status): si un creador genera comisión NUEVA (Pieza 4).
//   - getCommissionRate(creador, mes): la ÚNICA lectura del % vigente (Pieza 2).
//
// ⚠️ ESTE archivo NO es el motor CORE. No toca src/lib/pixel/influencer-attribution.ts
// ni los webhooks. El motor CORE ya NO atribuye a creadores INACTIVE (no crea
// InfluencerAttribution), así que la comisión nueva ya está cortada upstream; acá
// está la red para el resto del sistema (cálculo de pagos, auto-generate).
//
// ⚠️ Pieza 1 (pendiente OK de Tomy): hoy el % se lee de influencer.commissionPercent.
// Cuando llegue Pieza 1, se cambia SOLO getCommissionRate para leer del deal con
// vigencia mensual — ningún otro archivo se entera. POR ESO el % se lee acá y en
// ningún otro lado nuevo.
// ══════════════════════════════════════════════════════════════

export const INACTIVE_STATUS = "INACTIVE";

/**
 * ¿El creador ACUMULA comisión nueva? (Pieza 4 — decisión Tomy)
 * Inactivo NO genera comisión de Aura. PAUSED sí (solo INACTIVE corta), espejando
 * exactamente el corte que el motor CORE ya aplica al atribuir.
 * NO afecta la atribución del pixel (PixelAttribution), que es independiente y sigue.
 */
export function accruesCommission(creatorStatus: string | null | undefined): boolean {
  return creatorStatus !== INACTIVE_STATUS;
}

/**
 * Fuente ÚNICA del % de comisión vigente de un creador para un mes dado.
 *
 * HOY: devuelve influencer.commissionPercent (lo que usa el motor CORE) — salvo que
 * el creador no acumule (inactivo), en cuyo caso el % aplicable a comisión NUEVA es 0.
 *
 * ⚠️ El `month` se acepta pero hoy se ignora: lo usará Pieza 1 para resolver el %
 * vigente del mes desde el deal con vigencia. Mantener la firma estable.
 *
 * NOTA sobre históricos: este % es el "aplicable hacia adelante". El monto YA ganado
 * en meses pasados sale del commissionAmount CONGELADO en InfluencerAttribution
 * (ver computeMonthlyOwed en payouts), no de re-multiplicar por este %.
 */
export function getCommissionRate(
  creator: { commissionPercent: number; status?: string | null },
  month?: string,
): number {
  void month; // reservado para Pieza 1 (vigencia mensual)
  if (!accruesCommission(creator.status)) return 0;
  return Number(creator.commissionPercent) || 0;
}
