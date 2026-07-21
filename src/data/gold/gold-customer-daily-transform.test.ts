import { describe, it, expect } from "vitest";
import {
  buildGoldCustomerDailyUpsert,
  buildGoldCustomerDailyBackfill,
} from "./gold-customer-daily-transform";
import { orderStatusNotConcretedList } from "@/domains/orders";

describe("gold_customer_daily — anti-drift + pack-aware", () => {
  const upsert = buildGoldCustomerDailyUpsert();
  const backfill = buildGoldCustomerDailyBackfill();

  it("usa la lista de status del contrato", () => {
    const list = orderStatusNotConcretedList();
    expect(upsert).toContain(`s.status IN (${list})`);
    expect(upsert).toContain(`s.status NOT IN (${list})`);
  });

  it("es pack-aware y solo clientes identificados", () => {
    expect(upsert).toContain("bad_packs");
    expect(upsert).toContain("NOT EXISTS");
    expect(upsert).toContain("COUNT(DISTINCT pack_key)");
    expect(upsert).toContain("s.customer_id IS NOT NULL");
  });

  it("NO filtra web/marketplace (topCustomers incluye todas las fuentes)", () => {
    expect(upsert).not.toContain("trafficSource");
    expect(upsert).not.toContain("is_web");
  });

  it("bucketea por día AR y agrupa por cliente", () => {
    expect(upsert).toContain("America/Argentina/Buenos_Aires");
    expect(upsert).toContain("GROUP BY organization_id, day, customer_id");
  });

  it("idempotente, ON CONFLICT actualiza todas las columnas", () => {
    expect(upsert).toContain("ON CONFLICT (organization_id, day, customer_id) DO UPDATE");
    expect(upsert).toContain("orders = EXCLUDED.orders");
    expect(upsert).toContain("revenue = EXCLUDED.revenue");
    expect(backfill).toContain("ON CONFLICT (organization_id, day, customer_id) DO UPDATE");
  });

  it("incremental filtra por since; backfill sin parámetros", () => {
    // 2026-07-21: la ventana pasó de "días recientes" a DÍAS AFECTADOS —
    // los días que Silver tocó desde $1. Ver src/data/gold/affected-days.ts.
    expect(upsert).toContain("silver_updated_at >= $1::timestamptz");
    expect(upsert).not.toContain("s.order_date >= $1::timestamptz");
    expect(backfill).not.toContain("$1");
  });
});
