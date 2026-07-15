import { describe, it, expect } from "vitest";
import {
  buildGoldSegmentsUpsert,
  buildGoldSegmentsBackfill,
} from "./gold-order-segments-transform";
import { orderStatusNotConcretedList } from "@/domains/orders";

describe("gold_order_segments — anti-drift + pack-aware", () => {
  const upsert = buildGoldSegmentsUpsert();
  const backfill = buildGoldSegmentsBackfill();

  it("usa la lista de status del contrato (no literales a mano)", () => {
    const list = orderStatusNotConcretedList();
    expect(upsert).toContain(`s.status IN (${list})`);
    expect(upsert).toContain(`s.status NOT IN (${list})`);
  });

  it("es pack-aware (bad_packs + NOT EXISTS + DISTINCT pack_key)", () => {
    expect(upsert).toContain("bad_packs");
    expect(upsert).toContain("NOT EXISTS");
    expect(upsert).toContain("COUNT(DISTINCT pack_key)");
  });

  it("segmenta por channel (bucket = COALESCE(channel,'Sin dato'), dimension='channel')", () => {
    expect(upsert).toContain("COALESCE(s.channel, 'Sin dato') AS bucket");
    expect(upsert).toContain("'channel' AS dimension");
  });

  it("es idempotente (ON CONFLICT por org+day+dimension+bucket)", () => {
    expect(upsert).toContain("ON CONFLICT (organization_id, day, dimension, bucket) DO UPDATE");
    expect(backfill).toContain("ON CONFLICT (organization_id, day, dimension, bucket) DO UPDATE");
  });

  it("incremental filtra por since; backfill no", () => {
    expect(upsert).toContain("s.order_date >= $1::timestamptz");
    expect(backfill).not.toContain("$1");
  });
});
