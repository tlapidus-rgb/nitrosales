import { describe, it, expect } from "vitest";
import {
  buildGoldProductSalesUpsert,
  buildGoldProductSalesBackfill,
} from "./gold-product-sales-transform";
import { orderStatusNotConcretedList } from "@/domains/orders";

// ══════════════════════════════════════════════════════════════════════════
// gold_product_sales debe usar la MISMA lista de status del contrato
// (anti-drift) y la lógica PACK-AWARE de metrics/orders. Paridad objetivo:
// topProducts (query 8 de metrics/orders) sobre el mismo rango.
// ══════════════════════════════════════════════════════════════════════════

describe("gold_product_sales — anti-drift + pack-aware", () => {
  const upsert = buildGoldProductSalesUpsert();
  const backfill = buildGoldProductSalesBackfill();

  it("usa la lista de status NO-concretados del contrato (no literales a mano)", () => {
    const list = orderStatusNotConcretedList();
    expect(upsert).toContain(`s.status IN (${list})`);
    expect(upsert).toContain(`s.status NOT IN (${list})`);
    expect(backfill).toContain(`s.status IN (${list})`);
  });

  it("es pack-aware: excluye el pack entero si tiene una fila no-concretada", () => {
    expect(upsert).toContain("bad_packs");
    expect(upsert).toContain("COALESCE(s.pack_id, s.external_id)");
    expect(upsert).toContain("NOT EXISTS");
    // orders POR producto = packs distintos que incluyeron el producto
    expect(upsert).toContain("COUNT(DISTINCT o.pack_key)");
  });

  it("solo items con producto (paridad con el JOIN products de topProducts)", () => {
    expect(upsert).toContain('oi."productId" IS NOT NULL');
    expect(upsert).toContain('JOIN order_items oi ON oi."orderId" = o.id');
  });

  it("bucketea por día AR y agrupa por producto+source", () => {
    expect(upsert).toContain("America/Argentina/Buenos_Aires");
    expect(upsert).toContain('GROUP BY o.organization_id, o.day, o.source, oi."productId"');
  });

  it("es idempotente y el ON CONFLICT actualiza TODAS las columnas", () => {
    expect(upsert).toContain("ON CONFLICT (organization_id, day, source, product_id) DO UPDATE");
    for (const col of ["units", "revenue", "orders"]) {
      expect(upsert).toContain(`${col} = EXCLUDED.${col}`);
    }
    expect(backfill).toContain("ON CONFLICT (organization_id, day, source, product_id) DO UPDATE");
  });

  it("incremental filtra por since ($1); backfill sin parámetros", () => {
    // 2026-07-21: la ventana pasó de "días recientes" a DÍAS AFECTADOS —
    // los días que Silver tocó desde $1. Ver src/data/gold/affected-days.ts.
    expect(upsert).toContain("silver_updated_at >= $1::timestamptz");
    expect(upsert).not.toContain("s.order_date >= $1::timestamptz");
    expect(backfill).not.toContain("$1");
  });
});
