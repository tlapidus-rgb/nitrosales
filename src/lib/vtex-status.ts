// ══════════════════════════════════════════════════════════════
// Mapeo canónico de status VTEX → NitroSales
// ══════════════════════════════════════════════════════════════
// FUENTE ÚNICA DE VERDAD para mapeo de status.
// Todos los puntos de entrada (sync, webhook, backfill) DEBEN
// importar de aquí. NO duplicar esta lógica.
//
// Referencia de statuses VTEX OMS:
// https://help.vtex.com/en/tutorial/order-flow-and-status
// ══════════════════════════════════════════════════════════════

const VTEX_STATUS_MAP: Record<string, string> = {
  "order-completed": "DELIVERED",
  "handling": "APPROVED",
  "ready-for-handling": "APPROVED",
  "start-handling": "APPROVED",
  "waiting-for-sellers-confirmation": "PENDING",
  "payment-pending": "PENDING",
  "payment-approved": "APPROVED",
  "invoiced": "INVOICED",
  "canceled": "CANCELLED",
  "cancellation-requested": "PENDING",
  "replaced": "APPROVED",
  "window-to-cancel": "PENDING",
};

/**
 * Mapea un status de VTEX OMS al status interno de NitroSales.
 *
 * Reglas:
 * - Status vacío/null/undefined → retorna null (ghost order, NO guardar)
 * - Status conocido → mapeo exacto según VTEX_STATUS_MAP
 * - Status desconocido → "PENDING" (conservador, nunca asumir APPROVED)
 *
 * NUNCA usar includes("cancel") — atrapa statuses intermedios legítimos.
 * NUNCA retornar "APPROVED" como default — causa ghost orders.
 */
export function mapVtexStatus(vtexStatus: string | null | undefined): string | null {
  if (!vtexStatus || vtexStatus.trim() === "") {
    return null; // Ghost order — no guardar
  }

  const normalized = vtexStatus.toLowerCase().trim();
  const mapped = VTEX_STATUS_MAP[normalized];

  if (mapped) {
    return mapped;
  }

  // Status desconocido — log warning, default conservador
  console.warn(
    `[vtex-status] Unknown VTEX status: "${vtexStatus}" → defaulting to PENDING`
  );
  return "PENDING";
}

/**
 * Verifica si un status de VTEX es válido (no vacío, no ghost).
 * Útil para filtrar antes de insertar en DB.
 */
export function isValidVtexStatus(vtexStatus: string | null | undefined): boolean {
  return mapVtexStatus(vtexStatus) !== null;
}

/**
 * Lista de statuses válidos para el filtro f_status en la URL de VTEX API.
 * Usar en TODAS las llamadas a la List Orders API.
 */
export const VTEX_VALID_STATUSES = [
  "payment-pending",
  "payment-approved",
  "ready-for-handling",
  "handling",
  "invoiced",
  "canceled",
  "window-to-cancel",
  "cancellation-requested",
];

export const VTEX_F_STATUS_PARAM = `f_status=${VTEX_VALID_STATUSES.join(",")}`;
