// ══════════════════════════════════════════════════════════════
// MercadoLibre Price Refresh
// ══════════════════════════════════════════════════════════════
// Refreshes prices for existing ML competitor entries.
// Safe: only updates currentPrice and scrapedData history.
// Never creates or deletes records.
//
// Usage:
//   GET /api/sync/ml-prices?key=...
//   GET /api/sync/ml-prices?key=...&org=ORG_ID
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { refreshMLPrices, getAccessToken, MLCredentials } from "@/lib/connectors/mercadolibre";

export const dynamic = "force-dynamic";

export const revalidate = 0;
export const maxDuration = 60;

const CRON_KEY = process.env.NEXTAUTH_SECRET || "nitrosales-secret-key-2024-production";
const BATCH_SIZE = 100; // ML allows 20 per multi-get, 5 batches = 100 items

export async function GET(req: NextRequest) {
  const start = Date.now();
  const { searchParams } = new URL(req.url);

  // Auth
  if (searchParams.get("key") !== CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = searchParams.get("org") || undefined;
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  try {
    // 1. Get ML credentials (optional)
    let accessToken: string | undefined;
    const connection = await prisma.connection.findFirst({
      where: {
        platform: "MERCADOLIBRE" as any,
        status: "ACTIVE",
        ...(orgId ? { organizationId: orgId } : {}),
      },
    });

    if (connection) {
      try {
        const creds = connection.credentials as unknown as MLCredentials;
        accessToken = await getAccessToken(creds);
      } catch (authErr: any) {
        console.warn("[ML Prices] Auth failed, continuing without token:", authErr.message);
      }
    }

    // 2. Find existing ML competitor prices to refresh
    const mlPrices = await prisma.competitorPrice.findMany({
      where: {
        productUrl: { contains: "mercadolibre.com" },
        scrapeStatus: { not: "DISABLED" },
        ...(orgId ? { organizationId: orgId } : {}),
      },
      select: {
        id: true,
        productUrl: true,
        currentPrice: true,
        scrapedData: true,
      },
      orderBy: { lastScrapedAt: "asc" }, // Oldest first (most stale)
      skip: offset,
      take: BATCH_SIZE,
    });

    if (mlPrices.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No ML prices to refresh",
        total: 0,
        elapsedMs: Date.now() - start,
      });
    }

    // 3. Extract ML item IDs from URLs
    // ML URLs look like: https://www.mercadolibre.com.ar/...-MLA-123456789-_JM
    // or https://articulo.mercadolibre.com.ar/MLA-123456789-...
    const itemIdMap = new Map<string, string>(); // mlItemId -> competitorPrice.id
    for (const price of mlPrices) {
      const match = price.productUrl.match(/MLA[-]?\d+/i);
      if (match) {
        const itemId = match[0].replace("-", ""); // Normalize: MLA-123 → MLA123
        // ML API expects format: MLA123456789
        const normalizedId = itemId.replace(/^(MLA)(\d+)$/i, "$1$2");
        itemIdMap.set(normalizedId, price.id);
      }
    }

    if (itemIdMap.size === 0) {
      return NextResponse.json({
        ok: true,
        message: "No valid ML item IDs found in URLs",
        total: mlPrices.length,
        parsed: 0,
        elapsedMs: Date.now() - start,
      });
    }

    // 4. Fetch fresh prices from ML API
    const freshPrices = await refreshMLPrices(
      Array.from(itemIdMap.keys()),
      { accessToken }
    );

    // 5. Update prices in DB (safe: only update, never delete)
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    let updated = 0;
    let priceChanges = 0;

    for (const [mlItemId, priceData] of freshPrices) {
      const competitorPriceId = itemIdMap.get(mlItemId);
      if (!competitorPriceId) continue;

      const existing = mlPrices.find((p) => p.id === competitorPriceId);
      if (!existing) continue;

      const oldPrice = Number(existing.currentPrice);
      const newPrice = priceData.price;
      const priceChanged = Math.abs(oldPrice - newPrice) > 0.01;

      // Build updated history (append today, keep last 90 entries)
      const history = Array.isArray(existing.scrapedData)
        ? [...(existing.scrapedData as Array<{ date: string; price: number }>)]
        : [];
      history.push({ date: today, price: newPrice });
      const trimmedHistory = history.slice(-90); // Keep last 90 data points

      await prisma.competitorPrice.update({
        where: { id: competitorPriceId },
        data: {
          currentPrice: newPrice,
          previousPrice: priceChanged ? oldPrice : undefined,
          lastScrapedAt: now,
          scrapeStatus: priceData.status === "active" ? "OK" : "ERROR",
          scrapeError: priceData.status !== "active" ? `ML status: ${priceData.status}` : null,
          scrapedData: trimmedHistory,
        },
      });

      updated++;
      if (priceChanged) priceChanges++;
    }

    return NextResponse.json({
      ok: true,
      source: "mercadolibre",
      hasAuth: !!accessToken,
      totalExisting: mlPrices.length,
      itemIdsParsed: itemIdMap.size,
      pricesFetched: freshPrices.size,
      updated,
      priceChanges,
      hasMore: mlPrices.length >= BATCH_SIZE,
      nextOffset: offset + BATCH_SIZE,
      elapsedMs: Date.now() - start,
    });
  } catch (error: any) {
    console.error("[ML Prices]", error);
    return NextResponse.json(
      { ok: false, error: error.message, elapsedMs: Date.now() - start },
      { status: 500 }
    );
  }
}
