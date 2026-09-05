// ══════════════════════════════════════════════════════════════════════════
// chain-budget.ts — Presupuestos de tiempo de `sync/chain` (E-03, 2026-09-05)
// ══════════════════════════════════════════════════════════════════════════
// Vive acá y no en la ruta porque Next.js NO deja exportar símbolos arbitrarios
// desde un `route.ts`: sólo los handlers y su config (`maxDuration`, `dynamic`,
// etc.). Exportar la constante desde la ruta rompe el build con
// "Property 'X' is incompatible with index signature ... not assignable to never".
//
// Y además la decisión tiene que ser testeable sin levantar la ruta, mismo
// criterio que `canStartAnotherDay` en el backfill de rollups.
// ══════════════════════════════════════════════════════════════════════════

/** Cuánto puede consumir UNA organización. Los tres pasos se reparten esto. */
export const ORG_BUDGET_MS = 55_000;

/**
 * Cuándo dejar de arrancar organizaciones nuevas.
 * Tiene que quedar por debajo del `maxDuration` de la ruta (300s) para que la
 * función alcance a responder: si Vercel la mata, se pierde el resultado entero
 * y el caller no se entera de por dónde iba.
 */
export const INVOCATION_BUDGET_MS = 260_000;

/**
 * ¿Alcanza el tiempo que queda para arrancar OTRA organización?
 *
 * La regla es "no arrancar lo que no vamos a poder terminar": cortar a mitad de
 * una organización no ahorra nada (el trabajo ya se hizo) y deja su lock tomado
 * más tiempo del necesario.
 */
export function canStartAnotherOrg(
  elapsedMs: number,
  orgBudgetMs: number = ORG_BUDGET_MS,
  invocationBudgetMs: number = INVOCATION_BUDGET_MS
): boolean {
  return elapsedMs + orgBudgetMs <= invocationBudgetMs;
}
