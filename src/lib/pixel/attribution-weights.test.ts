import { describe, it, expect } from "vitest";
import {
  reconstructSourceRevenue,
  type AttributionComponents,
  type NitroWeights,
} from "./attribution-weights";

// ══════════════════════════════════════════════════════════════════════════
// La reconstrucción por modelo debe dar EXACTAMENTE lo que daban las 4 variantes
// del CASE de metrics/pixel query #9, partiendo de los componentes sin ponderar.
// ══════════════════════════════════════════════════════════════════════════

const base: AttributionComponents = {
  last_click_revenue: 1000,
  first_click_revenue: 400,
  linear_revenue: 700,
  nitro_single: 200,
  nitro_first2: 300, // sources que fueron primer touch en journeys de 2
  nitro_last2: 300, // (misma plata, distinto rol)
  nitro_first_n: 150,
  nitro_last_n: 150,
  nitro_middle_n: 90,
};
const weights: NitroWeights = { first: 30, middle: 30, last: 40 };

describe("reconstructSourceRevenue", () => {
  it("modelos fijos devuelven su componente directo", () => {
    expect(reconstructSourceRevenue(base, "LAST_CLICK", weights)).toBe(1000);
    expect(reconstructSourceRevenue(base, "FIRST_CLICK", weights)).toBe(400);
    expect(reconstructSourceRevenue(base, "LINEAR", weights)).toBe(700);
  });

  it("NITRO combina los 6 componentes con los pesos (n=2 renormaliza sobre wF+wL)", () => {
    // single + first2*wF/(wF+wL) + last2*wL/(wF+wL) + firstN*wF/100 + lastN*wL/100 + middleN*wM/100
    const expected =
      200 +
      (300 * 30) / 70 +
      (300 * 40) / 70 +
      (150 * 30) / 100 +
      (150 * 40) / 100 +
      (90 * 30) / 100;
    expect(reconstructSourceRevenue(base, "NITRO", weights)).toBeCloseTo(expected, 6);
  });

  it("CUSTOM se comporta como NITRO", () => {
    expect(reconstructSourceRevenue(base, "CUSTOM", weights)).toBe(
      reconstructSourceRevenue(base, "NITRO", weights),
    );
  });

  it("cambiar los pesos cambia SOLO NITRO, no los modelos fijos", () => {
    const w2: NitroWeights = { first: 50, middle: 20, last: 30 };
    expect(reconstructSourceRevenue(base, "LAST_CLICK", w2)).toBe(1000);
    expect(reconstructSourceRevenue(base, "NITRO", w2)).not.toBeCloseTo(
      reconstructSourceRevenue(base, "NITRO", weights),
      6,
    );
  });

  it("no divide por cero si wF+wL = 0", () => {
    const wZero: NitroWeights = { first: 0, middle: 100, last: 0 };
    const r = reconstructSourceRevenue(base, "NITRO", wZero);
    // sin componentes de 2-touch, queda single + middleN*wM/100 (firstN/lastN * 0)
    expect(r).toBeCloseTo(200 + (90 * 100) / 100, 6);
    expect(Number.isFinite(r)).toBe(true);
  });
});
