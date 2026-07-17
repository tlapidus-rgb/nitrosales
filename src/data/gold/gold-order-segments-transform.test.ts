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

  it("segmenta por 4 dimensiones (channel, delivery, carrier, payment) con medidas de envío", () => {
    expect(upsert).toContain("'channel'  AS dimension");
    expect(upsert).toContain("'delivery' AS dimension");
    expect(upsert).toContain("'carrier'  AS dimension");
    expect(upsert).toContain("'payment'  AS dimension");
    expect(upsert).toContain("COALESCE(s.channel, 'Sin dato')");
    expect(upsert).toContain("COALESCE(s.delivery_type, 'Sin dato')");
    expect(upsert).toContain("COALESCE(s.shipping_carrier, 'Sin dato')");
    expect(upsert).toContain("COALESCE(s.payment_method, 'Sin dato')");
    expect(upsert).toContain("SUM(shipping_cost)");
    expect(upsert).toContain("SUM(real_shipping_cost)");
  });

  it("grain con source (tanda 4) — idempotente por org+day+source+dimension+bucket", () => {
    expect(upsert).toContain("ON CONFLICT (organization_id, day, source, dimension, bucket) DO UPDATE");
    expect(backfill).toContain("ON CONFLICT (organization_id, day, source, dimension, bucket) DO UPDATE");
    expect(upsert).toContain("GROUP BY organization_id, day, source, dimension, bucket");
  });

  it("incremental filtra por since; backfill no", () => {
    expect(upsert).toContain("s.order_date >= $1::timestamptz");
    expect(backfill).not.toContain("$1");
  });
});
