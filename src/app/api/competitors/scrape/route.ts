export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Competitor Scrape On-Demand API
// ══════════════════════════════════════════════════════════════
// POST — Scrape a specific product URL immediately
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { scrapeProductPrice } from "@/lib/connectors/competitor-scraper";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const { competitorPriceId } = await req.json();

    if (!competitorPriceId) {
      return NextResponse.json({ error: "Missing competitorPriceId" }, { status: 400 });
    }

    const cp = await prisma.competitorPrice.findFirst({
      where: { id: competitorPriceId, organizationId: org.id },
    });

    if (!cp) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await scrapeProductPrice(cp.productUrl);

    if (!result) {
      await prisma.competitorPrice.update({
        where: { id: cp.id },
        data: {
          scrapeStatus: "ERROR",
          scrapeError: "No se pudo extraer el precio de la URL",
          lastScrapedAt: new Date(),
        },
      });
      return NextResponse.json({ error: "Could not extract price", url: cp.productUrl }, { status: 422 });
    }

    // Build price history
    const today = new Date().toISOString().split("T")[0];
    const history = Array.isArray(cp.scrapedData) ? (cp.scrapedData as any[]) : [];

    // Only add to history if date changed or price changed
    const lastEntry = history[history.length - 1];
    if (!lastEntry || lastEntry.date !== today || lastEntry.price !== result.price) {
      history.push({ date: today, price: result.price });
      // Keep max 365 entries
      if (history.length > 365) history.shift();
    }

    await prisma.competitorPrice.update({
      where: { id: cp.id },
      data: {
        productName: result.name || cp.productName,
        previousPrice: cp.currentPrice,
        currentPrice: result.price,
        currency: result.currency,
        imageUrl: result.imageUrl || cp.imageUrl,
        lastScrapedAt: new Date(),
        scrapeStatus: "OK",
        scrapeError: null,
        scrapedData: history,
      },
    });

    return NextResponse.json({
      success: true,
      name: result.name,
      price: result.price,
      currency: result.currency,
      method: result.method,
    });
  } catch (error: any) {
    console.error("[Scrape On-Demand]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
