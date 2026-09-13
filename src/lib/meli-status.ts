// ══════════════════════════════════════════════════════════════
// Mapeo canónico de status MercadoLibre → NitroSales
// ══════════════════════════════════════════════════════════════
// FUENTE ÚNICA DE VERDAD para mapeo de status de MELI.
// Todos los puntos de entrada (webhook, sync, backfill, reconcile)
// DEBEN importar de aquí. NO duplicar esta lógica.
//
// Espejo de `src/lib/vtex-status.ts`, que tiene este mismo cartel desde hace
// meses. MELI nunca lo tuvo, y ésa es toda la historia de este archivo.
//
// ══════════════════════════════════════════════════════════════
// POR QUÉ EXISTE (E-30, 2026-09-13)
// ══════════════════════════════════════════════════════════════
// Había **seis copias** del mapeo, en dos familias que no coincidían:
//
//   Familia A (4 archivos, incluido el webhook en vivo):
//     confirmed → APPROVED · sin `invalid` · sin `partially_refunded` · sin tags
//   Familia B (2 archivos: el backfill y el cron de reconcile):
//     confirmed → PENDING · invalid → CANCELLED · partially_refunded → APPROVED
//
// Las dos diferencias caen justo sobre el filtro de "venta válida"
// (`ORDER_STATUS_NOT_CONCRETED` excluye CANCELLED / PENDING / RETURNED), así que
// **la misma orden contaba como facturación o no según qué código la escribió**:
//
//   · `confirmed` en MELI es "orden creada, esperando pago". La familia A la
//     daba por APROBADA, o sea que el webhook contaba plata que todavía no
//     entró. La familia B tiene razón.
//   · `partially_refunded` es un reembolso parcial: la venta sigue siendo
//     válida y la propia UI de MELI la cuenta. La familia A la mandaba al
//     default (PENDING) y la perdía. La familia B tiene razón otra vez.
//
// Por qué no explotó: el cron de reconcile usa la familia B y **cura** lo que
// el webhook escribió mal. Entre que entra la orden y que corre el cron, los
// números están mal — y nadie lo iba a notar, porque después se corrigen solos.
//
// Este archivo adopta la familia B entera.
//
// Referencia de estados de MELI:
// https://developers.mercadolibre.com.ar/es_ar/gestiona-ventas
// ══════════════════════════════════════════════════════════════

/** Nuestros estados de orden. Los mismos que devuelve `mapVtexStatus`. */
export type EstadoDeOrden = "PENDING" | "APPROVED" | "SHIPPED" | "DELIVERED" | "CANCELLED";

/**
 * Estados de MELI que terminan una orden como NO concretada.
 *
 * `invalid` es una orden que MELI descartó (fraude, error de carga). Mandarla
 * al default —PENDING— la dejaba pareciendo que todavía puede concretarse.
 */
const TERMINALES_NEGATIVOS = new Set(["cancelled", "invalid"]);

const MELI_STATUS_MAP: Record<string, EstadoDeOrden> = {
  // ── Esperando plata ──
  confirmed: "PENDING",
  payment_required: "PENDING",
  payment_in_process: "PENDING",
  partially_paid: "PENDING",

  // ── Plata adentro ──
  paid: "APPROVED",
  // Reembolso PARCIAL: la venta sigue siendo válida y la propia UI de MELI la
  // cuenta en "concretadas + en camino". No confundir con un reembolso total,
  // que MELI reporta como `cancelled`.
  partially_refunded: "APPROVED",

  // ── En movimiento ──
  shipped: "SHIPPED",
  delivered: "DELIVERED",

  // ── Terminados en contra ──
  cancelled: "CANCELLED",
  invalid: "CANCELLED",
};

/**
 * Mapea un status de MELI (más sus tags) a nuestro estado de orden.
 *
 * El orden de resolución importa y no es negociable:
 *
 *   1. **`cancelled` / `invalid` ganan siempre.** MELI conserva el tag
 *      `delivered` histórico incluso después de cancelar el pack, así que
 *      mirar el tag primero resucitaría órdenes canceladas como entregadas.
 *   2. El tag `delivered` pisa al status para todo lo demás: MELI a veces
 *      deja el status atrás y marca la entrega sólo por tag.
 *   3. Recién ahí, la tabla.
 *
 * Un status desconocido cae a PENDING —conservador: no cuenta como venta— y
 * avisa por consola, igual que el mapper de VTEX.
 */
export function mapMeliStatus(
  meliStatus: string | null | undefined,
  tags?: string[] | null,
): EstadoDeOrden {
  const normalizado = (meliStatus ?? "").toLowerCase().trim();

  if (TERMINALES_NEGATIVOS.has(normalizado)) return "CANCELLED";

  if (Array.isArray(tags) && tags.includes("delivered")) return "DELIVERED";

  const mapeado = MELI_STATUS_MAP[normalizado];
  if (mapeado) return mapeado;

  console.warn(`[meli-status] Status de MELI desconocido: "${meliStatus}" → PENDING`);
  return "PENDING";
}

/** `true` si el status es uno que conocemos. Para distinguir "raro" de "vacío". */
export function esStatusDeMeliConocido(meliStatus: string | null | undefined): boolean {
  const n = (meliStatus ?? "").toLowerCase().trim();
  return n !== "" && (TERMINALES_NEGATIVOS.has(n) || n in MELI_STATUS_MAP);
}

/** Todos los estados de MELI que este mapper conoce. Para tests y diagnóstico. */
export const MELI_STATUSES_CONOCIDOS = [
  ...Object.keys(MELI_STATUS_MAP),
  ...TERMINALES_NEGATIVOS,
].filter((v, i, a) => a.indexOf(v) === i);
