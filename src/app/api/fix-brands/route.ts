import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

const VTEX_ACCOUNT = "mundojuguete";
const VTEX_APP_KEY = process.env.VTEX_APP_KEY || "vtexappkey-mundojuguete-ZMTYUJ";
const VTEX_APP_TOKEN = process.env.VTEX_APP_TOKEN || "RSXGIUXPYGDHTDZWHBDBRJKMTFNYAISMOANAHPXZNBRSQKHPTFQNJUAZOKEXHCIOVEENIPJMUXVKJWFYHJQRBXOORRWSYGAAYXGNNSKCLVKAVOUQGDRMGDWQQHXBEULB";
const BACKFILL_KEY = "nitrosales-backfill-2024";
const BATCH_SIZE = 50;
const DELAY_MS = 200; // Rate limit: ~5 req/s to VTEX

function vtexHeaders() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-VTEX-API-AppKey": VTEX_APP_KEY,
    "X-VTEX-API-AppToken": VTEX_APP_TOKEN,
  };
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Try to get brand info from VTEX using the externalId.
 * Strategy:
 *   1. Try as Product ID: GET /api/catalog/pvt/product/{id}
 *   2. If 404, try as SKU ID: GET /api/catalog/pvt/stockkeepingunit/{id}
 *      ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ extract ProductId ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ then GET /api/catalog/pvt/product/{ProductId}
 */
