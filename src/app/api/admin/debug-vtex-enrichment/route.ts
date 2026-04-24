// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/debug-vtex-enrichment?orgId=X
// ══════════════════════════════════════════════════════════════
// Diagnostico quirurgico de por que el enrichment de VTEX fallo
// post-backfill. Agarra 1 order de la DB (la mas nueva), y hace
// paso-a-paso cada fase del enrichment con logs verbose + errores
// capturados. Ningun side-effect real: usa un dbOrderId ficticio
// para el test (dry-run con rollback si detecta cambios).
//
// Output paso a paso:
//  1. Creds de VTEX OK?
//  2. Sample order en DB
//  3. Fetch detail de VTEX (status, body size, errores)
//  4. Parse data (clientProfileData, items, totals, etc.)
//  5. Intento de enrichment verbose (customer, products, items)
//     → en dry-run para no ensuciar la DB
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { decryptCredentials } from "@/lib/crypto";
import { extractRealEmail } from "@/lib/connectors/vtex-enrichment";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const steps: any[] = [];
  const push = (step: string, data: any) => steps.push({ step, ...data });

  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const orgId = url.searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

    // ── STEP 1: Credenciales ──
    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "VTEX" as any },
      select: { credentials: true },
    });
    if (!conn) {
      push("1_credentials", { ok: false, error: "No VTEX connection" });
      return NextResponse.json({ ok: false, steps }, { status: 404 });
    }
    let creds: any;
    const raw = conn.credentials as any;
    try {
      if (typeof raw === "string") {
        creds = decryptCredentials(raw);
      } else if (typeof raw === "object" && raw !== null) {
        creds = raw;
      } else {
        creds = JSON.parse(raw);
      }
    } catch (e: any) {
      push("1_credentials", { ok: false, error: `decrypt failed: ${e.message}` });
      return NextResponse.json({ ok: false, steps });
    }
    push("1_credentials", {
      ok: true,
      accountName: creds?.accountName || null,
      hasAppKey: !!creds?.appKey,
      appKeyPrefix: creds?.appKey?.slice(0, 8) || null,
      hasAppToken: !!creds?.appToken,
      appTokenLen: creds?.appToken?.length || 0,
    });

    if (!creds?.accountName || !creds?.appKey || !creds?.appToken) {
      return NextResponse.json({ ok: false, steps });
    }

    // ── STEP 2: Sample order ──
    const sampleOrder = await prisma.order.findFirst({
      where: { organizationId: orgId, source: "VTEX" as any },
      orderBy: { orderDate: "desc" },
      select: { id: true, externalId: true, status: true, totalValue: true, orderDate: true },
    });
    if (!sampleOrder) {
      push("2_sample_order", { ok: false, error: "No orders in DB" });
      return NextResponse.json({ ok: false, steps });
    }
    push("2_sample_order", { ok: true, order: sampleOrder });

    // ── STEP 3: Fetch detail ──
    const detailUrl = `https://${creds.accountName}.vtexcommercestable.com.br/api/oms/pvt/orders/${sampleOrder.externalId}`;
    const headers: Record<string, string> = {
      "X-VTEX-API-AppKey": creds.appKey,
      "X-VTEX-API-AppToken": creds.appToken,
      Accept: "application/json",
    };

    let detailRes: Response;
    let detailBody: string = "";
    try {
      detailRes = await fetch(detailUrl, { headers });
      detailBody = await detailRes.text();
    } catch (e: any) {
      push("3_fetch_detail", { ok: false, error: `fetch threw: ${e.message}`, url: detailUrl });
      return NextResponse.json({ ok: false, steps });
    }

    push("3_fetch_detail", {
      ok: detailRes.ok,
      status: detailRes.status,
      url: detailUrl,
      bodyPreview: detailBody.slice(0, 500),
      bodySize: detailBody.length,
    });

    if (!detailRes.ok) {
      return NextResponse.json({ ok: false, steps });
    }

    // ── STEP 4: Parse ──
    let vData: any;
    try {
      vData = JSON.parse(detailBody);
    } catch (e: any) {
      push("4_parse", { ok: false, error: `parse failed: ${e.message}` });
      return NextResponse.json({ ok: false, steps });
    }
    push("4_parse", {
      ok: true,
      shape: {
        hasClientProfileData: !!vData.clientProfileData,
        email: vData.clientProfileData?.email?.slice(0, 30) || null,
        firstName: vData.clientProfileData?.firstName || null,
        userProfileId: vData.clientProfileData?.userProfileId || null,
        itemsCount: Array.isArray(vData.items) ? vData.items.length : 0,
        firstItem: vData.items?.[0] ? {
          id: vData.items[0].id,
          refId: vData.items[0].refId,
          sellerSku: vData.items[0].sellerSku,
          name: vData.items[0].name?.slice(0, 60),
          quantity: vData.items[0].quantity,
          sellingPrice: vData.items[0].sellingPrice,
          price: vData.items[0].price,
          imageUrl: !!vData.items[0].imageUrl,
          brand: vData.items[0].additionalInfo?.brandName || null,
          category: vData.items[0].additionalInfo?.categoriesIds || null,
        } : null,
        hasShippingData: !!vData.shippingData,
        hasTotals: Array.isArray(vData.totals),
        totalsSample: (vData.totals || []).slice(0, 3),
      },
    });

    // ── STEP 5: Dry-run enrichment (wrapped in transaction + rollback) ──
    // Usamos tx.$queryRawUnsafe("ROLLBACK") al final para no ensuciar la DB.
    // Alternativa segura: intentar en un transaction que siempre rollbackea.
    const enrichmentLog: any[] = [];
    try {
      await prisma.$transaction(async (tx) => {
        // 5a. Customer
        const profile = vData.clientProfileData;
        if (profile) {
          const rawEmail = profile.email || "";
          const realEmail = rawEmail ? extractRealEmail(rawEmail) : "";
          const firstName = profile.firstName || null;
          const lastName = profile.lastName || null;
          const customerExtId = profile.userProfileId || rawEmail || `vtex-anon-${vData.orderId}`;

          if (firstName || lastName || realEmail) {
            try {
              const customer = await tx.customer.upsert({
                where: {
                  organizationId_externalId: { organizationId: orgId, externalId: customerExtId },
                },
                create: {
                  organizationId: orgId,
                  externalId: customerExtId,
                  email: realEmail || null,
                  firstName,
                  lastName,
                  city: vData.shippingData?.address?.city || null,
                  state: vData.shippingData?.address?.state || null,
                  country: vData.shippingData?.address?.country || null,
                  firstOrderAt: new Date(vData.creationDate),
                  lastOrderAt: new Date(vData.creationDate),
                  totalOrders: 1,
                  totalSpent: (vData.value || 0) / 100,
                },
                update: {
                  ...(realEmail ? { email: realEmail } : {}),
                  ...(firstName ? { firstName } : {}),
                  ...(lastName ? { lastName } : {}),
                },
              });
              enrichmentLog.push({ stage: "customer", ok: true, id: customer.id });
            } catch (e: any) {
              enrichmentLog.push({ stage: "customer", ok: false, error: e.message });
            }
          } else {
            enrichmentLog.push({ stage: "customer", ok: false, error: "no firstName/lastName/email" });
          }
        }

        // 5b. Items + Products (solo el primer item como test)
        const items = vData.items || [];
        if (items.length > 0) {
          const item = items[0];
          const productExtId = String(item.id || item.productId);
          const realSku = (item.refId || item.sellerSku || "").trim() || null;

          try {
            const product = await tx.product.upsert({
              where: {
                organizationId_externalId: { organizationId: orgId, externalId: productExtId },
              },
              create: {
                organizationId: orgId,
                externalId: productExtId,
                sku: realSku,
                name: item.name || `SKU ${productExtId}`,
                brand: item.additionalInfo?.brandName || null,
                category: item.additionalInfo?.categoriesIds || null,
                price: (item.sellingPrice || item.price) / 100,
                imageUrl: item.imageUrl || null,
                isActive: true,
              },
              update: {
                name: item.name || undefined,
                price: (item.sellingPrice || item.price) / 100,
              },
            });
            enrichmentLog.push({ stage: "product", ok: true, id: product.id, sku: realSku, extId: productExtId });

            // OrderItem test (solo si no hay ya OrderItems)
            const existing = await tx.orderItem.count({ where: { orderId: sampleOrder.id } });
            enrichmentLog.push({ stage: "orderitem_precheck", existingCount: existing });
            if (existing === 0) {
              try {
                await tx.orderItem.create({
                  data: {
                    orderId: sampleOrder.id,
                    productId: product.id,
                    quantity: item.quantity,
                    unitPrice: (item.sellingPrice || item.price) / 100,
                    totalPrice: ((item.sellingPrice || item.price) * item.quantity) / 100,
                  } as any,
                });
                enrichmentLog.push({ stage: "orderitem", ok: true });
              } catch (e: any) {
                enrichmentLog.push({ stage: "orderitem", ok: false, error: e.message });
              }
            }
          } catch (e: any) {
            enrichmentLog.push({ stage: "product", ok: false, error: e.message, extId: productExtId, sku: realSku });
          }
        }

        // ROLLBACK INTENCIONAL: lanzamos error adentro de la tx para que prisma rollbackee
        throw new Error("__DRY_RUN_ROLLBACK__");
      });
    } catch (e: any) {
      if (e.message !== "__DRY_RUN_ROLLBACK__") {
        enrichmentLog.push({ stage: "tx_error", error: e.message, stack: e.stack?.slice(0, 300) });
      }
    }

    push("5_enrichment_dryrun", { ok: true, log: enrichmentLog });

    return NextResponse.json({
      ok: true,
      orgId,
      steps,
      summary: "Revisa cada step. El primero que tenga ok:false es la causa raiz.",
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err.message,
      stack: err.stack?.slice(0, 500),
      stepsCompleted: steps,
    }, { status: 500 });
  }
}
