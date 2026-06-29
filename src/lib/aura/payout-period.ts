// ══════════════════════════════════════════════════════════════
// Aura — Período mensual de pagos (Lote 2B · Pieza 2)
// ══════════════════════════════════════════════════════════════
// Helpers para representar "el mes" de un pago/cálculo sin introducir saldo.
// periodMonth = "YYYY-MM". Se deriva de / a las fechas existentes del Payout
// (periodStart/periodEnd), así NO requiere columna nueva ni migración.
//
// Usa límites de mes en hora LOCAL (consistente con getEffectiveCommission del
// motor, que ya usa new Date(y, m, 1)). Pieza 1 (vigencia) podrá reutilizar esto.
// ══════════════════════════════════════════════════════════════

/** Date → "YYYY-MM" (mes local). */
export function toPeriodMonth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** "YYYY-MM" válido (formato). */
export function isValidPeriodMonth(periodMonth: unknown): periodMonth is string {
  return typeof periodMonth === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth);
}

/**
 * "YYYY-MM" → { start, end } con el primer y último instante del mes (local).
 * end es 23:59:59.999 del último día (día 0 del mes siguiente).
 */
export function monthRange(periodMonth: string): { start: Date; end: Date } {
  // Robustez: con un periodMonth inválido, split/Number daban Invalid Date y la query
  // de Prisma devolvía 0 filas en SILENCIO (parecía "mes sin datos"). Mejor fallar claro.
  if (!isValidPeriodMonth(periodMonth)) {
    throw new Error(`periodMonth inválido: "${periodMonth}" (se espera "YYYY-MM")`);
  }
  const [y, m] = periodMonth.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Los últimos N "YYYY-MM" hasta `from` inclusive, del más reciente al más viejo.
 * Ej: lastNPeriodMonths(3, new Date(2026, 1, 15)) → ["2026-02","2026-01","2025-12"].
 */
export function lastNPeriodMonths(n: number, from: Date = new Date()): string[] {
  const out: string[] = [];
  const anchor = new Date(from.getFullYear(), from.getMonth(), 1);
  for (let i = 0; i < n; i++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    out.push(toPeriodMonth(d));
  }
  return out;
}

/** "2026-02" → "Febrero 2026" (es-AR). */
export function periodMonthLabel(periodMonth: string): string {
  if (!isValidPeriodMonth(periodMonth)) return periodMonth;
  const { start } = monthRange(periodMonth);
  const label = start.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
