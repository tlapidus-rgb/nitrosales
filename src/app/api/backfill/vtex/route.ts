// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
// VTEX Backfill Endpoint ÃÂ¢ÃÂÃÂ Clean historical data import
// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
// Phases:
//   1. "catalog"   ÃÂ¢ÃÂÃÂ Sync all products from VTEX catalog
//   2. "inventory"  ÃÂ¢ÃÂÃÂ Get real stock for each SKU from VTEX Logistics
//   3. "orders"     ÃÂ¢ÃÂÃÂ Import historical orders (up to 2 years)
//
// Usage: GET /api/backfill/vtex?phase=catalog&batch=0&key=SECRET
// Each call processes one batch. Keep calling with batch++ until done=true.
// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ Config ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
const ORG_ID = "cmmmga1uq0000sb43w0krvvys";
const VTEX_ACCOUNT = "mundojuguete";
const VTEX_KEY = "vtexappkey-mundojuguete-ZMTYUJ";
const VTEX_TOKEN = "RSXGIUXPYGDHTDZWHBDBRJKMTFNYAISMOANAHPXZNBRSQKHPTFQNJUAZOKEXHCIOVEENIPJMUXVKJWFYHJQRBXOORRWSYGAAYXGNNSKCLVKAVOUQGDRMGDWQQHXBEULB";
const BACKFILL_SECRET = "nitrosales-backfill-2024";

const VTEX_BASE = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br`;
const VTEX_HEADERS = {
  "X-VTEX-API-AppKey": VTEX_KEY,
  "X-VTEX-API-AppToken": VTEX_TOKEN,
  "Content-Type": "application/json",
  Accept: "application/json",
};

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ Batch sizes (tuned for 10s Vercel timeout) ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
const CATALOG_BATCH_SIZE = 30;    // Products per batch
const INVENTORY_BATCH_SIZE = 20;  // SKU lookups per batch (each ~300ms)
const ORDERS_PER_BATCH = 10;      // Order details per batch (each ~500ms)

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
// VTEX API helpers
// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ

async function vtexFetch(path: string) {
  const url = `${VTEX_BASE}${path}`;
  const res = await fetch(url, { headers: VTEX_HEADERS });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`VTEX ${res.status}: ${path} ÃÂ¢ÃÂÃÂ ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Get all product+SKU IDs (paginated by range)
async function getProductSkuIds(from: number, to: number) {
  return vtexFetch(
    `/api/catalog_system/pvt/products/GetProductAndSkuIds?categoryId=&_from=${from}&_to=${to}`
  );
}

// Get product detail by product ID
async function getProductDetail(productId: string) {
  return vtexFetch(
    `/api/catalog_system/pvt/products/productget/${productId}`
  );
}

// Get SKU detail (includes image)
async function getSkuDetail(skuId: string) {
  return vtexFetch(
    `/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`
  );
}

// Get inventory for a SKU across all warehouses
async function getSkuInventory(skuId: string) {
  return vtexFetch(
    `/api/logistics/pvt/inventory/skus/${skuId}`
  );
}

// List orders by date range (paginated)
async function listOrders(from: string, to: string, page: number, perPage: number = 15) {
  return vtexFetch(
    `/api/oms/pvt/orders?f_creationDate=creationDate:[${from}T00:00:00.000Z TO ${to}T23:59:59.999Z]&page=${page}&per_page=${perPage}&orderBy=creationDate,desc`
  );
}

// Get single order detail
async function getOrderDetail(orderId: string) {
  return vtexFetch(`/api/oms/pvt/orders/${orderId}`);
}

// Map VTEX order status to our enum
function mapOrderStatus(vtexStatus: string): string | null {
  if (!vtexStatus) return null; // Empty VTEX status = ghost marketplace order, skip
  const map: Record<string, string> = {
    "order-completed": "DELIVERED",
    "handling": "APPROVED",
    "ready-for-handling": "APPROVED",
    "start-handling": "APPROVED",
    "waiting-for-sellers-confirmation": "PENDING",
    "payment-pending": "PENDING",
    "payment-approved": "APPROVED",
    "invoiced": "INVOICED",
    "canceled": "CANCELLED",
    "cancellation-requested": "PENDING",   // Solicitud, no confirmada
    "replaced": "APPROVED",                // Reemplazada por otra orden
    "window-to-cancel": "PENDING",
  };
  return map[vtexStatus] || "APPROVED";
}

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
// PHASE 1: CATALOG ÃÂ¢ÃÂÃÂ Sync products from VTEX
// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ

