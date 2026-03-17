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
 * Resolve a VTEX CategoryId to its human-readable name.
 * Uses: GET /api/catalog/pvt/category/{categoryId}
 */
async function getVtexCategoryName(categoryId: number): Promise<string> {
  const baseUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br`;
  try {
    const catRes = await fetch(
      `${baseUrl}/api/catalog/pvt/category/${categoryId}`,
      { headers: vtexHeaders() }
    );
    if (catRes.ok) {
      const catData = await catRes.json();
      return catData.Name || "";
    }
  } catch (e) {}
  return "";
}

/**
 * Try to get brand + category info from VTEX using the externalId.
 * Strategy:
 * 1. Try as Product ID: GET /api/catalog/pvt/product/{id}
 * 2. If 404, try as SKU ID: GET /api/catalog/pvt/stockkeepingunit/{id}
 *    â extract ProductId â then GET /api/catalog/pvt/product/{ProductId}
 * 3. Resolve BrandId â BrandName via Brand API
 * 4. Resolve CategoryId â CategoryName via Category API
 */
async function getVtexBrand(
  externalId: string
): Promise<{ brand: string; category: string } | null> {
  const baseUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br`;

  // Step 1: Get BrandId and CategoryId from product
  let brandId: number | null = null;
  let categoryId: number | null = null;

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
      }
      if (product.CategoryId) {
        categoryId = product.CategoryId;
      } else if (product.DepartmentId) {
        categoryId = product.DepartmentId;
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
            }
            if (!categoryId) {
              if (product.CategoryId) {
                categoryId = product.CategoryId;
              } else if (product.DepartmentId) {
                categoryId = product.DepartmentId;
              }
            }
          }
        }
      }
    } catch (e) {}
  }

  // Step 2: Resolve BrandId to BrandName via Brand API
  let brandName = "";
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
          brandName = brandData.Name;
        }
      }
    } catch (e) {}
  }

  // Step 3: Resolve CategoryId to CategoryName via Category API
  let categoryName = "";
  if (categoryId) {
    await sleep(DELAY_MS);
    categoryName = await getVtexCategoryName(categoryId);
  }

  if (brandName) {
    return {
      brand: brandName,
      category: categoryName,
    };
  }

  return null;
}

/**
 * Resolve category for a single product by externalId.
 * Used by fix-categories action.
 */
