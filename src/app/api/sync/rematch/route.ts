// ══════════════════════════════════════════════════════════════
// Competitor Re-Match — Match unmatched CompetitorPrice by EAN
// ══════════════════════════════════════════════════════════════
// After EANs are loaded into Product table (by VTEX sync or
// manual load), this endpoint matches CompetitorPrice entries
// that have competitorEan but no ownProductId.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export const revalidate = 0;
export const maxDuration = 60;

const CRON_KEY = process.env.NEXTAUTH_SECRET || "nitrosales-secret-key-2024-production";
const FALLBACK_ORG_ID = process.env.FALLBACK_ORG_ID || "cmmmga1uq0000sb43w0krvvys";

export async function GET(req: NextRequest) {
  const start = Date.now();
  const { searchParams } = new URL(req.url);

  if (searchParams.get("key") !== CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isDryRun = searchParams.get("dry") === "true";
  const orgId = FALLBACK_ORG_ID;

  try {
    // Find unmatched CompetitorPrice entries that have a competitor EAN
    const unmatched = await prisma.competitorPrice.findMany({
      where: {
        organizationId: orgId,
        ownProductId: null,
        competitorEan: { not: null },
      },
      select: { id: true, productName: true, competitorEan: true },
    });

    if (unmatched.length === 0) {
      return NextResponse.json({
        ok: true,
        dryRun: isDryRun,
        message: "No unmatched products with competitor EAN",
        total: 0,
        rematched: 0,
        elapsedMs: Date.now() - start,
      });
    }

    // Get all own products that have EAN
    const ownWithEan = await prisma.product.findMany({
      where: {
        organizationId: orgId,
        ean: { not: null },
      },
      select: { id: true, name: true, ean: true },
    });

    // Build EAN lookup map
    const eanToProduct = new Map<string, { id: string; name: string }>();
    for (const p of ownWithEan) {
      if (p.ean) {
        eanToProduct.set(p.ean, { id: p.id, name: p.name });
      }
    }

    let rematched = 0;
    let noMatch = 0;
    const matches: Array<{ competitor: string; own: string; ean: string }> = [];

    for (const cp of unmatched) {
      if (!cp.competitorEan) continue;

      const ownProduct = eanToProduct.get(cp.competitorEan);
      if (!ownProduct) {
        noMatch++;
        continue;
      }

      if (!isDryRun) {
        await prisma.competitorPrice.update({
          where: { id: cp.id },
          data: {
            ownProductId: ownProduct.id,
            matchMethod: "EAN_EXACT",
          },
        });
      }

      rematched++;
      if (matches.length < 20) {
        matches.push({
          competitor: cp.productName.substring(0, 50),
          own: ownProduct.name.substring(0, 50),
          ean: cp.competitorEan,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun: isDryRun,
      total: unmatched.length,
      ownProductsWithEan: ownWithEan.length,
      rematched,
      noMatch,
      sampleMatches: matches,
      elapsedMs: Date.now() - start,
    });
  } catch (error: any) {
    console.error("[Rematch]", error);
    return NextResponse.json({ ok: false, error: error.message, elapsedMs: Date.now() - start }, { status: 500 });
  }
}