async function phaseCatalog(batch: number) {
  const from = batch * CATALOG_BATCH_SIZE;
  const to = from + CATALOG_BATCH_SIZE - 1;

  // Get product IDs for this range
  const data = await getProductSkuIds(from, to);
  const productIds = Object.keys(data.data || {});
  const totalRange = data.range?.total || 0;

  if (productIds.length === 0) {
    return {
      phase: "catalog",
      batch,
      processed: 0,
      totalProducts: totalRange,
      done: true,
      message: "CatÃÂÃÂ¡logo completo ÃÂ¢ÃÂÃÂ no hay mÃÂÃÂ¡s productos",
    };
  }

  let processed = 0;
  const errors: string[] = [];

  for (const productId of productIds) {
    try {
      const detail = await getProductDetail(productId);
      const skuIds: string[] = data.data[productId] || [];

      // Get first SKU detail for image
      let imageUrl: string | null = null;
      let firstSkuId: string | null = skuIds[0] || null;
      if (firstSkuId) {
        try {
          const skuDetail = await getSkuDetail(firstSkuId);
          imageUrl = skuDetail.Images?.[0]?.ImageUrl || skuDetail.ImageUrl || null;
        } catch (e) {
          // Non-critical, continue
        }
      }

      // Upsert product
      const externalId = String(productId);
      const name = detail.Name || detail.name || "Sin nombre";
      const category = detail.CategoryName || detail.DepartmentName || null;
      const brand = detail.BrandName || null;
      const price = detail.CommercialConditionPrice || detail.ListPrice || 0;
      const sku = firstSkuId || null;
      const isActive = detail.IsActive !== false;

      await prisma.$executeRaw`
        INSERT INTO products ("id", "externalId", "name", "sku", "category", "brand", "price", "imageUrl", "isActive", "organizationId", "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid()::text,
          ${externalId},
          ${name},
          ${sku},
          ${category},
          ${brand},
          ${price},
          ${imageUrl},
          ${isActive},
          ${ORG_ID},
          NOW(),
          NOW()
        )
        ON CONFLICT ("organizationId", "externalId")
        DO UPDATE SET
          name = EXCLUDED.name,
          sku = EXCLUDED.sku,
          category = EXCLUDED.category,
          brand = EXCLUDED.brand,
          price = EXCLUDED.price,
          "imageUrl" = EXCLUDED."imageUrl",
          "isActive" = EXCLUDED."isActive",
          "updatedAt" = NOW()
      `;

      processed++;
    } catch (e: any) {
      errors.push(`Product ${productId}: ${e.message?.slice(0, 100)}`);
    }
  }

  const processedSoFar = from + productIds.length;
  const done = processedSoFar >= totalRange || productIds.length === 0;

  return {
    phase: "catalog",
    batch,
    processed,
    processedSoFar,
    totalProducts: totalRange,
    nextBatch: done ? null : batch + 1,
    done,
    errors: errors.length > 0 ? errors : undefined,
    message: done
      ? `CatÃÂÃÂ¡logo completo. ${processedSoFar} productos totales procesados.`
      : `Batch ${batch}: ${processed} productos (${processedSoFar}/${totalRange}). Continuar con batch=${batch + 1}`,
  };
}

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
// PHASE 2: INVENTORY ÃÂ¢ÃÂÃÂ Get real stock from VTEX Logistics
// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ

