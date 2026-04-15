export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Content radar
// ══════════════════════════════════════════════════════════════
// Para el período seleccionado devuelve:
//   - platforms: conteo + views por plataforma (IG / TikTok / YT)
//   - topPieces: top 3 piezas con mejor engagement
//   - ugc: # de piezas marcadas como isUGC (reutilizables para ads)
//   - totals: total publicadas, views totales, engagement rate promedio
// Solo cuenta ContentSubmission con status APPROVED (las vivas).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

type Metrics = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
};

function getPeriod(url: URL) {
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const now = new Date();
  let from: Date;
  let to: Date;
  if (fromParam && toParam) {
    from = new Date(fromParam);
    to = new Date(toParam);
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    to = new Date(now);
  }
  return { from, to };
}

function readMetrics(m: unknown): Metrics {
  if (!m || typeof m !== "object") return {};
  return m as Metrics;
}

function engagementRate(m: Metrics) {
  const views = Number(m.views || 0);
  if (views <= 0) return 0;
  const eng =
    Number(m.likes || 0) +
    Number(m.comments || 0) +
    Number(m.shares || 0) +
    Number(m.saves || 0);
  return eng / views;
}

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const url = new URL(req.url);
    const { from, to } = getPeriod(url);

    // Consideramos publishedAt DENTRO del período; fallback a createdAt para las que no tienen publishedAt.
    const submissions = await prisma.contentSubmission.findMany({
      where: {
        organizationId: org.id,
        status: "APPROVED",
        OR: [
          { publishedAt: { gte: from, lte: to } },
          { AND: [{ publishedAt: null }, { createdAt: { gte: from, lte: to } }] },
        ],
      },
      select: {
        id: true,
        type: true,
        platform: true,
        contentUrl: true,
        thumbnailUrl: true,
        publishedAt: true,
        createdAt: true,
        metrics: true,
        isUGC: true,
        influencer: {
          select: { id: true, name: true, profileImage: true, code: true },
        },
      },
    });

    // Agregación por plataforma
    const platforms = new Map<
      string,
      { count: number; views: number; likes: number; comments: number }
    >();
    let totalViews = 0;
    let totalEngagement = 0;
    let totalEngItems = 0;
    let ugcCount = 0;

    for (const s of submissions) {
      const m = readMetrics(s.metrics);
      const views = Number(m.views || 0);
      const likes = Number(m.likes || 0);
      const comments = Number(m.comments || 0);

      totalViews += views;
      if (views > 0) {
        totalEngagement += engagementRate(m);
        totalEngItems += 1;
      }
      if (s.isUGC) ugcCount += 1;

      const key = s.platform || "OTHER";
      const cur = platforms.get(key) || {
        count: 0,
        views: 0,
        likes: 0,
        comments: 0,
      };
      cur.count += 1;
      cur.views += views;
      cur.likes += likes;
      cur.comments += comments;
      platforms.set(key, cur);
    }

    const platformList = Array.from(platforms.entries())
      .map(([platform, v]) => ({ platform, ...v }))
      .sort((a, b) => b.views - a.views);

    // Top 3 piezas por engagement rate (con minimo de views para evitar outliers tontos)
    const scored = submissions
      .map((s) => {
        const m = readMetrics(s.metrics);
        return {
          s,
          views: Number(m.views || 0),
          likes: Number(m.likes || 0),
          comments: Number(m.comments || 0),
          shares: Number(m.shares || 0),
          saves: Number(m.saves || 0),
          engagementRate: engagementRate(m),
        };
      })
      .filter((x) => x.views >= 50); // piso razonable

    scored.sort((a, b) => {
      const ra = a.engagementRate;
      const rb = b.engagementRate;
      if (rb !== ra) return rb - ra;
      return b.views - a.views;
    });

    const topPieces = scored.slice(0, 3).map((x) => ({
      id: x.s.id,
      type: x.s.type,
      platform: x.s.platform,
      url: x.s.contentUrl,
      thumbnailUrl: x.s.thumbnailUrl,
      publishedAt:
        x.s.publishedAt?.toISOString() ?? x.s.createdAt.toISOString(),
      views: x.views,
      likes: x.likes,
      comments: x.comments,
      shares: x.shares,
      saves: x.saves,
      engagementRate: x.engagementRate,
      isUGC: x.s.isUGC,
      creator: {
        id: x.s.influencer?.id ?? "",
        name: x.s.influencer?.name ?? "—",
        code: x.s.influencer?.code ?? "",
        avatarUrl: x.s.influencer?.profileImage ?? null,
      },
    }));

    const avgEngagement = totalEngItems > 0 ? totalEngagement / totalEngItems : 0;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      period: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        pieces: submissions.length,
        views: totalViews,
        avgEngagementRate: avgEngagement,
        ugc: ugcCount,
      },
      platforms: platformList,
      topPieces,
    });
  } catch (error) {
    console.error("[aura/content/radar] error:", error);
    return NextResponse.json(
      { error: "internal", message: (error as Error).message },
      { status: 500 },
    );
  }
}
