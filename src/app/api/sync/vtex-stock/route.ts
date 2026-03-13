import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");

    if (key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const batchSize = parseInt(url.searchParams.get("batch") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const account = process.env.VTEX_ACCOUNT || "";
    const appKey = process.env.VTEX_APP_KEY || "";
    const appToken = process.env.VTEX_APP_TOKEN || "";

    if (!account || !appKey || !appToken) {
      return NextResponse.json(
        { error: "Missing VTEX credentials" },
        { status: 400 }
      );
    }

    const vtexHeaders = {
      "X-VTEX-API-AppKey": appKey,
      "X-VTEX-API-AppToken": appToken,
      Accept: "application/json",
    };

    const org = await prisma.organization.findFirst({
      where: { slug: "elmundodeljuguete" },
    });
    if (!org)
      return NextResponse.json({ error: "Org not found" }, { status: 404 });

    // Get products that have a SKU (needed for inventory lookup)
    const products = await prisma.product.findMany({
      where: {
        organizationId: org.id,
        sku: { not: null },
      },
      select: {
        id: true,
        externalId: true,
        sku: true,
        name: true,
      },
      skip: offset,
      take: batchSize,
      orderBy: { updatedAt: "asc" },
    });

    if (products.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No more products to sync",
        updated: 0,
        total: 0,
      });
    }

    const totalProducts = await prisma.product.count({
      where: {
        organizationId: org.id,
        sku: { not: null },
      },
    });

    let updated = 0;
    let errors: string[] = [];

    for (const product of products) {
      try {
        const skuId = product.sku!.trim();

        // Try inventory by SKU first
        const invUrl = `https://${account}.vtexcommercestable.com.br/api/logistics/pvt/inventory/skus/${skuId}`;

        const res = await fetch(invUrl, { headers: vtexHeaders });

        if (!res.ok) {
          // If SKU fails, try getting SKUs from product detail
          if (res.status === 404) {
            // Try fetching product to get its SKU IDs
            const prodUrl = `https://${account}.vtexcommercestable.com.br/api/catalog_system/pvt/products/productget/${product.externalId}`;
            const prodRes = await fetch(prodUrl, { headers: vtexHeaders });

            if (prodRes.ok) {
              const prodData = await prodRes.json();
              // VTEX returns SKU IDs in the product detail
              const skuIds: string[] = [];
              if (prodData.Id) {
                // Try getting SKUs for this product
                const skuListUrl = `https://${account}.vtexcommercestable.com.br/api/catalog_system/pvt/sku/stockkeepingunitsByProductId/${product.externalId}`;
                const skuListRes = await fetch(skuListUrl, {
                  headers: vtexHeaders,
                });
                if (skuListRes.ok) {
                  const skuList = await skuListRes.json();
                  for (const s of skuList) {
                    if (s.Id) skuIds.push(String(s.Id));
                  }
                }
              }

              // Sum stock across all SKUs
              let totalStock = 0;
              let foundAny = false;

              for (const sid of skuIds) {
                try {
                  const sInvUrl = `https://${account}.vtexcommercestable.com.br/api/logistics/pvt/inventory/skus/${sid}`;
                  const sRes = await fetch(sInvUrl, { headers: vtexHeaders });
                  if (sRes.ok) {
                    const sData = await sRes.json();
                    if (sData.balance && Array.isArray(sData.balance)) {
                      for (const wh of sData.balance) {
                        const available =
                          (wh.totalQuantity || 0) -
                          (wh.reservedQuantity || 0);
                        totalStock += Math.max(0, available);
                      }
                      foundAny = true;
                    }
                  }
                } catch {}
              }

              if (foundAny) {
                await prisma.product.update({
                  where: { id: product.id },
                  data: {
                    stock: totalStock,
                    stockUpdatedAt: new Date(),
                  },
                });
                updated++;
              } else {
                errors.push(
                  `${product.name} (${product.externalId}): no SKU inventory found`
                );
              }
            } else {
              errors.push(
                `${product.name} (${skuId}): product detail ${prodRes.status}`
              );
            }
          } else {
            errors.push(
              `${product.name} (${skuId}): inventory API ${res.status}`
            );
          }
          continue;
        }

        // Direct SKU inventory found
        const data = await res.json();
        let totalStock = 0;

        if (data.balance && Array.isArray(data.balance)) {
          for (const wh of data.balance) {
            const available =
              (wh.totalQuantity || 0) - (wh.reservedQuantity || 0);
            totalStock += Math.max(0, available);
          }
        }

        await prisma.product.update({
          where: { id: product.id },
          data: {
            stock: totalStock,
            stockUpdatedAt: new Date(),
          },
        });
        updated++;
      } catch (e: any) {
        errors.push(
          `${product.name} (${product.sku}): ${e.message.substring(0, 100)}`
        );
      }
    }

    return NextResponse.json({
      ok: true,
      batch: products.length,
      updated,
      errors: errors.length,
      errorDetails: errors.slice(0, 10),
      totalProducts,
      offset,
      hasMore: offset + batchSize < totalProducts,
      nextOffset: offset + batchSize,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
