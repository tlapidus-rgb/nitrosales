// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Analyze Creative: On-demand Vision Analysis
// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// POST /api/analyze/creative
// Body: { creativeId: string } or { creativeIds: string[] }
//
// Triggers Claude Vision analysis for specific creatives.
// Useful for:
// - Backfill: Analyze all existing creatives
// - Re-analyze: Force re-analysis of a creative
// - Manual trigger from UI
// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { analyzeCreativeImage } from "@/lib/ai/vision-analyzer";
import { classifyWithVision } from "@/lib/classification/ad-classifier";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutes â up to ~30 creatives

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    let creativeIds: string[] = [];

    if (body.creativeId) {
      creativeIds = [body.creativeId];
    } else if (Array.isArray(body.creativeIds)) {
      creativeIds = body.creativeIds;
    } else if (body.backfill) {
      // Backfill mode: get all unanalyzed creatives
      const limit = body.limit || 20;
      const unanalyzed = await prisma.adCreative.findMany({
        where: {
          visionAnalyzedAt: null,
          mediaUrls: { isEmpty: false },
        },
        select: { id: true },
        take: limit,
        orderBy: { createdAt: "desc" },
      });
      creativeIds = unanalyzed.map((c: any) => c.id);
    }

    if (creativeIds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No creatives to analyze",
        analyzed: 0,
      }, { headers: corsHeaders });
    }

    // Cap at 30 per request
    const MAX_PER_REQUEST = 30;
    creativeIds = creativeIds.slice(0, MAX_PER_REQUEST);

    const creatives = await prisma.adCreative.findMany({
      where: { id: { in: creativeIds } },
      include: { campaign: { select: { name: true } } },
    });

    const results: Array<{
      id: string;
      name: string | null;
      status: "analyzed" | "error" | "skipped";
      classification?: string;
      confidence?: number;
      error?: string;
    }> = [];

    for (const creative of creatives) {
      const imageUrl = creative.mediaUrls?.[0];
      if (!imageUrl) {
        results.push({ id: creative.id, name: creative.name, status: "skipped", error: "No media URL" });
        continue;
      }

      const visionResult = await analyzeCreativeImage(imageUrl, {
        adName: creative.name,
        campaignName: (creative as any).campaign?.name,
        platform: creative.platform,
        headline: creative.headline,
        ctaType: creative.ctaType,
      });

      if (visionResult.ok && visionResult.result) {
        // Blend with existing regex classification
        const regexResult = {
          type: creative.classificationAuto || "OTHER",
          confidence: creative.classificationScore || 0.3,
          reason: "existing regex classification",
        };
        const blended = classifyWithVision(
          regexResult,
          visionResult.result.classification,
          visionResult.result.confidence
        );

        await prisma.adCreative.update({
          where: { id: creative.id },
          data: {
            visionAnalysis: JSON.stringify(visionResult.result),
            visionClassification: visionResult.result.classification,
            visionConfidence: visionResult.result.confidence,
            visionAnalyzedAt: new Date(),
            visionError: null,
            classificationAuto: blended.type,
            classificationScore: blended.confidence,
          } as any,
        });

        results.push({
          id: creative.id,
          name: creative.name,
          status: "analyzed",
          classification: blended.type,
          confidence: blended.confidence,
        });
      } else {
        await prisma.adCreative.update({
          where: { id: creative.id },
          data: {
            visionError: visionResult.error || "Unknown error",
            visionAnalyzedAt: new Date(),
          } as any,
        });

        results.push({
          id: creative.id,
          name: creative.name,
          status: "error",
          error: visionResult.error,
        });
      }
    }

    const analyzed = results.filter((r) => r.status === "analyzed").length;
    const errors = results.filter((r) => r.status === "error").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    return NextResponse.json({
      ok: true,
      stats: { total: results.length, analyzed, errors, skipped },
      results,
    }, { headers: corsHeaders });
  } catch (error: any) {
    console.error("[AnalyzeCreative] Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