async function phaseInventory(batch: number) {
  // Get all products that have a SKU
  const allProducts = await prisma.$queryRaw<
    { id: string; sku: string; externalId: string }[]
  >`
    SELECT id, sku, "externalId"
    FROM products
    WHERE "organizationId" = ${ORG_ID}
      AND sku IS NOT NULL
      AND "isActive" = true
    ORDER BY id
  `;

  const total = allProducts.length;
  const start = batch * INVENTORY_BATCH_SIZE;
  const batchProducts = allProducts.slice(start, start + INVENTORY_BATCH_SIZE);

  if (batchProducts.length === 0) {
    return {
      phase: "inventory",
      batch,
      processed: 0,
      total,
      done: true,
      message: "Inventario completo ÃÂ¢ÃÂÃÂ todos los productos actualizados",
    };
  }

  let processed = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const product of batchProducts) {
    try {
      const skuId = product.sku;
      const invData = await getSkuInventory(skuId);

      // Sum available quantity across all warehouses
      let totalAvailable = 0;
      if (invData.balance) {
        for (const warehouse of invData.balance) {
          totalAvailable += warehouse.totalQuantity || 0;
        }
      }

      // Update stock in DB
      await prisma.$executeRaw`
        UPDATE products
        SET stock = ${totalAvailable},
            "stockUpdatedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE id = ${product.id}
      `;

      updated++;
      processed++;
    } catch (e: any) {
      errors.push(`SKU ${product.sku}: ${e.message?.slice(0, 100)}`);
      processed++;
    }
  }

  const done = start + batchProducts.length >= total;

  return {
    phase: "inventory",
    batch,
    processed,
    updated,
    total,
    nextBatch: done ? null : batch + 1,
    done,
    errors: errors.length > 0 ? errors : undefined,
    message: done
      ? `Inventario completo. ${updated} SKUs actualizados.`
      : `Batch ${batch}: ${updated}/${processed} actualizados. Continuar con batch=${batch + 1}`,
  };
}

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
// PHASE 3: ORDERS ÃÂ¢ÃÂÃÂ Import historical orders
// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ

async function phaseOrders(batch: number, startPage: number = 1, startIndex: number = 0) {
  // Each batch = 1 month, starting from today going backwards
  // batch 0 = current month, batch 1 = last month, etc.
  // VTEX allows max 2 years = 24 months
  const MAX_MONTHS = 24;

  if (batch >= MAX_MONTHS) {
    return {
      phase: "orders",
      batch,
      done: true,
      message: "ÃÂÃÂrdenes histÃÂÃÂ³ricas completas ÃÂ¢ÃÂÃÂ 2 aÃÂÃÂ±os importados",
    };
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() - batch, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() - batch + 1, 0);
  const fromStr = monthStart.toISOString().split("T")[0];
  const toStr = monthEnd.toISOString().split("T")[0];
  const monthLabel = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;

  let page = startPage;
  let totalOrders = 0;
  let processedOrders = 0;
  let savedOrders = 0;
  const errors: string[] = [];
  let hasMore = true;

  // Process orders page by page within the timeout budget
  const startTime = Date.now();
  const TIME_BUDGET_MS = 8000; // Leave 2s margin for Vercel

  let idxStart = startIndex;

  while (hasMore && (Date.now() - startTime) < TIME_BUDGET_MS) {
    try {
      const listData = await listOrders(fromStr, toStr, page, 15);
      totalOrders = listData.paging?.total || 0;
      const orders = listData.list || [];

      if (orders.length === 0) {
        hasMore = false;
        break;
      }

      idxStart = (page === startPage) ? idxStart : 0;
      let timedOut = false;
      for (let idx = idxStart; idx < orders.length; idx++) {
        if ((Date.now() - startTime) > TIME_BUDGET_MS) {
          timedOut = true;
          idxStart = idx; // remember where we stopped
          break;
        }

        try {
          const order = await getOrderDetail(orders[idx].orderId);
          await saveOrder(order);
          savedOrders++;
        } catch (e: any) {
          errors.push(`Order ${orders[idx].orderId}: ${e.message?.slice(0, 200)}`);
        }
        processedOrders++;
        idxStart = idx + 1; // track next position
      }

      // Check if we timed out mid-page or finished the page
      if (timedOut) {
        // Stay on same page, will resume from idxStart
        hasMore = true;
        break;
      }
      const totalPages = Math.ceil(totalOrders / 15);
      if (page >= totalPages) {
        hasMore = false;
      } else {
        page++;
        idxStart = 0; // reset for new page
      }
    } catch (e: any) {
      errors.push(`List page ${page}: ${e.message?.slice(0, 100)}`);
      hasMore = false;
    }
  }


  return {
    phase: "orders",
    batch,
    month: monthLabel,
    totalOrdersInMonth: totalOrders,
    processed: processedOrders,
    saved: savedOrders,
    nextBatch: hasMore ? batch : batch + 1,
      nextPage: hasMore ? page : 1,
      nextIndex: hasMore ? idxStart : 0,
      hasMorePages: hasMore,
      lastPage: page,
    done: !hasMore && batch >= MAX_MONTHS - 1,
    errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    message: `Mes ${monthLabel}: ${savedOrders}/${processedOrders} ÃÂÃÂ³rdenes guardadas (de ${totalOrders} total). ${
      batch < MAX_MONTHS - 1 ? `Continuar con batch=${batch + 1}` : "Completo"
    }`,
  };
}

