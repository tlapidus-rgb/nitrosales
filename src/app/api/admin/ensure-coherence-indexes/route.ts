// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/ensure-coherence-indexes?key=Y
// ══════════════════════════════════════════════════════════════
// Crea indices que aceleran las queries del contrato data-coherence
// (introducidas en S60 EXT-2 BIS+++++++). Idempotente — usa
// CREATE INDEX IF NOT EXISTS asi se puede correr varias veces sin
// romper. NO modifica data, solo indices.
//
// Indices que crea:
//   - pixel_attributions(organizationId, model) — para filtros pa.organizationId + pa.model
//   - pixel_attributions(orderId) — para JOIN pa.orderId = o.id (NO existe hoy, solo unique con model)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const KEY = "nitrosales-secret-key-2024-production";

const INDEXES = [
  // Round 1 (S60 EXT-2 BIS+++++++)
  {
    name: "pixel_attributions_orgId_model_idx",
    sql: `CREATE INDEX IF NOT EXISTS "pixel_attributions_orgId_model_idx" ON "pixel_attributions" ("organizationId", "model")`,
    purpose: "Acelera filtros pa.organizationId + pa.model (CTE visitor_to_orders en query #23)",
  },
  {
    name: "pixel_attributions_orderId_model_idx",
    sql: `CREATE INDEX IF NOT EXISTS "pixel_attributions_orderId_model_idx" ON "pixel_attributions" ("orderId", "model")`,
    purpose: "Acelera JOIN pa.orderId = o.id + filtro por model (funnel con channel)",
  },
  {
    name: "pixel_attributions_orgId_visitorId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "pixel_attributions_orgId_visitorId_idx" ON "pixel_attributions" ("organizationId", "visitorId")`,
    purpose: "Acelera lookups de attributions por visitor (drill-down, reextract)",
  },
  // Round 2 (S60 EXT-2 BIS++++++++) — perf de /pixel y /pixel/atribucion
  {
    name: "pixel_events_orgId_visitorId_ts_idx",
    sql: `CREATE INDEX IF NOT EXISTS "pixel_events_orgId_visitorId_ts_idx" ON "pixel_events" ("organizationId", "visitorId", "timestamp" DESC)`,
    purpose: "Acelera DISTINCT ON visitorId ORDER BY timestamp (CTE visitor_first_source en query #23 y funnel con channel). Antes el indice (visitorId, timestamp) NO tenia organizationId primero.",
  },
  {
    name: "pixel_events_visitor_device_ts_idx",
    sql: `CREATE INDEX IF NOT EXISTS "pixel_events_visitor_device_ts_idx" ON "pixel_events" ("visitorId", "timestamp" DESC) WHERE "deviceType" IS NOT NULL`,
    purpose: "Acelera LATERAL JOIN en query #24 (orders by device) — toma el ultimo deviceType de cada visitor.",
  },
  {
    name: "pixel_events_orgId_type_visitor_idx",
    sql: `CREATE INDEX IF NOT EXISTS "pixel_events_orgId_type_visitor_idx" ON "pixel_events" ("organizationId", "type", "visitorId")`,
    purpose: "Acelera COUNT(DISTINCT visitorId) FILTER (WHERE type=X) — funnel sin channel + steps.",
  },
  {
    name: "pixel_events_orgId_ts_idx",
    sql: `CREATE INDEX IF NOT EXISTS "pixel_events_orgId_ts_idx" ON "pixel_events" ("organizationId", "timestamp")`,
    purpose: "Acelera filtros simples de rango por org (queries #1-7 del pixel route).",
  },
  {
    name: "orders_orgId_status_orderDate_idx",
    sql: `CREATE INDEX IF NOT EXISTS "orders_orgId_status_orderDate_idx" ON "orders" ("organizationId", "status", "orderDate")`,
    purpose: "Acelera filtros por (orgId, status, orderDate) que aparecen en /api/metrics/orders multiples veces.",
  },
  {
    name: "pixel_visitors_orgId_lastSeen_idx",
    sql: `CREATE INDEX IF NOT EXISTS "pixel_visitors_orgId_lastSeen_idx" ON "pixel_visitors" ("organizationId", "lastSeenAt" DESC)`,
    purpose: "Acelera lookups recientes de visitors.",
  },
  // Round 3 (S60 EXT-2 BIS+++++++++++) — perf de /dashboard y /pedidos
  {
    name: "orders_orgId_status_date_desc_idx",
    sql: `CREATE INDEX IF NOT EXISTS "orders_orgId_status_date_desc_idx" ON "orders" ("organizationId", "status", "orderDate" DESC)`,
    purpose: "Acelera 29 queries de /api/metrics/orders que filtran orgId + status + rango fechas. La mayoria ordenan DESC.",
  },
  {
    name: "orders_orgId_customerId_date_idx",
    sql: `CREATE INDEX IF NOT EXISTS "orders_orgId_customerId_date_idx" ON "orders" ("organizationId", "customerId", "orderDate")`,
    purpose: "Acelera cohorts query en /api/metrics/orders (LATERAL JOIN para customer history).",
  },
  {
    // order_items NO tiene columna organizationId (la herencia es via orderId).
    // Indexamos por (orderId, productId) que es lo que realmente usan los JOINs.
    name: "order_items_orderId_productId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "order_items_orderId_productId_idx" ON "order_items" ("orderId", "productId")`,
    purpose: "Acelera top-products queries (JOIN order_items.orderId + group by productId).",
  },
  {
    // PARTIAL INDEX para acelerar el anti-join 'NOT IN (SELECT COALESCE(packId, externalId)
    // WHERE status IN CANCELLED/RETURNED/PENDING)' que se ejecuta 22 veces en
    // /api/metrics/orders. Como la mayoria de orders son APPROVED/INVOICED, el
    // partial solo indexa las 'invalidas' → tabla de indice mucho mas chica
    // (~10% de orders) y el anti-join queda como index-only scan.
    name: "orders_invalid_packs_partial_idx",
    sql: `CREATE INDEX IF NOT EXISTS "orders_invalid_packs_partial_idx" ON "orders" ("organizationId", (COALESCE("packId", "externalId"))) WHERE status IN ('CANCELLED', 'RETURNED', 'PENDING')`,
    purpose: "Acelera la subquery NOT IN(...) que se ejecuta 22 veces en orders metrics.",
  },
];

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (key !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const results: Array<{ name: string; ok: boolean; ms: number; error?: string }> = [];

    for (const idx of INDEXES) {
      const start = Date.now();
      try {
        await prisma.$executeRawUnsafe(idx.sql);
        results.push({ name: idx.name, ok: true, ms: Date.now() - start });
      } catch (e: any) {
        results.push({
          name: idx.name,
          ok: false,
          ms: Date.now() - start,
          error: e.message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      total: INDEXES.length,
      created_or_exists: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}
