export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getVtexConfig } from "@/lib/vtex-credentials";

const BACKFILL_KEY = "nitrosales-backfill-2024";
const BATCH_SIZE = 50;
const DELAY_MS = 200; // Rate limit: ~5 req/s to VTEX // v3

// Cached credentials for the current request lifecycle
let _cachedHeaders: Record<string, string> | null = null;
let _cachedBaseUrl: string | null = null;

async function getVtexHeadersAndUrl() {
  if (_cachedHeaders && _cachedBaseUrl) {
    return { headers: _cachedHeaders, baseUrl: _cachedBaseUrl };
  }
  // Use null orgId for now (env var mode) - will use real orgId after auth guard
  const config = await getVtexConfig(null);
  _cachedHeaders = { ...config.headers, Accept: "application/json" };
  _cachedBaseUrl = config.baseUrl;
  return { headers: _cachedHeaders, baseUrl: _cachedBaseUrl };
}

function vtexHeaders() {
  // Sync wrapper - must call getVtexHeadersAndUrl() first in the request handler
  if (!_cachedHeaders) {
    throw new Error("Call getVtexHeadersAndUrl() before using vtexHeaders()");
  }
  return _cachedHeaders;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve a VTEX CategoryId to its human-readable name.
 * Uses: GET /api/catalog/pvt/category/{categoryId}
 */
async function getVtexCategoryName(categoryId: number): Promise<string> {
  const baseUrl = `${_cachedBaseUrl}`;
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
  const baseUrl = `${_cachedBaseUrl}`;

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

// ═══════════════════════════════════════════════════════════════════
// CATEGORY PATH RESOLUTION (Sesion 20)
// ═══════════════════════════════════════════════════════════════════
// Cache in-memory por request: categoryId -> {name, fatherId}
// Evita hacer la misma llamada a VTEX varias veces para categorias
// padres comunes (ej: "Juguetes" aparece en cientos de productos).
const _categoryCache: Map<number, { name: string; fatherId: number | null }> =
  new Map();

async function getVtexCategoryInfo(
  categoryId: number
): Promise<{ name: string; fatherId: number | null } | null> {
  if (_categoryCache.has(categoryId)) {
    return _categoryCache.get(categoryId)!;
  }
  const baseUrl = `${_cachedBaseUrl}`;
  try {
    const catRes = await fetch(
      `${baseUrl}/api/catalog/pvt/category/${categoryId}`,
      { headers: vtexHeaders() }
    );
    if (catRes.ok) {
      const catData = await catRes.json();
      const info = {
        name: catData.Name || "",
        fatherId:
          catData.FatherCategoryId && catData.FatherCategoryId > 0
            ? Number(catData.FatherCategoryId)
            : null,
      };
      _categoryCache.set(categoryId, info);
      return info;
    }
  } catch (e) {}
  return null;
}

/**
 * Resolver el path completo de categorias de un producto.
 * Returns e.g. "Juguetes > Bebes > Sonajeros" (hoja a la derecha).
 * Usa walking-up via FatherCategoryId + cache por request.
 * Max depth 8 para evitar loops.
 */
async function getVtexCategoryPath(
  externalId: string
): Promise<string | null> {
  const baseUrl = `${_cachedBaseUrl}`;
  let leafCategoryId: number | null = null;

  try {
    const productRes = await fetch(
      `${baseUrl}/api/catalog/pvt/product/${externalId}`,
      { headers: vtexHeaders() }
    );
    if (productRes.ok) {
      const product = await productRes.json();
      leafCategoryId = product.CategoryId || product.DepartmentId || null;
    }
  } catch (e) {}

  if (!leafCategoryId) {
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
            leafCategoryId =
              product.CategoryId || product.DepartmentId || null;
          }
        }
      }
    } catch (e) {}
  }

  if (!leafCategoryId) return null;

  // Walk up the tree: leaf -> parent -> grandparent -> ...
  const chain: string[] = [];
  let currentId: number | null = leafCategoryId;
  let depth = 0;
  const MAX_DEPTH = 8;

  while (currentId && depth < MAX_DEPTH) {
    const wasCached = _categoryCache.has(currentId);
    if (!wasCached) await sleep(DELAY_MS);
    const info = await getVtexCategoryInfo(currentId);
    if (!info || !info.name) break;
    chain.unshift(info.name.trim()); // prepend -> leaf queda al final
    currentId = info.fatherId;
    depth++;
  }

  if (chain.length === 0) return null;
  return chain.join(" > ");
}

/**
 * Resolve category for a single product by externalId.
 * Used by fix-categories action.
 */
