import { describe, it, expect } from "vitest";
import {
  buildCustomerFirstsUpsert,
  buildCustomerFirstsBackfill,
} from "./silver-customer-firsts-transform";

// ══════════════════════════════════════════════════════════════════════════
// silver_customer_firsts reemplaza el LATERAL de cohorts. Semántica crítica:
// 1. MIN(order_date) SIN filtro de status (el LATERAL original tampoco filtra —
//    una orden cancelada también marca la "primera vez").
// 2. Incremental con LEAST(): una ventana reciente JAMÁS puede pisar la fecha
//    histórica con una más nueva.
// ══════════════════════════════════════════════════════════════════════════

describe("silver_customer_firsts — semántica del LATERAL + incremental seguro", () => {
  const upsert = buildCustomerFirstsUpsert();
  const backfill = buildCustomerFirstsBackfill();

  it("NO filtra por status (paridad con el LATERAL de cohorts)", () => {
    expect(upsert).not.toContain("status");
    expect(backfill).not.toContain("status");
  });

  it("solo clientes identificados (customer_id NOT NULL)", () => {
    expect(upsert).toContain("s.customer_id IS NOT NULL");
  });

  it("incremental usa LEAST() — la ventana no puede subir la fecha histórica", () => {
    expect(upsert).toContain(
      "first_order_date = LEAST(silver_customer_firsts.first_order_date, EXCLUDED.first_order_date)"
    );
    expect(backfill).toContain("LEAST(");
  });

  it("es idempotente (ON CONFLICT por org+customer)", () => {
    expect(upsert).toContain("ON CONFLICT (organization_id, customer_id) DO UPDATE");
  });

  it("incremental por org ($1) + ventana ($2); backfill global sin parámetros", () => {
    expect(upsert).toContain("s.organization_id = $1");
    expect(upsert).toContain("s.order_date >= $2::timestamptz");
    expect(backfill).not.toContain("$1");
    expect(backfill).not.toContain("$2");
  });

  it("lee de silver_orders (no de Bronze)", () => {
    expect(upsert).toContain("FROM silver_orders");
  });
});
