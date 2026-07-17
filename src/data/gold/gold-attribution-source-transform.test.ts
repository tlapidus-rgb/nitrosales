import { describe, it, expect } from "vitest";
import {
  buildGoldAttributionSourceUpsert,
  buildGoldAttributionSourceBackfill,
} from "./gold-attribution-source-transform";
import { orderStatusNotConcretedList } from "@/domains/orders";

// ══════════════════════════════════════════════════════════════════════════
// gold_attribution_source debe: usar el filtro válido-web del contrato,
// tomar UNA fila por orden (DISTINCT ON), descomponer los componentes SIN
// ponderar exactamente como el endpoint, y ser idempotente por (org,day,source).
// ══════════════════════════════════════════════════════════════════════════

describe("gold_attribution_source — transform drift-proof", () => {
  const upsert = buildGoldAttributionSourceUpsert();
  const backfill = buildGoldAttributionSourceBackfill();

  it("usa el filtro válido-web del contrato (status NO concretado + no-marketplace)", () => {
    const list = orderStatusNotConcretedList();
    expect(upsert).toContain(`status NOT IN (${list})`);
    expect(upsert).toContain(`"trafficSource" IS DISTINCT FROM 'Marketplace'`);
    expect(upsert).toContain(`"externalId" NOT LIKE 'FVG-%'`);
  });

  it("toma UNA fila por orden (DISTINCT ON orderId, determinista por model)", () => {
    expect(upsert).toContain('DISTINCT ON (pa."orderId")');
    expect(upsert).toContain('ORDER BY pa."orderId", pa.model');
  });

  it("descompone los componentes SIN ponderar como las 4 variantes del endpoint", () => {
    // LAST_CLICK = tp_ord = n ; FIRST_CLICK = tp_ord = 1 ; LINEAR = v / n
    expect(upsert).toContain("CASE WHEN tp_ord = n THEN v ELSE 0 END");
    expect(upsert).toContain("CASE WHEN tp_ord = 1 THEN v ELSE 0 END");
    expect(upsert).toContain("SUM(v / GREATEST(n, 1))");
    // NITRO: single / first2 / last2 / firstN / lastN / middleN(÷(n-2))
    expect(upsert).toContain("CASE WHEN n = 1 THEN v ELSE 0 END");
    expect(upsert).toContain("CASE WHEN n = 2 AND tp_ord = 1 THEN v ELSE 0 END");
    expect(upsert).toContain("CASE WHEN n >= 3 AND tp_ord = 1 THEN v ELSE 0 END");
    expect(upsert).toContain("tp_ord > 1 AND tp_ord < n THEN v / (n - 2)");
  });

  it("desanida los touchpoints con ORDINALITY", () => {
    expect(upsert).toContain("jsonb_array_elements(c.touchpoints::jsonb) WITH ORDINALITY");
  });

  it("bucketea por día AR de la orden", () => {
    expect(upsert).toContain("America/Argentina/Buenos_Aires");
    expect(upsert).toContain('(o."orderDate" AT TIME ZONE');
  });

  it("es idempotente y el ON CONFLICT actualiza TODAS las columnas", () => {
    expect(upsert).toContain("ON CONFLICT (organization_id, day, source) DO UPDATE");
    for (const col of [
      "orders", "last_click_revenue", "first_click_revenue", "linear_revenue",
      "nitro_single", "nitro_first2", "nitro_last2", "nitro_first_n", "nitro_last_n",
      "nitro_middle_n", "first_touch_count", "assist_touch_count", "last_touch_count",
    ]) {
      expect(upsert).toContain(`${col} = EXCLUDED.${col}`);
    }
  });

  it("incremental filtra por orderDate + createdAt ($1); backfill sin parámetros", () => {
    expect(upsert).toContain('o."orderDate" >= $1::timestamptz');
    expect(upsert).toContain('pa."createdAt" >= $1::timestamptz');
    expect(backfill).not.toContain("$1");
  });
});
