// ══════════════════════════════════════════════════════════════
// EAN Backfill — Sync EAN barcodes from VTEX public API
// ══════════════════════════════════════════════════════════════
// Fetches products from VTEX public catalog and extracts EAN
// from productReference / referenceId. Only updates Product.ean
// where it's currently NULL. Resumable via offset parameter.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getVtexCredentials } from "@/lib/vtex-credentials";

export const dynamic = "force-dynamic";

export const revalidate = 0;
export const maxDuration = 60;

const CRON_KEY = process.env.NEXTAUTH_SECRET || "nitrosales-secret-key-2024-production";
const SAFETY_TIMEOUT_MS = 45000;
const FALLBACK_ORG_ID = process.env.FALLBACK_ORG_ID || "cmmmga1uq0000sb43w0krvvys";

function isValidEan(val: string): boolean {
  return /^\d{12,14}$/.test(val);
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const { searchParams } = new URL(req.url);

  if (searchParams.get("key") !== CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const isDryRun = searchParams.get("dry") === "true";
  const orgId = FALLBACK_ORG_ID;

  try {
    // Get VTEX account name from connection
    const creds = await getVtexCredentials(orgId);
    const accountName = creds?.accountName || "mundojuguete";

    const eanMap = new Map<string, string>(); // itemId → ean
    let fetched = 0;
    const pageSize = 50;

    // Fetch from VTEX public API with pagination
    for (let from = offset; from < offset + 500; from += pageSize) {
      if (Date.now() - start > SAFETY_TIMEOUT_MS) break;

      const to = from + pageSize - 1;
      const url = `https://${accountName}.vtexcommercestable.com.br/api/catalog_system/pub/products/search/?_from=${from}&_to=${to}`;

      try {
        const res = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": "NitroSales/1.0" },
          signal: AbortSignal.timeout(10000),
        });

        if (res.status !== 200 && res.status !== 206) break;

        const products = await res.json();
        if (!Array.isArray(products) || products.length === 0) break;

        for (const p of products) {
          const items = p.items || [];
          if (items.length === 0) continue;

          const item = items[0];
          const itemId = String(item.itemId);

          // Try multiple sources for EAN
          const productRef = p.productReference || "";
          const refIdVal = item.referenceId?.[0]?.Value || "";
          const itemEan = item.ean || "";

          // Pick the first valid EAN-like value (12-14 digits)
          const ean = isValidEan(productRef) ? productRef
            : isValidEan(refIdVal) ? refIdVal
            : isValidEan(itemEan) ? itemEan
            : null;

          if (ean) {
            eanMap.set(itemId, ean);
          }
        }

        fetched += products.length;
      } catch {
        break;
      }
    }

    // Match against DB products by externalId (which is the VTEX itemId)
    const org = await prisma.product.findMany({
      where: {
        organizationId: orgId,
        ean: null, // Only backfill where EAN is missing
        externalId: { in: Array.from(eanMap.keys()) },
      },
      select: { id: true, externalId: true, name: true },
    });

    let updated = 0;
    let skipped = 0;
    const updates: Array<{ name: string; ean: string }> = [];

    for (const product of org) {
      // externalId might have ".0" suffix from VTEX
      const cleanExtId = product.externalId.replace(/\.0$/, "");
      const ean = eanMap.get(product.externalId) || eanMap.get(cleanExtId);

      if (!ean) {
        skipped++;
        continue;
      }

      if (!isDryRun) {
        await prisma.product.update({
          where: { id: product.id },
          data: { ean },
        });
      }

      updated++;
      if (updates.length < 20) {
        updates.push({ name: product.name.substring(0, 50), ean });
      }
    }

    const hasMore = fetched >= 500;
    const nextOffset = hasMore ? offset + 500 : 0;

    return NextResponse.json({
      ok: true,
      dryRun: isDryRun,
      offset,
      vtexFetched: fetched,
      eansFound: eanMap.size,
      productsNeedingEan: org.length,
      updated,
      skipped,
      hasMore,
      nextOffset,
      sampleUpdates: updates,
      elapsedMs: Date.now() - start,
    });
  } catch (error: any) {
    console.error("[EanBackfill]", error);
    return NextResponse.json({ ok: false, error: error.message, elapsedMs: Date.now() - start }, { status: 500 });
  }
}