async function getVtexBrand(
  externalId: string
): Promise<{ brand: string; category: string } | null> {
  const baseUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br`;

  // Step 1: Get BrandId from product
  let brandId: number | null = null;
  let categoryPath = "";

  // Try as Product ID first
  try {
    const productRes = await fetch(
      `${baseUrl}/api/catalog/pvt/product/${externalId}`,
      { headers: vtexHeaders() }
    );
    if (productRes.ok) {
      const product = await productRes.json();
      if (product.BrandId) {
        brandId = product.BrandId;
        categoryPath = product.CategoryPath || product.DepartmentId?.toString() || "";
      }
    }
  } catch (e) {}

  // If no BrandId yet, try as SKU ID
  if (!brandId) {
    await sleep(DELAY_MS);
    try {
      const skuRes = await fetch(
        `${baseUrl}/api/catalog/pvt/stockkeepingunit/${externalId}`,
        { headers: vtexHeaders() }
      );
      if (skuRes.ok) {
        const sku = await skuRes.json();
        const productId = sku.ProductId;
        if (productId) {
          await sleep(DELAY_MS);
          const productRes = await fetch(
            `${baseUrl}/api/catalog/pvt/product/${productId}`,
            { headers: vtexHeaders() }
          );
          if (productRes.ok) {
            const product = await productRes.json();
            if (product.BrandId) {
              brandId = product.BrandId;
              categoryPath = product.CategoryPath || product.DepartmentId?.toString() || "";
            }
          }
        }
      }
    } catch (e) {}
  }

  // Step 2: Resolve BrandId to BrandName via Brand API
  if (brandId) {
    await sleep(DELAY_MS);
    try {
      const brandRes = await fetch(
        `${baseUrl}/api/catalog/pvt/brand/${brandId}`,
        { headers: vtexHeaders() }
      );
      if (brandRes.ok) {
        const brandData = await brandRes.json();
        if (brandData.Name) {
          return {
            brand: brandData.Name,
            category: categoryPath,
          };
        }
      }
    } catch (e) {}
  }

  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const action = searchParams.get("action");

  if (key !== BACKFILL_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- ACTION: stats ---
  if (action === "stats") {
    const total = await prisma.product.count({
      where: { organizationId: "cmmmga1uq0000sb43w0krvvys" },
    });
    const withBrand = await prisma.product.count({
      where: {
        organizationId: "cmmmga1uq0000sb43w0krvvys",
        brand: { not: null },
        NOT: [{ brand: "" }, { brand: "Sin marca" }],
      },
    });
    const withoutBrand = total - withBrand;

    return NextResponse.json({
      total,
      withBrand,
      withoutBrand,
      pctWithBrand: ((withBrand / total) * 100).toFixed(1) + "%",
    });
  }

  
  // --- ACTION: debug ---
  if (action === "debug") {
    return NextResponse.json({
      hasAppKey: !!process.env.VTEX_APP_KEY,
      hasAppToken: !!process.env.VTEX_APP_TOKEN,
      hasAccount: !!process.env.VTEX_ACCOUNT,
      appKeyPrefix: process.env.VTEX_APP_KEY?.substring(0, 10) || "NOT SET",
      account: VTEX_ACCOUNT,
      timestamp: new Date().toISOString(),
    });
  }


  // --- ACTION: test-verbose ---
  if (action === "test-verbose") {
    const testId = searchParams.get("id") || "28649";
    const baseUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br`;
    const results: any = { externalId: testId, attempts: [] };
    
    // Attempt 1: Product ID
    try {
      const r1 = await fetch(`${baseUrl}/api/catalog/pvt/product/${testId}`, { headers: vtexHeaders() });
      if (r1.ok) {
        const body1 = await r1.json();
        const keys = Object.keys(body1);
        const brandKeys = keys.filter(k => k.toLowerCase().includes('brand'));
        results.attempts.push({ 
          endpoint: "catalog/pvt/product", 
          status: r1.status, 
          keys: keys.slice(0, 20),
          brandKeys,
          BrandName: body1.BrandName,
          BrandId: body1.BrandId,
          Name: body1.Name,
          Id: body1.Id
        });
      } else {
        results.attempts.push({ endpoint: "catalog/pvt/product", status: r1.status });
      }
    } catch(e: any) { results.attempts.push({ endpoint: "catalog/pvt/product", error: e.message }); }
    
    // Attempt 3: Legacy
    try {
      const r3 = await fetch(`${baseUrl}/api/catalog_system/pvt/products/productget/${testId}`, { headers: vtexHeaders() });
      if (r3.ok) {
        const body3 = await r3.json();
        const keys3 = Object.keys(body3);
        const brandKeys3 = keys3.filter(k => k.toLowerCase().includes('brand'));
        results.attempts.push({ 
          endpoint: "catalog_system/pvt/products/productget", 
          status: r3.status, 
          keys: keys3.slice(0, 20),
          brandKeys: brandKeys3,
          BrandName: body3.BrandName,
          BrandId: body3.BrandId,
          Name: body3.Name,
          Id: body3.Id
        });
      } else {
        results.attempts.push({ endpoint: "catalog_system/pvt/products/productget", status: r3.status });
      }
    } catch(e: any) { results.attempts.push({ endpoint: "catalog_system/pvt/products/productget", error: e.message }); }
    
    results.credentialPrefix = VTEX_APP_KEY.substring(0, 15);
    return NextResponse.json(results);
  }

  // --- ACTION: test ---
  // Test VTEX API with a single externalId
  if (action === "test") {
    const testId = searchParams.get("id") || "28649";
    const result = await getVtexBrand(testId);
    return NextResponse.json({ externalId: testId, result });
  }

  // --- ACTION: fix-vtex ---
  // Fetch brand from VTEX for all products missing brand
  if (action === "fix-vtex") {
    const limit = parseInt(searchParams.get("limit") || String(BATCH_SIZE));
    const offset = parseInt(searchParams.get("offset") || "0");

    const products = await prisma.product.findMany({
      where: {
        organizationId: "cmmmga1uq0000sb43w0krvvys",
        OR: [{ brand: null }, { brand: "" }, { brand: "Sin marca" }],
      },
      select: { id: true, externalId: true, name: true },
      take: limit,
      skip: offset,
      orderBy: { externalId: "asc" },
    });

    if (products.length === 0) {
      return NextResponse.json({
        message: "No more products to fix",
        offset,
      });
    }

    const results = {
      total: products.length,
      fixed: 0,
      failed: 0,
      notFound: 0,
      details: [] as Array<{
        id: string;
        externalId: string;
        status: string;
        brand?: string;
      }>,
    };

    for (const product of products) {
      try {
        const vtexData = await getVtexBrand(product.externalId);

        if (vtexData && vtexData.brand) {
          await prisma.product.update({
            where: { id: product.id },
            data: {
              brand: vtexData.brand,
              ...(vtexData.category ? { category: vtexData.category } : {}),
            },
          });

          results.fixed++;
          results.details.push({
            id: product.id,
            externalId: product.externalId,
            status: "fixed",
            brand: vtexData.brand,
          });
        } else {
          results.notFound++;
          results.details.push({
            id: product.id,
            externalId: product.externalId,
            status: "not_found_in_vtex",
          });
        }
      } catch (error: any) {
        results.failed++;
        results.details.push({
          id: product.id,
          externalId: product.externalId,
          status: `error: ${error.message}`,
        });
      }

      await sleep(DELAY_MS);
    }

    return NextResponse.json({
      ...results,
      nextOffset: offset + limit,
      nextUrl: `/api/fix-brands?key=${BACKFILL_KEY}&action=fix-vtex&limit=${limit}&offset=${offset + limit}`,
    });
  }

  // --- ACTION: deduplicate ---
  // Find and merge duplicate products (same name, one has brand, one doesn't)
  if (action === "deduplicate") {
    const duplicates = await prisma.$queryRaw<
      Array<{ name: string; count: bigint }>
    >`
      SELECT name, COUNT(*) as count 
      FROM "Product" 
      WHERE "organizationId" = 'cmmmga1uq0000sb43w0krvvys'
      GROUP BY name 
      HAVING COUNT(*) > 1 
      ORDER BY count DESC 
      LIMIT 100
    `;

    return NextResponse.json({
      message: "Duplicate products by name",
      count: duplicates.length,
      duplicates: duplicates.map((d) => ({
        name: d.name,
        count: Number(d.count),
      })),
    });
  }

  return NextResponse.json({
    message: "NitroSales Fix Brands API",
    actions: {
      stats: "Get brand coverage stats",
      test: "Test VTEX lookup for a single ID (?id=28649)",
      "fix-vtex": "Fix brands from VTEX API (?limit=50&offset=0)",
      deduplicate: "Find duplicate products",
    },
  });
}