async function getVtexCategory(externalId: string): Promise<string | null> {
  const baseUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br`;
  let categoryId: number | null = null;

  try {
    const productRes = await fetch(
      `${baseUrl}/api/catalog/pvt/product/${externalId}`,
      { headers: vtexHeaders() }
    );
    if (productRes.ok) {
      const product = await productRes.json();
      categoryId = product.CategoryId || product.DepartmentId || null;
    }
  } catch (e) {}

  if (!categoryId) {
    await sleep(DELAY_MS);
    try {
      const skuRes = await fetch(
        `${baseUrl}/api/catalog/pvt/stockkeepingunit/${externalId}`,
        { headers: vtexHeaders() }
      );
      if (skuRes.ok) {
        const sku = await skuRes.json();
        if (sku.ProductId) {
          await sleep(DELAY_MS);
          const productRes = await fetch(
            `${baseUrl}/api/catalog/pvt/product/${sku.ProductId}`,
            { headers: vtexHeaders() }
          );
          if (productRes.ok) {
            const product = await productRes.json();
            categoryId = product.CategoryId || product.DepartmentId || null;
          }
        }
      }
    } catch (e) {}
  }

  if (categoryId) {
    await sleep(DELAY_MS);
    const name = await getVtexCategoryName(categoryId);
    return name || null;
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
    const withCategory = await prisma.product.count({
      where: {
        organizationId: "cmmmga1uq0000sb43w0krvvys",
        category: { not: null },
        NOT: [{ category: "" }, { category: "Sin categor\u00eda" }],
      },
    });
    const withoutBrand = total - withBrand;
    const withoutCategory = total - withCategory;
    return NextResponse.json({
      total,
      withBrand,
      withoutBrand,
      pctWithBrand: ((withBrand / total) * 100).toFixed(1) + "%",
      withCategory,
      withoutCategory,
      pctWithCategory: ((withCategory / total) * 100).toFixed(1) + "%",
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

  // --- ACTION: test ---
  if (action === "test") {
    const testId = searchParams.get("id") || "28649";
    const result = await getVtexBrand(testId);
    return NextResponse.json({ externalId: testId, result });
  }

  // --- ACTION: test-category ---
  if (action === "test-category") {
    const testId = searchParams.get("id") || "28649";
    const category = await getVtexCategory(testId);
    return NextResponse.json({ externalId: testId, category });
  }

  // --- ACTION: fix-vtex ---
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
        category?: string;
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
            category: vtexData.category || undefined,
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

  // --- ACTION: fix-categories ---
  // Fix products that have a brand but missing/numeric category
  if (action === "fix-categories") {
    const limit = parseInt(searchParams.get("limit") || String(BATCH_SIZE));
    const offset = parseInt(searchParams.get("offset") || "0");

    // Find products that have a brand but category is null, empty, numeric, or "Sin categoria"
    const products = await prisma.product.findMany({
      where: {
        organizationId: "cmmmga1uq0000sb43w0krvvys",
        brand: { not: null },
        NOT: [{ brand: "" }, { brand: "Sin marca" }],
        OR: [
          { category: null },
          { category: "" },
          { category: "Sin categor\u00eda" },
        ],
      },
      select: { id: true, externalId: true, name: true, category: true },
      take: limit,
      skip: offset,
      orderBy: { externalId: "asc" },
    });

    if (products.length === 0) {
      // Also check for numeric-only categories
      const numericCats = await prisma.$queryRaw<Array<{ id: string; externalId: string; category: string }>>`
        SELECT id, "externalId", category FROM "Product"
        WHERE "organizationId" = 'cmmmga1uq0000sb43w0krvvys'
        AND brand IS NOT NULL AND brand != '' AND brand != 'Sin marca'
        AND category IS NOT NULL AND category != ''
        AND category ~ '^[0-9/]+$'
        ORDER BY "externalId" ASC
        LIMIT ${limit} OFFSET ${offset}
      `;

      if (numericCats.length === 0) {
        return NextResponse.json({
          message: "No more categories to fix",
          offset,
        });
      }

      // Process numeric categories
      const results = {
        total: numericCats.length,
        fixed: 0,
        failed: 0,
        notFound: 0,
        details: [] as Array<{
          id: string;
          externalId: string;
          status: string;
          oldCategory?: string;
          newCategory?: string;
        }>,
      };

      for (const product of numericCats) {
        try {
          const categoryName = await getVtexCategory(product.externalId);
          if (categoryName) {
            await prisma.product.update({
              where: { id: product.id },
              data: { category: categoryName },
            });
            results.fixed++;
            results.details.push({
              id: product.id,
              externalId: product.externalId,
              status: "fixed",
              oldCategory: product.category,
              newCategory: categoryName,
            });
          } else {
            results.notFound++;
            results.details.push({
              id: product.id,
              externalId: product.externalId,
              status: "category_not_found",
              oldCategory: product.category,
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
        type: "numeric_categories",
        nextOffset: offset + limit,
        nextUrl: `/api/fix-brands?key=${BACKFILL_KEY}&action=fix-categories&limit=${limit}&offset=${offset + limit}`,
      });
    }

    // Process null/empty/"Sin categoria" categories
    const results = {
      total: products.length,
      fixed: 0,
      failed: 0,
      notFound: 0,
      details: [] as Array<{
        id: string;
        externalId: string;
        status: string;
        newCategory?: string;
      }>,
    };

    for (const product of products) {
      try {
        const categoryName = await getVtexCategory(product.externalId);
        if (categoryName) {
          await prisma.product.update({
            where: { id: product.id },
            data: { category: categoryName },
          });
          results.fixed++;
          results.details.push({
            id: product.id,
            externalId: product.externalId,
            status: "fixed",
            newCategory: categoryName,
          });
        } else {
          results.notFound++;
          results.details.push({
            id: product.id,
            externalId: product.externalId,
            status: "category_not_found",
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
      type: "missing_categories",
      nextOffset: offset + limit,
      nextUrl: `/api/fix-brands?key=${BACKFILL_KEY}&action=fix-categories&limit=${limit}&offset=${offset + limit}`,
    });
  }

  // --- ACTION: deduplicate ---
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

  // --- ACTION: resolve-ids ---
  // Resolve numeric category IDs directly via VTEX Category API and bulk update
  if (action === "resolve-ids") {
    const limitIds = parseInt(searchParams.get("limit") || "15");
    const ORG = "cmmmga1uq0000sb43w0krvvys";
    
    const numericCategories = await prisma.$queryRaw<Array<{ category: string; cnt: bigint }>>`
      SELECT category, COUNT(*) as cnt
      FROM "Product"
      WHERE "organizationId" = ${ORG}
        AND category IS NOT NULL AND category != ''
        AND category ~ '^[0-9/]+$'
      GROUP BY category ORDER BY cnt DESC LIMIT ${limitIds}
    `;

    if (numericCategories.length === 0) {
      return NextResponse.json({ message: "No numeric category IDs found", offset: 0 });
    }

    const results = {
      totalDistinctIds: numericCategories.length,
      totalProducts: numericCategories.reduce((sum: number, c: any) => sum + Number(c.cnt), 0),
      resolved: 0,
      failed: 0,
      mappings: [] as Array<{ oldId: string; newName: string; productsUpdated: number }>,
      errors: [] as Array<{ oldId: string; error: string }>,
    };

    const baseUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br`;

    for (const cat of numericCategories) {
      const catId = cat.category.replace(/\//g, ""); // strip slashes from "/21/47/"
      try {
        const catRes = await fetch(
          `${baseUrl}/api/catalog/pvt/category/${catId}`,
          { headers: vtexHeaders() }
        );
        if (catRes.ok) {
          const catData = await catRes.json();
          const newName = catData.Name || "";
          if (newName) {
            const updated = await prisma.$executeRaw`
              UPDATE "Product" SET category = ${newName}, "updatedAt" = NOW()
              WHERE "organizationId" = ${ORG} AND category = ${cat.category}
            `;
            results.resolved++;
            results.mappings.push({ oldId: cat.category, newName, productsUpdated: updated });
          } else {
            results.failed++;
            results.errors.push({ oldId: cat.category, error: "Empty name from VTEX" });
          }
        } else {
          results.failed++;
          results.errors.push({ oldId: cat.category, error: `VTEX returned ${catRes.status}` });
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push({ oldId: cat.category, error: error.message });
      }
      await sleep(DELAY_MS);
    }

    return NextResponse.json(results);
  }

  return NextResponse.json({
    message: "NitroSales Fix Brands API",
    actions: {
      stats: "Get brand + category coverage stats",
      test: "Test VTEX lookup for a single ID (?id=28649)",
      "test-category": "Test category resolution for a single ID (?id=28649)",
      "fix-vtex": "Fix brands + categories from VTEX API (?limit=50&offset=0)",
      "fix-categories": "Fix categories only for products that already have brands",
      deduplicate: "Find duplicate products",
    },
  });
}