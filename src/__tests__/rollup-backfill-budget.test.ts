import { describe, it, expect } from "vitest";
import { canStartAnotherDay, TIME_BUDGET_MS } from "@/lib/pixel/rollup-backfill";

// ══════════════════════════════════════════════════════════════════════════
// REGRESIÓN — el backfill moría con 504 y body vacío en los días de pico
// ══════════════════════════════════════════════════════════════════════════
// Qué pasó (2026-07-22, corriendo el backfill de canales en prod):
//   El presupuesto se chequeaba con `elapsed > budget`, ANTES de arrancar un día
//   cuyo costo no tiene tope (`backfillDay` recorre 7 tablas × todas las orgs).
//   Con budget 250s y maxDuration 300s, cualquier día que tardara más de 50s
//   arrancando cerca del límite se pasaba y Vercel devolvía
//   504 FUNCTION_INVOCATION_TIMEOUT con el body VACÍO.
//
//   Eso es lo peor de los dos mundos: se perdía el trabajo de la llamada Y el
//   cursor para retomar. El operador veía "ERROR:" sin mensaje y no tenía forma
//   de saber en qué día había quedado. Tres reintentos, tres 504 iguales.
//
//   El día que lo destapó fue el 5 de mayo — pico de Hot Sale — que no entraba
//   en 300s ni procesándolo solo.
//
// La regla correcta: no arrancar un día sin tener reservado lo que tardó el día
// MÁS LENTO visto hasta ahora. El promedio no sirve: los picos son justo los que
// rompen, y promediarlos con días normales los esconde.
// ══════════════════════════════════════════════════════════════════════════

describe("presupuesto del backfill — no arrancar un día que no entra", () => {
  it("arranca cuando el tiempo restante cubre la reserva", () => {
    expect(canStartAnotherDay(100_000, 180_000, 700_000)).toBe(true);
  });

  it("EL BUG: no arranca un día en el borde del presupuesto", () => {
    // Regla vieja (`elapsed > budget`): 699s < 700s → arrancaba, y el día
    // tardaba 180s más → 879s → 504.
    expect(canStartAnotherDay(699_000, 180_000, 700_000)).toBe(false);
  });

  it("justo al límite entra (el <= es a propósito: no desperdiciar una tanda)", () => {
    expect(canStartAnotherDay(520_000, 180_000, 700_000)).toBe(true);
    expect(canStartAnotherDay(520_001, 180_000, 700_000)).toBe(false);
  });

  it("una reserva grande (día de pico) corta antes que una chica", () => {
    const elapsed = 400_000;
    expect(canStartAnotherDay(elapsed, 180_000, 700_000)).toBe(true);
    // Después de ver un día de 350s la reserva sube y ya no arranca otro.
    expect(canStartAnotherDay(elapsed, 350_000, 700_000)).toBe(false);
  });

  it("con la reserva por default entra al menos un día en el presupuesto", () => {
    // Si esto falla, el backfill no avanza NUNCA: corta antes del primer día y
    // devuelve el mismo cursor para siempre. Es el modo de fallar opuesto al
    // 504 y sería igual de silencioso.
    expect(canStartAnotherDay(0, 180_000, TIME_BUDGET_MS)).toBe(true);
  });

  it("el presupuesto deja margen real bajo el maxDuration de 800s", () => {
    // El margen tiene que alcanzar para el cierre de la respuesta. Si alguien
    // sube TIME_BUDGET_MS por encima de esto, vuelve el 504.
    expect(TIME_BUDGET_MS).toBeLessThanOrEqual(760_000);
  });
});
