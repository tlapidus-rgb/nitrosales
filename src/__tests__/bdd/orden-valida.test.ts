import { describe, it, expect } from "vitest";
import {
  isOrderValid,
  ordersValidSql,
  ORDER_STATUS_CONCRETED,
  ORDER_STATUS_NOT_CONCRETED,
} from "@/domains/orders";

// ══════════════════════════════════════════════════════════════════════════
// BDD ejecutable del contrato "orden válida".
// Feature: docs/bdd/features/orden-valida.feature (PLAN §7.1).
// Lean: escenarios como tests, sin runner Cucumber. Sin DB.
// ══════════════════════════════════════════════════════════════════════════

// Background de la feature — las mismas 5 órdenes del escenario.
const ORDERS = [
  { status: "CANCELLED", totalValue: 50000 },
  { status: "APPROVED", totalValue: 0 },
  { status: "PENDING", totalValue: 30000 },
  { status: "APPROVED", totalValue: 115000 },
  { status: "RETURNED", totalValue: 80000 },
];

describe("Feature: orden válida — contrato central (§7.1)", () => {
  describe("Scenario: conteo de órdenes válidas", () => {
    it("cuenta 1 orden válida y suma 115000 de revenue", () => {
      // Act
      const validas = ORDERS.filter(isOrderValid);
      const revenue = validas.reduce((s, o) => s + Number(o.totalValue), 0);
      // Assert
      expect(validas).toHaveLength(1);
      expect(revenue).toBe(115000);
    });
  });

  describe("Scenario: el predicado JS y el SQL no pueden divergir (anti-drift)", () => {
    it("toda orden concretada con valor > 0 es válida", () => {
      for (const status of ORDER_STATUS_CONCRETED) {
        expect(isOrderValid({ status, totalValue: 1 })).toBe(true);
      }
    });

    it("ninguna orden CANCELLED/PENDING/RETURNED es válida, aunque tenga valor", () => {
      for (const status of ORDER_STATUS_NOT_CONCRETED) {
        expect(isOrderValid({ status, totalValue: 999999 })).toBe(false);
      }
    });

    it("una orden concretada con valor 0 no es válida", () => {
      expect(isOrderValid({ status: "APPROVED", totalValue: 0 })).toBe(false);
    });

    it("el SQL de ordersValidSql() excluye EXACTAMENTE los mismos status que el predicado JS", () => {
      // Este es el test que caza el drift "12 vs 16": si alguien cambia el SQL
      // o la lista de status sin tocar la otra, esto rompe.
      const sql = ordersValidSql();
      for (const status of ORDER_STATUS_NOT_CONCRETED) {
        expect(sql).toContain(`'${status}'`);
      }
      for (const status of ORDER_STATUS_CONCRETED) {
        expect(sql).not.toContain(`'${status}'`);
      }
      expect(sql).toContain(`"totalValue" > 0`);
    });
  });

  // Scenario cross-surface (dashboard = pixel = pedidos): requiere DB (integración).
  // Gateado hasta tener fixture Neon branch. Ver PLAN §7.1 scenario 2 + §7.4.
  it.skip("Scenario: consistencia cross-surface — 3 superficies, mismo conteo (DB-gated)", () => {});
});
