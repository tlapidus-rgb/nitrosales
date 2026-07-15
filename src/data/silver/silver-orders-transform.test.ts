import { describe, it, expect } from "vitest";
import { buildSilverOrdersUpsert } from "./silver-orders-transform";
import { ordersValidSql, ordersWebSql } from "@/domains/orders";

// ══════════════════════════════════════════════════════════════════════════
// El transform Bronze→Silver debe computar is_valid/is_web con la MISMA
// definición del contrato — no una copia a mano. Si esto rompe, Silver estaría
// por divergir del resto de la plataforma (el bug "12 vs 16" reaparecería).
// ══════════════════════════════════════════════════════════════════════════

describe("buildSilverOrdersUpsert — anti-drift con el contrato", () => {
  const sql = buildSilverOrdersUpsert();

  it("computa is_valid con el SQL EXACTO del contrato (ordersValidSql)", () => {
    expect(sql).toContain(`(${ordersValidSql("o")}) AS is_valid`);
  });

  it("computa is_web con el SQL EXACTO del contrato (ordersWebSql)", () => {
    expect(sql).toContain(`(${ordersWebSql("o")}) AS is_web`);
  });

  it("is_marketplace es la negación de is_web (misma fuente)", () => {
    expect(sql).toContain(`(NOT (${ordersWebSql("o")})) AS is_marketplace`);
  });

  it("es incremental (filtra por org + orderDate) e idempotente (ON CONFLICT)", () => {
    expect(sql).toContain(`WHERE o."organizationId" = $1`);
    expect(sql).toContain(`o."orderDate" >= $2::timestamptz`);
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
  });

  it("usa la fecha canónica orderDate, nunca createdAt", () => {
    expect(sql).toContain(`o."orderDate"`);
    expect(sql).not.toContain(`o."createdAt"`);
  });
});