// Save a single VTEX order to our DB
async function saveOrder(order: any) {
  const externalId = order.orderId;
  const status = mapOrderStatus(order.status);
  if (!status) return; // Skip ghost marketplace orders with empty VTEX status
  const totalValue = (order.value || 0) / 100; // VTEX stores in cents
  const itemCount = (order.items || []).length;
  const orderDate = new Date(order.creationDate);
  const channel = order.origin || "marketplace";
  const paymentMethod = order.paymentData?.transactions?.[0]?.payments?.[0]?.paymentSystemName || null;
  const shippingCost = (order.totals?.find((t: any) => t.id === "Shipping")?.value || 0) / 100;
  const discountValue = Math.abs((order.totals?.find((t: any) => t.id === "Discounts")?.value || 0)) / 100;

  // Upsert customer
  let customerId: string | null = null;
  const profile = order.clientProfileData;
  if (profile?.email) {
    const customerExternalId = profile.userProfileId || profile.email;
    const result = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO customers ("id", "externalId", "email", "firstName", "lastName", "city", "state", "country", "organizationId", "createdAt", "updatedAt", "totalOrders", "totalSpent")
      VALUES (
        gen_random_uuid()::text,
        ${customerExternalId},
        ${profile.email},
        ${profile.firstName || null},
        ${profile.lastName || null},
        ${order.shippingData?.address?.city || null},
        ${order.shippingData?.address?.state || null},
        ${order.shippingData?.address?.country || "ARG"},
        ${ORG_ID},
        NOW(),
        NOW(),
        1,
        ${totalValue}
      )
      ON CONFLICT ("organizationId", "externalId")
      DO UPDATE SET
        "lastName" = COALESCE(EXCLUDED."lastName", customers."lastName"),
        "city" = COALESCE(EXCLUDED."city", customers."city"),
        "state" = COALESCE(EXCLUDED."state", customers."state"),
        "totalOrders" = customers."totalOrders" + 1,
        "totalSpent" = customers."totalSpent" + EXCLUDED."totalSpent",
        "lastOrderAt" = GREATEST(customers."lastOrderAt", ${orderDate}),
        "updatedAt" = NOW()
      RETURNING id
    `;
    customerId = result[0]?.id || null;
  }

  // Upsert order
  const orderResult = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO orders ("id", "externalId", "status", "totalValue", "currency", "itemCount", "channel", "paymentMethod", "shippingCost", "discountValue", "orderDate", "organizationId", "customerId", "createdAt")
    VALUES (
      gen_random_uuid()::text,
      ${externalId},
      ${status}::"OrderStatus",
      ${totalValue},
      'ARS',
      ${itemCount},
      ${channel},
      ${paymentMethod},
      ${shippingCost},
      ${discountValue},
      ${orderDate},
      ${ORG_ID},
      ${customerId},
      NOW()
    )
    ON CONFLICT ("organizationId", "externalId")
    DO UPDATE SET
      status = ${status}::"OrderStatus",
      "totalValue" = EXCLUDED."totalValue",
      "itemCount" = EXCLUDED."itemCount"
    RETURNING id
  `;

  const dbOrderId = orderResult[0]?.id;
  if (!dbOrderId) return;

  // Delete existing items and re-insert (simpler than upsert per item)
  await prisma.$executeRaw`DELETE FROM order_items WHERE "orderId" = ${dbOrderId}`;

  // Insert order items
  for (const item of order.items || []) {
    const productExternalId = String(item.productId || item.id);
    const quantity = item.quantity || 1;
    const unitPrice = (item.sellingPrice || item.price || 0) / 100;
    const totalPrice = unitPrice * quantity;

    // Find product in our DB
    const productMatch = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM products
      WHERE "organizationId" = ${ORG_ID} AND "externalId" = ${productExternalId}
      LIMIT 1
    `;
    const productId = productMatch[0]?.id || null;

    await prisma.$executeRaw`
      INSERT INTO order_items ("id", "quantity", "unitPrice", "totalPrice", "orderId", "productId")
      VALUES (gen_random_uuid()::text, ${quantity}, ${unitPrice}, ${totalPrice}, ${dbOrderId}, ${productId})
    `;
  }
}


// ════════════════════════════════════════════════════════════
// PHASE: FIX-STATUSES — Correct ghost CANCELLED orders
// ════════════════════════════════════════════════════════════

async function phaseFixStatuses(batch: number) {
  const BATCH_SIZE = 10;
  const offset = batch * 10;
  const startTime = Date.now();

  const cancelledOrders = await prisma.$queryRawUnsafe<{id: string, externalId: string}[]>(
    `SELECT id, "externalId" FROM orders
    WHERE "organizationId" = '${ORG_ID}' AND status = 'CANCELLED'::"OrderStatus"
    ORDER BY "orderDate" DESC
    LIMIT 10 OFFSET ${offset}`
  )

  const countResult = await prisma.$queryRawUnsafe<{count: string}[]>(
    `SELECT COUNT(*)::text as count FROM orders
    WHERE "organizationId" = '${ORG_ID}' AND status = 'CANCELLED'::"OrderStatus"`
  )
  const totalCancelled = Number(countResult[0]?.count || 0);

  let updated = 0, deleted = 0, kept = 0;
  const errors: string[] = [];

  for (const order of cancelledOrders) {
    if ((Date.now() - startTime) > 8000) break;
    try {
      const vtexOrder = await getOrderDetail(order.externalId);
      const newStatus = mapOrderStatus(vtexOrder.status);

      if (!newStatus) {
        await prisma.$executeRaw`DELETE FROM order_items WHERE "orderId" = ${order.id}`;
        await prisma.$executeRaw`DELETE FROM orders WHERE id = ${order.id}`;
        deleted++;
      } else if (newStatus !== 'CANCELLED') {
        await prisma.$executeRaw`
          UPDATE orders SET status = ${newStatus}::"OrderStatus", "updatedAt" = NOW()
          WHERE id = ${order.id}
        `;
        updated++;
      } else {
        kept++;
      }
    } catch (e: any) {
      errors.push(`${order.externalId}: ${e.message?.slice(0, 100)}`);
    }
  }

  return {
    phase: "fix-statuses",
    batch,
    totalCancelled,
    processed: cancelledOrders.length,
    updated,
    deleted,
    kept,
    hasMore: offset + 10 < totalCancelled,
    nextBatch: batch + 1,
    errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    message: `Fixed: ${updated} updated, ${deleted} deleted, ${kept} kept of ${cancelledOrders.length} processed (${totalCancelled} total CANCELLED). Next: batch=${batch + 1}`,
  };
}

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
// MAIN HANDLER
// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ

export async function GET(request: Request) {
  // Fix BigInt serialization for all Prisma queries
  // @ts-ignore
  BigInt.prototype.toJSON = function() { return Number(this); };
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const phase = url.searchParams.get("phase");
  const batch = parseInt(url.searchParams.get("batch") || "0", 10);
  const startPage = parseInt(url.searchParams.get('page') || '1', 10);
  const startIndex = parseInt(url.searchParams.get('startIndex') || '0', 10);

  // Security check
  if (key !== BACKFILL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!phase || !["catalog", "inventory", "orders", "fix-statuses"].includes(phase)) {
    return NextResponse.json({
      error: "Invalid phase. Use: catalog, inventory, or orders",
      usage: {
        step1: "/api/backfill/vtex?phase=catalog&batch=0&key=SECRET",
        step2: "/api/backfill/vtex?phase=inventory&batch=0&key=SECRET",
        step3: "/api/backfill/vtex?phase=orders&batch=0&key=SECRET",
      },
    }, { status: 400 });
  }

  try {
    let result;
    switch (phase) {
      case "catalog":
        result = await phaseCatalog(batch);
        break;
      case "inventory":
        result = await phaseInventory(batch);
        break;
      case "orders":
        result = await phaseOrders(batch, startPage, startIndex);
        break;
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error(`[Backfill ${phase}] Error:`, error);
    return NextResponse.json({
      error: error.message,
      phase,
      batch,
    }, { status: 500 });
  }
}
