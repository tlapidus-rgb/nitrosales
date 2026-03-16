import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ORG_ID = "cmmmga1uq0000sb43w0krvvys";
const VTEX_ACCOUNT = "mundojuguete";
const VTEX_KEY = "vtexappkey-mundojuguete-DJQFRI";
const VTEX_TOKEN = "EXQOPZJMYNHGEIKWYDZMVGXSLLXQCQRDMZFTCFESIVKPPJQPMTTKIZJVJXDYAQFRLHXLPWLMUQEEJQTUGHRFSKIVEHHMHOMHGHHHOPQRKXNYKIKGXTLCEKNCRCXEBODKJDT";

async function getVtexBrand(externalId: string) {
  const headers = { "X-VTEX-API-AppKey": VTEX_KEY, "X-VTEX-API-AppToken": VTEX_TOKEN };
  
  // Try as SKU ID first (most order items use SKU IDs)
  try {
    const skuResp = await fetch(
      `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br/api/catalog_system/pvt/sku/stockkeepingunitbyid/${externalId}`,
      { headers }
    );
    if (skuResp.ok) {
      const sku = await skuResp.json();
      if (sku.BrandName) {
        return { brand: sku.BrandName, category: sku.DepartmentName || sku.CategoryName || null };
      }
    }
  } catch (e) {}

  // Fallback: try as Product ID
  try {
    const prodResp = await fetch(
      `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br/api/catalog_system/pvt/products/${externalId}/specification`,
      { headers }
    );
    if (prodResp.ok) {
      const prod = await prodResp.json();
      if (prod.BrandName) {
        return { brand: prod.BrandName, category: prod.DepartmentName || prod.CategoryName || null };
      }
    }
  } catch (e) {}

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (key !== "nitrosales-backfill-2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const action = searchParams.get("action") || "check";
  const batchSize = parseInt(searchParams.get("batch") || "50");

  try {
    if (action === "check") {
      const total = await prisma.product.count({ where: { organizationId: ORG_ID } });
      const withBrand = await prisma.product.count({ where: { organizationId: ORG_ID, brand: { not: null } } });
      const noBrand = await prisma.product.count({ where: { organizationId: ORG_ID, brand: null } });
      const sampleNoBrand = await prisma.product.findMany({
        where: { organizationId: ORG_ID, brand: null },
        select: { id: true, externalId: true, name: true },
        take: 5
      });
      return NextResponse.json({ total, withBrand, noBrand, sampleNoBrand });
    }

    if (action === "fix-name") {
      const result = await prisma.$executeRaw`
        UPDATE products p1
        SET brand = p2.brand, category = p2.category
        FROM products p2
        WHERE p1."organizationId" = ${ORG_ID}
        AND p2."organizationId" = ${ORG_ID}
        AND TRIM(p1.name) = TRIM(p2.name)
        AND p1.brand IS NULL
        AND p2.brand IS NOT NULL
      `;
      const remaining = await prisma.product.count({ where: { organizationId: ORG_ID, brand: null } });
      return NextResponse.json({ updated: result, remainingWithoutBrand: remaining });
    }

    if (action === "fix-vtex") {
      // Get products without brand that have order items (priority)
      const products = await prisma.$queryRaw`
        SELECT DISTINCT p.id, p."externalId", p.name
        FROM products p
        INNER JOIN order_items oi ON oi."productId" = p.id
        WHERE p."organizationId" = ${ORG_ID}
        AND p.brand IS NULL
        LIMIT ${batchSize}
      ` as any[];

      if (products.length === 0) {
        return NextResponse.json({ message: "No more products with orders need brand fix", updated: 0 });
      }

      let updated = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const product of products) {
        try {
          const brandInfo = await getVtexBrand(product.externalId);
          if (brandInfo) {
            await prisma.product.update({
              where: { id: product.id },
              data: { brand: brandInfo.brand, category: brandInfo.category }
            });
            updated++;
          } else {
            failed++;
            if (errors.length < 5) errors.push(product.externalId + ': not found in VTEX');
          }
        } catch (e: any) {
          failed++;
          if (errors.length < 5) errors.push(product.externalId + ': ' + e.message);
        }
      }

      const remaining = await prisma.$queryRaw`
        SELECT COUNT(DISTINCT p.id)::int as count
        FROM products p
        INNER JOIN order_items oi ON oi."productId" = p.id
        WHERE p."organizationId" = ${ORG_ID}
        AND p.brand IS NULL
      ` as any[];

      return NextResponse.json({
        processed: products.length,
        updated,
        failed,
        remainingWithOrders: remaining[0]?.count || 0,
        errors: errors.length > 0 ? errors : undefined
      });
    }

    return NextResponse.json({ error: "Use ?action=check, ?action=fix-name, or ?action=fix-vtex" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
