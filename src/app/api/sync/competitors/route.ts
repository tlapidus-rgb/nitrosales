export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Competitor Price Sync — Daily Cron
// ══════════════════════════════════════════════════════════════
// Recorre todos los CompetitorPrice activos, scrapea cada uno,
// actualiza precio y agrega al historial.
// Cron: 0 6 * * * (diario 6AM UTC)
// Auth: key query param
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { scrapeProductPrice } from "@/lib/connectors/competitor-scraper";

export const revalidate = 0;
export const maxDuration = 60;

const CRON_KEY = process.env.CRON_SECRET || "nitrosales-secret-key-2024-production";
const MAX_RUNTIME_MS = 50000; // 50s safety margin for Vercel
const DELAY_BETWEEN_SAME_DOMAIN = 1500; // 1.5s rate limit per domain

export async function GET(req: NextRequest) {
  const syncStart = Date.now();
  const { searchParams } = new URL(req.url);

  if (searchParams.get("key") !== CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shouldStop = () => Date.now() - syncStart > MAX_RUNTIME_MS;

  try {
    // Get all active competitor prices across all orgs
    const items = await prisma.competitorPrice.findMany({
      where: {
        competitor: { isActive: true },
      },
      include: {
        competitor: { select: { website: true } },
      },
      orderBy: { lastScrapedAt: "asc" }, // Oldest first (priority)
    });

    let scraped = 0;
    let errors = 0;
    let skipped = 0;
    const lastDomainFetch: Record<string, number> = {};
    const today = new Date().toISOString().split("T")[0];

    for (const item of items) {
      if (shouldStop()) {
        skipped = items.length - scraped - errors;
        break;
      }

      // Rate limit per domain
      try {
        const domain = new URL(item.productUrl).hostname;
        const lastFetch = lastDomainFetch[domain] || 0;
        const elapsed = Date.now() - lastFetch;
        if (elapsed < DELAY_BETWEEN_SAME_DOMAIN) {
          await new Promise(r => setTimeout(r, DELAY_BETWEEN_SAME_DOMAIN - elapsed));
        }
        lastDomainFetch[domain] = Date.now();
      } catch {
        // Invalid URL, skip
      }

      try {
        const result = await scrapeProductPrice(item.productUrl);

        if (!result) {
          await prisma.competitorPrice.update({
            where: { id: item.id },
            data: {
              scrapeStatus: "ERROR",
              scrapeError: "No se pudo extraer precio",
              lastScrapedAt: new Date(),
            },
          });
          errors++;
          continue;
        }

        // Build history
        const history = Array.isArray(item.scrapedData) ? (item.scrapedData as any[]) : [];
        const lastEntry = history[history.length - 1];
        if (!lastEntry || lastEntry.date !== today || lastEntry.price !== result.price) {
          history.push({ date: today, price: result.price });
          if (history.length > 365) history.shift();
        }

        await prisma.competitorPrice.update({
          where: { id: item.id },
          data: {
            productName: result.name || item.productName,
            previousPrice: item.currentPrice,
            currentPrice: result.price,
            currency: result.currency,
            imageUrl: result.imageUrl || item.imageUrl,
            lastScrapedAt: new Date(),
            scrapeStatus: "OK",
            scrapeError: null,
            scrapedData: history,
          },
        });
        scraped++;
      } catch (e: any) {
        await prisma.competitorPrice.update({
          where: { id: item.id },
          data: {
            scrapeStatus: "ERROR",
            scrapeError: e.message?.substring(0, 200),
            lastScrapedAt: new Date(),
          },
        });
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      total: items.length,
      scraped,
      errors,
      skipped,
      runtimeMs: Date.now() - syncStart,
    });
  } catch (error: any) {
    console.error("[Competitor Sync]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
