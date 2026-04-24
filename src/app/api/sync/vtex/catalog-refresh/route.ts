// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/sync/vtex/catalog-refresh?orgId=X&key=Y
// ══════════════════════════════════════════════════════════════
// Refresh de precios canónicos de todos los Products de una org.
//
// Para cada Product.externalId (SKU VTEX):
//   1. Catalog Search → items[].sellers[0].commertialOffer.Price/ListPrice
//      = precio al cliente (con política aplicada) + precio tachado
//   2. Pricing API → costPrice, markup
//   3. Update Product con valores canónicos
//
// Por qué NO en el enrichment del order:
//   - Evita +2 calls por cada item de cada venta (podrían ser 40K+ calls extra).
//   - Un Product único puede aparecer en 100 ventas; refresh lo hace 1 vez.
//
// Se llama desde approve-backfill con waitUntil después del backfill de orders.
// Multi-tenant safe: orgId explícito.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { withConcurrency } from "@/lib/sync/concurrency";
import { retryWithBackoff, isRetryableStatus } from "@/lib/sync/retry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const REFRESH_KEY = "nitrosales-secret-key-2024-production";
const CONCURRENCY = 8;

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    if (key !== REFRESH_KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

    // Get VTEX connection creds
    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "VTEX" as any },
      select: { credentials: true },
    });
    if (!conn) return NextResponse.json({ error: "No VTEX connection" }, { status: 404 });
    const creds = conn.credentials as any;
    if (!creds?.accountName || !creds?.appKey || !creds?.appToken) {
      return NextResponse.json({ error: "VTEX credentials incomplete" }, { status: 400 });
    }

    // Get all Products of this org with externalId (from VTEX)
    // Filtro: los que se crearon/actualizaron en el último backfill (orders).
    const products = await prisma.product.findMany({
      where: { organizationId: orgId, externalId: { not: "" } },
      select: { id: true, externalId: true },
      take: 5000,
    });
    if (products.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, note: "No hay productos para refrescar" });
    }

    const headers = {
      "X-VTEX-API-AppKey": creds.appKey,
      "X-VTEX-API-AppToken": creds.appToken,
      Accept: "application/json",
    };
    const base = `https://${creds.accountName}.vtexcommercestable.com.br`;

    async function fetchWithRetry(path: string, method: string = "GET", body?: any): Promise<any | null> {
      try {
        return await retryWithBackoff(
          async () => {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 10_000);
            try {
              const init: RequestInit = { method, headers: { ...headers }, signal: ctrl.signal };
              if (body) {
                init.body = JSON.stringify(body);
                (init.headers as any)["Content-Type"] = "application/json";
              }
              const r = await fetch(`${base}${path}`, init);
              if (!r.ok) {
                const err: any = new Error(`VTEX ${r.status}`);
                err.status = r.status;
                if (r.status === 404) return null;
                throw err;
              }
              return await r.json();
            } finally {
              clearTimeout(t);
            }
          },
          { attempts: 3, baseMs: 400, capMs: 5000, shouldRetry: (err: any) => !err.status || isRetryableStatus(err.status) },
        );
      } catch {
        return null;
      }
    }

    let updated = 0;
    let failed = 0;
    let withRealPrice = 0;
    let withListPrice = 0;
    let withCost = 0;

    // Procesar en paralelo con límite de concurrency.
    // Fuentes usadas (misma estrategia que el test de credenciales):
    //  1. Simulation API → precio REAL al cliente (con política aplicada) + tachado
    //  2. Catalog Search → fallback precio si Simulation falla
    //  3. Pricing API → costo interno
    const tasks = products.map((prod) => async () => {
      try {
        const sku = prod.externalId;
        const [simData, catalogData, pricingData] = await Promise.all([
          fetchWithRetry(
            `/api/checkout/pub/orderForms/simulation?sc=1`,
            "POST",
            { items: [{ id: String(sku), quantity: 1, seller: "1" }], country: "ARG" },
          ),
          fetchWithRetry(`/api/catalog_system/pub/products/search?fq=skuId:${encodeURIComponent(sku)}&sc=1`),
          fetchWithRetry(`/api/pricing/prices/${sku}?_forceGet=true`),
        ]);

        // Precio real: prefiere Simulation (valores vienen en centavos)
        const simItem = simData?.items?.[0];
        const simPrice = typeof simItem?.price === "number" && simItem.price > 0 ? simItem.price / 100 : null;
        const simListPrice = typeof simItem?.listPrice === "number" && simItem.listPrice > 0 ? simItem.listPrice / 100 : null;

        // Fallback: Catalog Search commertialOffer
        const offer = catalogData?.[0]?.items?.find?.((it: any) => String(it.itemId) === String(sku))?.sellers?.[0]?.commertialOffer
          || catalogData?.[0]?.items?.[0]?.sellers?.[0]?.commertialOffer
          || null;

        const realPrice = simPrice != null ? simPrice : (offer?.Price != null && offer.Price > 0 ? Number(offer.Price) : null);
        const listPrice = simListPrice != null && simListPrice > (realPrice || 0)
          ? simListPrice
          : (offer?.ListPrice != null && offer.ListPrice > (realPrice || 0) ? Number(offer.ListPrice) : null);
        const costPrice = pricingData?.costPrice != null ? Number(pricingData.costPrice) : null;

        // Update solo campos que vinieron
        const data: any = {};
        if (realPrice != null) { data.price = realPrice; withRealPrice++; }
        if (listPrice != null) { data.compareAtPrice = listPrice; withListPrice++; }
        if (costPrice != null) { data.costPrice = costPrice; withCost++; }

        if (Object.keys(data).length > 0) {
          await prisma.product.update({ where: { id: prod.id }, data });
          updated++;
        }
      } catch (err: any) {
        failed++;
        console.error(`[catalog-refresh] ${prod.externalId}: ${err.message}`);
      }
    });

    await withConcurrency(tasks, CONCURRENCY);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return NextResponse.json({
      ok: true,
      orgId,
      totalProducts: products.length,
      updated,
      failed,
      stats: {
        withRealPrice,
        withListPrice,
        withCost,
      },
      elapsed: `${elapsed}s`,
    });
  } catch (err: any) {
    console.error("[catalog-refresh] fatal:", err);
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
