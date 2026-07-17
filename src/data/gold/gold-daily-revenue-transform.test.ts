import { describe, it, expect } from "vitest";
import {
  buildGoldDailyRevenueUpsert,
  buildGoldDailyRevenueBackfill,
} from "./gold-daily-revenue-transform";
import { orderStatusNotConcretedList } from "@/domains/orders";

// ══════════════════════════════════════════════════════════════════════════
// El rollup Gold debe usar la MISMA lista de status del contrato (anti-drift) y
// la lógica PACK-AWARE de metrics/orders (un pack se excluye entero si tiene una
// fila no-concretada). Si esto rompe, Gold estaría por divergir de la fuente.
// ══════════════════════════════════════════════════════════════════════════

describe("gold_daily_revenue — anti-drift + pack-aware", () => {
  const upsert = buildGoldDailyRevenueUpsert();
  const backfill = buildGoldDailyRevenueBackfill();

  it("usa la lista de status NO-concretados del contrato (no literales a mano)", () => {
    const list = orderStatusNotConcretedList(); // 'CANCELLED', 'PENDING', 'RETURNED'
    expect(upsert).toContain(`s.status IN (${list})`);
    expect(upsert).toContain(`s.status NOT IN (${list})`);
    expect(backfill).toContain(`s.status IN (${list})`);
  });

  it("es pack-aware: excluye el pack entero si tiene una fila no-concretada", () => {
    expect(upsert).toContain("bad_packs");
    expect(upsert).toContain("COALESCE(s.pack_id, s.external_id)");
    expect(upsert).toContain("NOT EXISTS");
    expect(upsert).toContain("COUNT(DISTINCT pack_key)");
  });

  it("bucketea por día AR (America/Argentina/Buenos_Aires)", () => {
    expect(upsert).toContain("America/Argentina/Buenos_Aires");
  });

  it("agrega las columnas del header (shipping/discounts/fee + orders_with_fee pack-aware)", () => {
    expect(upsert).toContain("SUM(shipping_cost)");
    expect(upsert).toContain("SUM(discount_value)");
    expect(upsert).toContain("SUM(marketplace_fee)");
    // orders_with_fee = packs con al menos una fila con fee > 0
    expect(upsert).toContain("COUNT(DISTINCT pack_key) FILTER (WHERE marketplace_fee > 0)");
  });

  it("es idempotente (ON CONFLICT por org+day+source)", () => {
    expect(upsert).toContain("ON CONFLICT (organization_id, day, source) DO UPDATE");
    expect(backfill).toContain("ON CONFLICT (organization_id, day, source) DO UPDATE");
  });

  it("agrega las medidas de profitability (tanda 2): item_* + packs costeados", () => {
    // effective_cost = COALESCE(item, producto, hermano por SKU pre-agregado)
    expect(upsert).toContain('COALESCE(oi."costPrice", p."costPrice", sc.cost)');
    expect(upsert).toContain("item_gross_with_cost");
    expect(upsert).toContain("item_gross_without_cost");
    expect(upsert).toContain("item_cogs");
    // packs con >=1 item costeado vs packs con items (denominador)
    expect(upsert).toContain("FILTER (WHERE ec.effective_cost > 0)::int AS orders_with_cost");
    expect(upsert).toContain("AS orders_with_items");
  });

  it("el ON CONFLICT actualiza TODAS las columnas (lección re-backfill)", () => {
    // Si se agrega una medida y no se agrega acá, un re-backfill deja filas mixtas.
    for (const col of [
      "orders", "revenue", "items", "shipping", "discounts", "marketplace_fee",
      "orders_with_fee", "item_gross", "item_gross_with_cost",
      "item_gross_without_cost", "item_cogs", "orders_with_cost", "orders_with_items",
    ]) {
      expect(upsert).toContain(`${col} = EXCLUDED.${col}`);
    }
  });

  it("incremental filtra por since ($1); backfill no tiene parámetros ni filtro de fecha", () => {
    expect(upsert).toContain("s.order_date >= $1::timestamptz");
    expect(backfill).not.toContain("$1");
    expect(backfill).not.toContain("order_date >=");
  });
});
