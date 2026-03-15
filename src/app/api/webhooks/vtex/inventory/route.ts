// ══════════════════════════════════════════════════════════════
// Webhook: VTEX SKU/Inventory Change Notifications (Real-time)
// ══════════════════════════════════════════════════════════════
// Endpoint: POST /api/webhooks/vtex/inventory
//
// VTEX Broadcaster envía una notificación cada vez que cambia
// el stock, precio, o datos de un SKU. Este endpoint recibe
// la notificación y actualiza el producto en NitroSales al instante.
//
// Payload de VTEX (Broadcaster - SKU change):
// {
//   "IdSku": "36204",
//   "An": "mundojuguete",
//   "IdAffiliate": "SPT",
//   "DateModified": "2024-01-15T10:30:00.000Z",
//   "IsActive": true,
//   "StockModified": true,
//   "PriceModified": false,
//   "HasStockKeepingUnitModified": false,
//   "HasStockKeepingUnitRemovedFromAffiliate": false
// }
//
// Este webhook reemplaza el inventory sync pesado de 28K SKUs.
// Solo actualiza los SKUs que realmente cambiaron.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // ── Validate key ──
    const key = req.nextUrl.searchParams.get("key") || "";
    if (key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse VTEX Broadcaster payload ──
    const body = await req.json();

    // Support both single notification and array of notifications
    const notifications = Array.isArray(body) ? body : [body];

    console.log(`[Webhook:Inventory] Received ${notifications.length} notification(s)`);

    // ── Get organization + VTEX credentials ──
    const connection = await prisma.connection.findFirst({
      where: { platform: "VTEX", status: "ACTIVE" },
      include: { organization: true },
    });

    if (!connection) {
      return NextResponse.json({ error: "No active VTEX connection" }, { status: 404 });
    }

    const org = connection.organization;
    const creds = connection.credentials as any;
    const vtexBaseUrl = `https://${creds.accountName}.vtexcommercestable.com.br`;
    const vtexHeaders = {
      "X-VTEX-API-AppKey": creds.appKey,
      "X-VTEX-API-AppToken": creds.appToken,
      Accept: "application/json",
    };

    const results: Array<{
      skuId: string;
      action: string;
      stock?: number;
      price?: number;
      error?: string;
    }> = [];

    for (const notification of notifications) {
      const skuId = String(notification.IdSku || notification.idSku || notification.skuId || "");

      if (!skuId) {
        results.push({ skuId: "unknown", action: "skipped", error: "No SKU ID in payload" });
        continue;
      }

      try {
        const updates: any = {};
        let fetchedStock = false;
        let fetchedDetail = false;

        // ── Fetch inventory if stock changed ──
        if (notification.StockModified !== false) {
          try {
            const invRes = await fetch(
              `${vtexBaseUrl}/api/logistics/pvt/inventory/skus/${skuId}`,
              { headers: vtexHeaders }
            );

            if (invRes.ok) {
              const invData = await invRes.json();
              let totalStock = 0;

              if (invData.balance && Array.isArray(invData.balance)) {
                for (const wh of invData.balance) {
                  if (wh.hasUnlimitedQuantity) {
                    totalStock += Math.max(0, wh.totalQuantity);
                    continue;
                  }
                  totalStock += Math.max(0, wh.totalQuantity - wh.reservedQuantity);
                }
              }

              updates.stock = totalStock;
              updates.stockUpdatedAt = new Date();
              fetchedStock = true;
            }
          } catch (e: any) {
            console.warn(`[Webhook:Inventory] Failed to fetch stock for SKU ${skuId}: ${e.message}`);
          }
        }

        // ── Fetch SKU detail if price or data changed ──
        if (
          notification.PriceModified !== false ||
          notification.HasStockKeepingUnitModified === true
        ) {
          try {
            const detailRes = await fetch(
              `${vtexBaseUrl}/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`,
              { headers: vtexHeaders }
            );

            if (detailRes.ok) {
              const detail = await detailRes.json();
              updates.name = detail.NameComplete || detail.ProductName || updates.name;
              updates.brand = detail.BrandName || undefined;
              updates.price = detail.Price || detail.ListPrice || undefined;
              updates.imageUrl = detail.Images?.[0]?.ImageUrl || undefined;
              updates.isActive = detail.IsActive !== false;
              updates.sku = detail.RefId || detail.Ean || undefined;

              const categories = detail.ProductCategories
                ? Object.values(detail.ProductCategories)
                : [];
              if (categories.length > 0) {
                updates.category = categories[categories.length - 1] as string;
              }

              fetchedDetail = true;
            }
          } catch (e: any) {
            console.warn(
              `[Webhook:Inventory] Failed to fetch detail for SKU ${skuId}: ${e.message}`
            );
          }
        }

        // ── If stock changed but no detail fetched, still fetch detail for new SKUs ──
        if (fetchedStock && !fetchedDetail) {
          // Check if product exists
          const existing = await prisma.product.findUnique({
            where: {
              organizationId_externalId: {
                organizationId: org.id,
                externalId: skuId,
              },
            },
          });

          if (!existing) {
            // New SKU - fetch full detail
            try {
              const detailRes = await fetch(
                `${vtexBaseUrl}/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`,
                { headers: vtexHeaders }
              );

              if (detailRes.ok) {
                const detail = await detailRes.json();
                updates.name = detail.NameComplete || detail.ProductName || `SKU ${skuId}`;
                updates.brand = detail.BrandName || null;
                updates.price = detail.Price || detail.ListPrice || 0;
                updates.imageUrl = detail.Images?.[0]?.ImageUrl || null;
                updates.isActive = detail.IsActive !== false;
                updates.sku = detail.RefId || detail.Ean || skuId;

                const categories = detail.ProductCategories
                  ? Object.values(detail.ProductCategories)
                  : [];
                if (categories.length > 0) {
                  updates.category = categories[categories.length - 1] as string;
                }
              }
            } catch (e: any) {
              console.warn(
                `[Webhook:Inventory] Failed to fetch detail for new SKU ${skuId}: ${e.message}`
              );
            }
          }
        }

        // ── Upsert product in DB ──
        if (Object.keys(updates).length > 0) {
          // Clean undefined values for create
          const createData: any = {
            organizationId: org.id,
            externalId: skuId,
            name: updates.name || `SKU ${skuId}`,
            sku: updates.sku || skuId,
            brand: updates.brand || null,
            category: updates.category || null,
            price: updates.price || 0,
            imageUrl: updates.imageUrl || null,
            isActive: updates.isActive !== undefined ? updates.isActive : true,
            stock: updates.stock !== undefined ? updates.stock : null,
            stockUpdatedAt: updates.stockUpdatedAt || new Date(),
          };

          // Clean undefined values for update
          const updateData: any = {};
          for (const [key, val] of Object.entries(updates)) {
            if (val !== undefined) updateData[key] = val;
          }

          await prisma.product.upsert({
            where: {
              organizationId_externalId: {
                organizationId: org.id,
                externalId: skuId,
              },
            },
            create: createData,
            update: updateData,
          });

          results.push({
            skuId,
            action: fetchedStock && fetchedDetail ? "stock+detail" : fetchedStock ? "stock" : "detail",
            stock: updates.stock,
            price: updates.price,
          });
        } else {
          results.push({ skuId, action: "no-change" });
        }

        // Small delay between SKUs to respect VTEX rate limits
        if (notifications.length > 1) await sleep(50);
      } catch (e: any) {
        console.error(`[Webhook:Inventory] Error processing SKU ${skuId}:`, e);
        results.push({ skuId, action: "error", error: e.message });
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[Webhook:Inventory] Processed ${results.length} SKU(s) in ${elapsed}ms`
    );

    return NextResponse.json({
      ok: true,
      processed: results.length,
      results,
      elapsedMs: elapsed,
    });
  } catch (error: any) {
    console.error("[Webhook:Inventory] Error:", error);
    // Return 200 to prevent VTEX from retrying on our app errors
    return NextResponse.json({
      ok: false,
      error: error.message,
    });
  }
}

// GET endpoint for testing connectivity
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || "";
  if (key !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    webhook: "vtex-inventory",
    message: "Webhook endpoint is active. VTEX Broadcaster should POST SKU notifications here.",
    timestamp: new Date().toISOString(),
  });
}
