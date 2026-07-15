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

  it("es idempotente (ON CONFLICT por org+day+source)", () => {
    expect(upsert).toContain("ON CONFLICT (organization_id, day, source) DO UPDATE");
    expect(backfill).toContain("ON CONFLICT (organization_id, day, source) DO UPDATE");
  });

  it("incremental filtra por since ($1); backfill no tiene parámetros ni filtro de fecha", () => {
    expect(upsert).toContain("s.order_date >= $1::timestamptz");
    expect(backfill).not.toContain("$1");
    expect(backfill).not.toContain("order_date >=");
  });
});
