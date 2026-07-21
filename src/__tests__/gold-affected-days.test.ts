import { describe, it, expect } from "vitest";
import {
  AR_TZ,
  affectedDaysPredicate,
  affectedDaysSql,
  buildDeleteOrphans,
  dayExpr,
} from "@/data/gold/affected-days";
import { buildGoldDailyRevenueUpsert, buildGoldDailyRevenueDeleteOrphans } from "@/data/gold/gold-daily-revenue-transform";
import { buildGoldSegmentsUpsert, buildGoldSegmentsDeleteOrphans } from "@/data/gold/gold-order-segments-transform";
import { buildGoldProductSalesUpsert, buildGoldProductSalesDeleteOrphans } from "@/data/gold/gold-product-sales-transform";
import { buildGoldCustomerDailyUpsert, buildGoldCustomerDailyDeleteOrphans } from "@/data/gold/gold-customer-daily-transform";

// ══════════════════════════════════════════════════════════════════════════
// REGRESIÓN — bugs B1 + B3 (auditoría 2026-07-21)
// ══════════════════════════════════════════════════════════════════════════
// B1: los rollups recortaban por `order_date >= $1` ("días recientes"), pero
//     una cancelación retroactiva no mueve `order_date` → el día viejo nunca se
//     recomputaba y el revenue sólo podía corregirse hacia arriba.
// B3: sólo 1 de los 4 rollups borraba filas huérfanas, pese a que la lección de
//     2026-07-17 decía que aplicaba a cualquier rollup bucket-izado.
//
// Los dos van juntos: al recomputar un día viejo, si la orden cancelada era la
// ÚNICA de su bucket, el upsert no emite la fila y la vieja sobrevive con el
// valor viejo. Sin el DELETE, arreglar la ventana no arregla nada.
//
// ⚠️ Estos son tests de ESTRUCTURA del SQL, no de resultados: el repo todavía no
// puede ejecutar SQL en tests (deuda conocida, ver la auditoría). Fijan las
// invariantes que se pueden fijar sin base; no prueban los números.
// ══════════════════════════════════════════════════════════════════════════

const UPSERTS: Array<[string, string]> = [
  ["gold_daily_revenue", buildGoldDailyRevenueUpsert()],
  ["gold_order_segments", buildGoldSegmentsUpsert()],
  ["gold_product_sales", buildGoldProductSalesUpsert()],
  ["gold_customer_daily", buildGoldCustomerDailyUpsert()],
];

const DELETES: Array<[string, string]> = [
  ["gold_daily_revenue", buildGoldDailyRevenueDeleteOrphans()],
  ["gold_order_segments", buildGoldSegmentsDeleteOrphans()],
  ["gold_product_sales", buildGoldProductSalesDeleteOrphans()],
  ["gold_customer_daily", buildGoldCustomerDailyDeleteOrphans()],
];

describe("affected-days (helpers)", () => {
  it("el set de días afectados sale de silver_updated_at, no de order_date", () => {
    const sql = affectedDaysSql();
    expect(sql).toContain("silver_updated_at >= $1::timestamptz");
    expect(sql).toContain("FROM silver_orders");
    expect(sql).not.toContain("order_date >= $1");
  });

  it("el día del set usa la MISMA expresión que el grano del rollup", () => {
    // Si divergen, el IN no matchea y el rollup recomputa días equivocados.
    expect(affectedDaysSql()).toContain(dayExpr("sa.order_date"));
    expect(dayExpr("s.order_date")).toBe(
      `(s.order_date AT TIME ZONE '${AR_TZ}')::date`
    );
  });

  it("el predicado filtra por (org, día) completo, no por fila cambiada", () => {
    // El rollup agrega por día: filtrar sólo las filas tocadas daría totales
    // parciales. Tiene que traer el día entero.
    const p = affectedDaysPredicate("s");
    expect(p).toContain("(s.organization_id,");
    expect(p).toContain("IN (");
  });

  it("el DELETE de huérfanas usa el mismo set de días y compara gold_updated_at", () => {
    const d = buildDeleteOrphans("gold_x");
    expect(d).toContain("DELETE FROM gold_x");
    expect(d).toContain("silver_updated_at >= $1::timestamptz");
    expect(d).toContain("gold_updated_at < $2::timestamptz");
  });

  it("el DELETE ya NO se acota con day >= since (dejaba fuera los días viejos)", () => {
    expect(buildDeleteOrphans("gold_x")).not.toContain("g.day >=");
  });
});

describe("los 4 rollups Gold comparten la ventana corregida", () => {
  it.each(UPSERTS)("%s recorta por días afectados", (_t, sql) => {
    expect(sql).toContain("silver_updated_at >= $1::timestamptz");
  });

  it.each(UPSERTS)("%s ya no recorta por order_date >= $1", (_t, sql) => {
    expect(sql).not.toContain("s.order_date >= $1::timestamptz");
  });
});

describe("los 4 rollups Gold borran huérfanas (B3: antes lo hacía 1 de 4)", () => {
  it.each(DELETES)("%s tiene DELETE de huérfanas apuntando a su tabla", (table, sql) => {
    expect(sql).toContain(`DELETE FROM ${table}`);
    expect(sql).toContain("gold_updated_at < $2::timestamptz");
  });

  it("son cuatro tablas distintas — ningún copy-paste apuntando a la tabla ajena", () => {
    const tables = DELETES.map(([t]) => t);
    const targets = DELETES.map(
      ([, sql]) => sql.match(/DELETE FROM (\w+)/)?.[1]
    );
    expect(targets).toEqual(tables);
    expect(new Set(targets).size).toBe(4);
  });
});