async function getVtexCategory(externalId: string): Promise<string | null> {
  const baseUrl = `${_cachedBaseUrl}`;
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

  // Initialize VTEX credentials (cached for this request)
  await getVtexHeadersAndUrl();

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
    const withCategoryPath = await prisma.product.count({
      where: {
        organizationId: "cmmmga1uq0000sb43w0krvvys",
        categoryPath: { not: null },
        NOT: [{ categoryPath: "" }],
      },
    });
    const withoutBrand = total - withBrand;
    const withoutCategory = total - withCategory;
    const withoutCategoryPath = total - withCategoryPath;
    return NextResponse.json({
      total,
      withBrand,
      withoutBrand,
      pctWithBrand: ((withBrand / total) * 100).toFixed(1) + "%",
      withCategory,
      withoutCategory,
      pctWithCategory: ((withCategory / total) * 100).toFixed(1) + "%",
      withCategoryPath,
      withoutCategoryPath,
      pctWithCategoryPath: ((withCategoryPath / total) * 100).toFixed(1) + "%",
    });
  }

  // --- ACTION: debug ---
  if (action === "debug") {
    return NextResponse.json({
      credentialSource: _cachedBaseUrl ? "centralized" : "not-loaded",
      baseUrl: _cachedBaseUrl || "not-loaded",
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

  // --- ACTION: fix-category-paths (Sesion 20) ---
  // Backfill Product.categoryPath para productos existentes.
  // Walking up VTEX category tree via FatherCategoryId con cache por request.
  if (action === "fix-category-paths") {
    const limit = parseInt(searchParams.get("limit") || String(BATCH_SIZE));
    const offset = parseInt(searchParams.get("offset") || "0");

    const products = await prisma.product.findMany({
      where: {
        organizationId: "cmmmga1uq0000sb43w0krvvys",
        OR: [{ categoryPath: null }, { categoryPath: "" }],
      },
      select: { id: true, externalId: true, name: true, category: true },
      take: limit,
      skip: offset,
      orderBy: { externalId: "asc" },
    });

    if (products.length === 0) {
      return NextResponse.json({
        message: "No more products to fix (categoryPath)",
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
        newCategoryPath?: string;
      }>,
    };

    for (const product of products) {
      try {
        const path = await getVtexCategoryPath(product.externalId);
        if (path) {
          await prisma.product.update({
            where: { id: product.id },
            data: { categoryPath: path },
          });
          results.fixed++;
          results.details.push({
            id: product.id,
            externalId: product.externalId,
            status: "fixed",
            newCategoryPath: path,
          });
        } else {
          results.notFound++;
          results.details.push({
            id: product.id,
            externalId: product.externalId,
            status: "path_not_found",
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
      nextUrl: `/api/fix-brands?key=${BACKFILL_KEY}&action=fix-category-paths&limit=${limit}&offset=${offset + limit}`,
    });
  }

  // --- ACTION: bulk-category-paths (Sesion 20) ---
  // Bulk backfill de Product.categoryPath usando el arbol completo de VTEX.
  // Estrategia: 1 sola llamada a /api/catalog_system/pub/category/tree/10 y
  // match por nombre de categoria hoja. Evita 35K llamadas a VTEX.
  if (action === "bulk-category-paths") {
    const startedAt = Date.now();

    // Paso 1: traer arbol completo VTEX (1 sola llamada)
    const baseUrl = `${_cachedBaseUrl}`;
    let tree: any[] = [];
    try {
      const treeRes = await fetch(
        `${baseUrl}/api/catalog_system/pub/category/tree/10`,
        { headers: vtexHeaders() }
      );
      if (!treeRes.ok) {
        return NextResponse.json(
          {
            error: "VTEX tree fetch failed",
            status: treeRes.status,
            statusText: treeRes.statusText,
          },
          { status: 502 }
        );
      }
      tree = await treeRes.json();
    } catch (err: any) {
      return NextResponse.json(
        { error: "VTEX tree fetch error", message: err.message },
        { status: 502 }
      );
    }

    // Paso 2: recorrer el arbol y armar map nameLower -> paths[]
    // Si un nombre aparece una sola vez, lo podemos usar directo.
    const nameToPaths = new Map<string, string[]>();
    const pathToRoot: string[] = []; // Para debug

    function walk(nodes: any[], ancestors: string[]) {
      for (const node of nodes) {
        const name = String(node.name || "").trim();
        if (!name) continue;
        const fullPath = [...ancestors, name].join(" > ");
        const key = name.toLowerCase();
        const existing = nameToPaths.get(key) || [];
        existing.push(fullPath);
        nameToPaths.set(key, existing);
        pathToRoot.push(fullPath);
        if (Array.isArray(node.children) && node.children.length > 0) {
          walk(node.children, [...ancestors, name]);
        }
      }
    }
    walk(tree, []);

    // Paso 3: contar cuantos son unicos vs ambiguos
    let uniqueNames = 0;
    let ambiguousNames = 0;
    for (const paths of Array.from(nameToPaths.values())) {
      if (paths.length === 1) uniqueNames++;
      else ambiguousNames++;
    }

    // Paso 4: levantar productos que necesitan categoryPath
    const products = await prisma.product.findMany({
      where: {
        organizationId: "cmmmga1uq0000sb43w0krvvys",
        OR: [{ categoryPath: null }, { categoryPath: "" }],
        category: { not: null },
      },
      select: { id: true, category: true },
    });

    // Paso 5: resolver path por matching de nombre
    const updates: Array<{ id: string; path: string }> = [];
    let matchedUnique = 0;
    let matchedByFirst = 0;
    let unmatched = 0;
    const unmatchedSample: string[] = [];
    const ambiguousSample: Array<{ category: string; paths: string[] }> = [];

    for (const p of products) {
      if (!p.category) {
        unmatched++;
        continue;
      }
      const key = p.category.trim().toLowerCase();
      const paths = nameToPaths.get(key);
      if (!paths || paths.length === 0) {
        unmatched++;
        if (unmatchedSample.length < 20) unmatchedSample.push(p.category);
        continue;
      }
      if (paths.length === 1) {
        updates.push({ id: p.id, path: paths[0] });
        matchedUnique++;
      } else {
        // Ambiguo: por ahora tomamos el primero pero dejamos sample para revisar
        updates.push({ id: p.id, path: paths[0] });
        matchedByFirst++;
        if (ambiguousSample.length < 10) {
          ambiguousSample.push({ category: p.category, paths });
        }
      }
    }

    // Paso 6: update batch
    const UPDATE_CHUNK = 100;
    let updated = 0;
    for (let i = 0; i < updates.length; i += UPDATE_CHUNK) {
      const chunk = updates.slice(i, i + UPDATE_CHUNK);
      await prisma.$transaction(
        chunk.map((u) =>
          prisma.product.update({
            where: { id: u.id },
            data: { categoryPath: u.path },
          })
        )
      );
      updated += chunk.length;
    }

    const durationMs = Date.now() - startedAt;

    return NextResponse.json({
      ok: true,
      durationMs,
      tree: {
        totalNodes: pathToRoot.length,
        uniqueLeafNames: uniqueNames,
        ambiguousLeafNames: ambiguousNames,
      },
      products: {
        candidates: products.length,
        matchedUnique,
        matchedByFirstAmbiguous: matchedByFirst,
        unmatched,
        updated,
      },
      samples: {
        unmatched: unmatchedSample,
        ambiguous: ambiguousSample,
      },
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
  if (action === "resolve-ids") {
    try {
      const limitIds = parseInt(searchParams.get("limit") || "15");
      const ORG = "cmmmga1uq0000sb43w0krvvys";

      const numericCategories = await prisma.$queryRaw<Array<{ category: string; cnt: bigint }>>`
        SELECT category, COUNT(*) as cnt
        FROM products
        WHERE "organizationId" = ${ORG}
          AND category IS NOT NULL AND category != ''
          AND category ~ '^[0-9/]+$'
        GROUP BY category ORDER BY cnt DESC LIMIT ${limitIds}
      `;

      if (numericCategories.length === 0) {
        return NextResponse.json({ message: "No numeric category IDs found", resolved: 0 });
      }

      const results: any = {
        totalDistinctIds: numericCategories.length,
        totalProducts: numericCategories.reduce((sum: number, c: any) => sum + Number(c.cnt), 0),
        resolved: 0,
        failed: 0,
        mappings: [] as any[],
        errors: [] as any[],
      };

      const baseUrl = `${_cachedBaseUrl}`;

      for (const cat of numericCategories) {
        const catId = cat.category.replace(/\//g, "");
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
                UPDATE products SET category = ${newName}, "updatedAt" = NOW()
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
            results.errors.push({ oldId: cat.category, error: "VTEX status " + catRes.status });
          }
        } catch (err: any) {
          results.failed++;
          results.errors.push({ oldId: cat.category, error: err.message });
        }
        await sleep(DELAY_MS);
      }

      return NextResponse.json(results);
    } catch (outerErr: any) {
      return NextResponse.json({ error: "resolve-ids crashed", message: outerErr.message, stack: outerErr.stack?.substring(0, 500) }, { status: 500 });
    }
  }

  return NextResponse.json({
    message: "NitroSales Fix Brands API",
    actions: {
      stats: "Get brand + category coverage stats",
      test: "Test VTEX lookup for a single ID (?id=28649)",
      "test-category": "Test category resolution for a single ID (?id=28649)",
      "fix-vtex": "Fix brands + categories from VTEX API (?limit=50&offset=0)",
      "fix-categories": "Fix categories only for products that already have brands",
      "fix-category-paths": "Backfill Product.categoryPath via VTEX tree walk (?limit=50&offset=0)",
      "bulk-category-paths": "Bulk backfill categoryPath usando el arbol completo VTEX (1 sola llamada). Matching por nombre de categoria.",
      deduplicate: "Find duplicate products",
    },
  });
}