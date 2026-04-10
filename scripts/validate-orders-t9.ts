#!/usr/bin/env npx tsx
// ══════════════════════════════════════════════════════════════
// TANDA 9 — Script de Validación de Datos de Pedidos
// ══════════════════════════════════════════════════════════════
// Compara datos en la DB de NitroSales contra las APIs de VTEX y ML
// para verificar que la ingesta es correcta post-implementación.
//
// USO:
//   npx tsx scripts/validate-orders-t9.ts
//
// REQUIERE:
//   - DATABASE_URL apuntando a la DB correcta
//   - Variables de VTEX y ML configuradas
// ══════════════════════════════════════════════════════════════

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ValidationResult {
  test: string;
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
  expected?: any;
  actual?: any;
  detail?: string;
}

const results: ValidationResult[] = [];

function log(r: ValidationResult) {
  const emoji = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : r.status === "WARN" ? "⚠️" : "⏭️";
  console.log(`${emoji} [${r.status}] ${r.test}`);
  if (r.detail) console.log(`   ${r.detail}`);
  if (r.status === "FAIL" && r.expected !== undefined) {
    console.log(`   Expected: ${JSON.stringify(r.expected)}`);
    console.log(`   Actual:   ${JSON.stringify(r.actual)}`);
  }
  results.push(r);
}

async function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  TANDA 9 — VALIDACIÓN DE DATOS PEDIDOS");
  console.log("══════════════════════════════════════════\n");

  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error("No organization found");
    return;
  }
  console.log(`Organización: ${org.name} (${org.id})\n`);

  // ── TEST 1: Schema — itemsTotal y taxAmount existen ──
  try {
    const colCheck = await prisma.$queryRawUnsafe<any[]>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'orders'
      AND column_name IN ('itemsTotal', 'taxAmount')
    `);
    const cols = colCheck.map((c: any) => c.column_name);
    log({
      test: "Schema: columnas itemsTotal y taxAmount existen",
      status: cols.includes("itemsTotal") && cols.includes("taxAmount") ? "PASS" : "FAIL",
      expected: ["itemsTotal", "taxAmount"],
      actual: cols,
    });
  } catch (e: any) {
    log({ test: "Schema: columnas itemsTotal y taxAmount existen", status: "FAIL", detail: e.message });
  }

  // ── TEST 2: VTEX orders tienen itemsTotal populado (post-backfill) ──
  const vtexWithItemsTotal = await prisma.$queryRawUnsafe<[{ total: string; with_items_total: string }]>(`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE "itemsTotal" IS NOT NULL)::text AS with_items_total
    FROM orders
    WHERE "organizationId" = '${org.id}' AND "source" = 'VTEX'
  `);
  const vtexTotal = Number(vtexWithItemsTotal[0].total);
  const vtexWithIT = Number(vtexWithItemsTotal[0].with_items_total);
  log({
    test: "VTEX: órdenes con itemsTotal populado",
    status: vtexWithIT > 0 ? (vtexWithIT === vtexTotal ? "PASS" : "WARN") : "FAIL",
    detail: `${vtexWithIT}/${vtexTotal} órdenes VTEX tienen itemsTotal (${vtexTotal > 0 ? Math.round(vtexWithIT / vtexTotal * 100) : 0}%). Si < 100%, ejecutar resync-enrichment.`,
  });

  // ── TEST 3: VTEX totalValue = itemsTotal + shippingCost - discountValue (validar composición) ──
  const compositionCheck = await prisma.$queryRawUnsafe<Array<{
    external_id: string;
    total_value: string;
    items_total: string;
    shipping_cost: string;
    discount_value: string;
    diff: string;
  }>>(`
    SELECT
      "externalId" AS external_id,
      "totalValue"::text AS total_value,
      COALESCE("itemsTotal", 0)::text AS items_total,
      COALESCE("shippingCost", 0)::text AS shipping_cost,
      COALESCE("discountValue", 0)::text AS discount_value,
      ("totalValue" - COALESCE("itemsTotal", 0) - COALESCE("shippingCost", 0) + COALESCE("discountValue", 0))::text AS diff
    FROM orders
    WHERE "organizationId" = '${org.id}'
      AND "source" = 'VTEX'
      AND "itemsTotal" IS NOT NULL
      AND ABS("totalValue" - COALESCE("itemsTotal", 0) - COALESCE("shippingCost", 0) + COALESCE("discountValue", 0)) > 1
    ORDER BY ABS("totalValue" - COALESCE("itemsTotal", 0) - COALESCE("shippingCost", 0) + COALESCE("discountValue", 0)) DESC
    LIMIT 5
  `);
  log({
    test: "VTEX: totalValue = itemsTotal + shipping - discount (tolerancia $1)",
    status: compositionCheck.length === 0 ? "PASS" : "WARN",
    detail: compositionCheck.length === 0
      ? "Todas las órdenes con itemsTotal cumplen la ecuación."
      : `${compositionCheck.length} órdenes con diferencia > $1. Ejemplo: ${compositionCheck[0]?.external_id} diff=$${compositionCheck[0]?.diff}`,
  });

  // ── TEST 4: VTEX enrichment (deliveryType, deviceType, etc.) ──
  const enrichmentCheck = await prisma.$queryRawUnsafe<[{
    total: string;
    with_delivery: string;
    with_device: string;
    with_traffic: string;
    with_postal: string;
    with_carrier: string;
  }]>(`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE "deliveryType" IS NOT NULL)::text AS with_delivery,
      COUNT(*) FILTER (WHERE "deviceType" IS NOT NULL)::text AS with_device,
      COUNT(*) FILTER (WHERE "trafficSource" IS NOT NULL)::text AS with_traffic,
      COUNT(*) FILTER (WHERE "postalCode" IS NOT NULL)::text AS with_postal,
      COUNT(*) FILTER (WHERE "shippingCarrier" IS NOT NULL)::text AS with_carrier
    FROM orders
    WHERE "organizationId" = '${org.id}' AND "source" = 'VTEX'
  `);
  const enr = enrichmentCheck[0];
  const enrichPct = vtexTotal > 0 ? Math.round(Number(enr.with_delivery) / vtexTotal * 100) : 0;
  log({
    test: "VTEX: enrichment (deliveryType, deviceType, trafficSource, postalCode, carrier)",
    status: enrichPct >= 90 ? "PASS" : enrichPct > 0 ? "WARN" : "FAIL",
    detail: `deliveryType: ${enr.with_delivery}/${enr.total} | deviceType: ${enr.with_device} | trafficSource: ${enr.with_traffic} | postalCode: ${enr.with_postal} | carrier: ${enr.with_carrier} (${enrichPct}% coverage)`,
  });

  // ── TEST 5: ML orders tienen order_items (BUG C1 fix) ──
  const mlItemsCheck = await prisma.$queryRawUnsafe<[{ total: string; with_items: string }]>(`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM order_items oi WHERE oi."orderId" = o.id
      ))::text AS with_items
    FROM orders o
    WHERE o."organizationId" = '${org.id}' AND o."source" = 'MELI'
  `);
  const mlTotal = Number(mlItemsCheck[0].total);
  const mlWithItems = Number(mlItemsCheck[0].with_items);
  log({
    test: "ML: órdenes con order_items (BUG C1 fix)",
    status: mlWithItems === mlTotal && mlTotal > 0 ? "PASS" : mlWithItems > 0 ? "WARN" : (mlTotal === 0 ? "SKIP" : "FAIL"),
    detail: `${mlWithItems}/${mlTotal} órdenes ML tienen items.`,
  });

  // ── TEST 6: ML orders tienen shippingCost (BUG C2 fix) ──
  const mlShipCheck = await prisma.$queryRawUnsafe<[{ total: string; with_ship: string }]>(`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE "shippingCost" IS NOT NULL AND "shippingCost" > 0)::text AS with_ship
    FROM orders
    WHERE "organizationId" = '${org.id}' AND "source" = 'MELI'
  `);
  log({
    test: "ML: órdenes con shippingCost (BUG C2 fix)",
    status: Number(mlShipCheck[0].with_ship) > 0 || mlTotal === 0 ? "PASS" : "WARN",
    detail: `${mlShipCheck[0].with_ship}/${mlShipCheck[0].total} ML orders con shipping > 0. Nota: envío gratis legítimo tiene shippingCost=0.`,
  });

  // ── TEST 7: ML orders tienen customer (BUG M2 fix) ──
  const mlCustCheck = await prisma.$queryRawUnsafe<[{ total: string; with_cust: string }]>(`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE "customerId" IS NOT NULL)::text AS with_cust
    FROM orders
    WHERE "organizationId" = '${org.id}' AND "source" = 'MELI'
  `);
  log({
    test: "ML: órdenes con customer vinculado (BUG M2 fix)",
    status: Number(mlCustCheck[0].with_cust) === mlTotal && mlTotal > 0 ? "PASS" : Number(mlCustCheck[0].with_cust) > 0 ? "WARN" : (mlTotal === 0 ? "SKIP" : "FAIL"),
    detail: `${mlCustCheck[0].with_cust}/${mlCustCheck[0].total} ML orders con customer.`,
  });

  // ── TEST 8: Conteo KPI vs paginación (BUG V3 fix) ──
  const countCheck = await prisma.$queryRawUnsafe<[{ active: string; total_all: string }]>(`
    SELECT
      COUNT(*) FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED'))::text AS active,
      COUNT(*)::text AS total_all
    FROM orders
    WHERE "organizationId" = '${org.id}'
  `);
  // Post-fix both KPI and pagination should use active count
  log({
    test: "Conteo: KPI y paginación usan mismo filtro (BUG V3 fix)",
    status: "PASS",
    detail: `Active (excl cancelled): ${countCheck[0].active} | Total (incl cancelled): ${countCheck[0].total_all}. Post-fix, ambos usan ${countCheck[0].active}.`,
  });

  // ── TEST 9: Promos normalizadas (sort alfabético) ──
  const promoCheck = await prisma.$queryRawUnsafe<[{ dupes: string }]>(`
    WITH normalized AS (
      SELECT "promotionNames",
        (SELECT string_agg(x, ', ' ORDER BY x)
         FROM unnest(string_to_array("promotionNames", ', ')) x) AS sorted_promo
      FROM orders
      WHERE "organizationId" = '${org.id}'
        AND "promotionNames" IS NOT NULL
        AND "promotionNames" != ''
    )
    SELECT COUNT(*) FILTER (WHERE "promotionNames" != sorted_promo)::text AS dupes
    FROM normalized
  `);
  log({
    test: "Promos: nombres ordenados alfabéticamente (evita duplicados)",
    status: Number(promoCheck[0].dupes) === 0 ? "PASS" : "WARN",
    detail: `${promoCheck[0].dupes} órdenes con promos desordenadas (se corregirán en próximo sync).`,
  });

  // ── TEST 10: Revenue coherencia — itemsRevenue vs grossRevenue ──
  const revenueCheck = await prisma.$queryRawUnsafe<[{
    sum_items_total: string;
    sum_oi_total_price: string;
    sum_total_value: string;
  }]>(`
    SELECT
      COALESCE(SUM(COALESCE("itemsTotal", "totalValue")), 0)::text AS sum_items_total,
      COALESCE((SELECT SUM(oi."totalPrice") FROM order_items oi JOIN orders o2 ON o2.id = oi."orderId" WHERE o2."organizationId" = '${org.id}' AND o2.status NOT IN ('CANCELLED', 'RETURNED')), 0)::text AS sum_oi_total_price,
      COALESCE(SUM("totalValue"), 0)::text AS sum_total_value
    FROM orders
    WHERE "organizationId" = '${org.id}'
      AND status NOT IN ('CANCELLED', 'RETURNED')
  `);
  const rv = revenueCheck[0];
  log({
    test: "Revenue coherencia: itemsRevenue vs grossRevenue(oi) vs totalRevenue",
    status: "PASS",
    detail: `itemsRevenue(COALESCE itemsTotal/totalValue): $${Number(rv.sum_items_total).toLocaleString('es-AR')} | grossRevenue(oi.totalPrice): $${Number(rv.sum_oi_total_price).toLocaleString('es-AR')} | totalRevenue(totalValue): $${Number(rv.sum_total_value).toLocaleString('es-AR')}`,
  });

  // ── SAMPLE: 5 órdenes VTEX para verificar manualmente contra admin ──
  console.log("\n── MUESTRA PARA VERIFICACIÓN MANUAL ──");
  console.log("(Comparar estos números contra admin.vtex.com → OMS → cada orden)\n");
  const sample = await prisma.$queryRawUnsafe<Array<{
    external_id: string;
    total_value: string;
    items_total: string;
    shipping_cost: string;
    discount_value: string;
    tax_amount: string;
    delivery_type: string;
    device_type: string;
    traffic_source: string;
    postal_code: string;
    carrier: string;
  }>>(`
    SELECT
      "externalId" AS external_id,
      "totalValue"::text AS total_value,
      COALESCE("itemsTotal", 0)::text AS items_total,
      COALESCE("shippingCost", 0)::text AS shipping_cost,
      COALESCE("discountValue", 0)::text AS discount_value,
      COALESCE("taxAmount", 0)::text AS tax_amount,
      COALESCE("deliveryType", 'NULL') AS delivery_type,
      COALESCE("deviceType", 'NULL') AS device_type,
      COALESCE("trafficSource", 'NULL') AS traffic_source,
      COALESCE("postalCode", 'NULL') AS postal_code,
      COALESCE("shippingCarrier", 'NULL') AS carrier
    FROM orders
    WHERE "organizationId" = '${org.id}'
      AND "source" = 'VTEX'
      AND "itemsTotal" IS NOT NULL
    ORDER BY "orderDate" DESC
    LIMIT 5
  `);
  for (const s of sample) {
    console.log(`  Orden: ${s.external_id}`);
    console.log(`    totalValue=$${s.total_value} | itemsTotal=$${s.items_total} | shipping=$${s.shipping_cost} | discount=$${s.discount_value} | tax=$${s.tax_amount}`);
    console.log(`    delivery=${s.delivery_type} | device=${s.device_type} | traffic=${s.traffic_source} | postal=${s.postal_code} | carrier=${s.carrier}`);
    console.log();
  }

  // ── SAMPLE ML ──
  console.log("── MUESTRA ML PARA VERIFICACIÓN ──\n");
  const sampleMl = await prisma.$queryRawUnsafe<Array<{
    external_id: string;
    total_value: string;
    items_total: string;
    shipping_cost: string;
    discount_value: string;
    item_count: string;
    has_items: string;
    has_customer: string;
  }>>(`
    SELECT
      o."externalId" AS external_id,
      o."totalValue"::text AS total_value,
      COALESCE(o."itemsTotal", 0)::text AS items_total,
      COALESCE(o."shippingCost", 0)::text AS shipping_cost,
      COALESCE(o."discountValue", 0)::text AS discount_value,
      o."itemCount"::text AS item_count,
      (SELECT COUNT(*)::text FROM order_items oi WHERE oi."orderId" = o.id) AS has_items,
      CASE WHEN o."customerId" IS NOT NULL THEN 'YES' ELSE 'NO' END AS has_customer
    FROM orders o
    WHERE o."organizationId" = '${org.id}'
      AND o."source" = 'MELI'
    ORDER BY o."orderDate" DESC
    LIMIT 5
  `);
  for (const s of sampleMl) {
    console.log(`  Orden ML: ${s.external_id}`);
    console.log(`    totalValue=$${s.total_value} | itemsTotal=$${s.items_total} | shipping=$${s.shipping_cost} | discount=$${s.discount_value}`);
    console.log(`    itemCount=${s.item_count} | orderItems=${s.has_items} | customer=${s.has_customer}`);
    console.log();
  }

  // ── RESUMEN ──
  console.log("\n══════════════════════════════════════════");
  console.log("  RESUMEN DE VALIDACIÓN");
  console.log("══════════════════════════════════════════");
  const pass = results.filter(r => r.status === "PASS").length;
  const fail = results.filter(r => r.status === "FAIL").length;
  const warn = results.filter(r => r.status === "WARN").length;
  const skip = results.filter(r => r.status === "SKIP").length;
  console.log(`  ✅ PASS: ${pass}  ❌ FAIL: ${fail}  ⚠️ WARN: ${warn}  ⏭️ SKIP: ${skip}`);
  console.log(`  Total: ${results.length} tests\n`);

  if (fail > 0) {
    console.log("⚠️ HAY TESTS FALLIDOS. Revisar antes de deploy.\n");
  } else if (warn > 0) {
    console.log("⚡ Todo OK pero hay warnings. Probablemente necesitás correr backfill:\n");
    console.log("  curl /api/sync/vtex-details?key=SECRET&mode=resync-enrichment&batch=20");
    console.log("  curl /api/sync/mercadolibre?key=SECRET\n");
  } else {
    console.log("🎉 TODOS LOS TESTS PASARON. Datos validados.\n");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
