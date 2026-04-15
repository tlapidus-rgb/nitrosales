export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Insights rápidos
// ══════════════════════════════════════════════════════════════
// Genera hasta 4 insights accionables para el período:
//   1. Mejor tipo de contenido (REEL / POST / TIKTOK) por engagement
//   2. Creator con mejor ticket promedio
//   3. Plataforma que más mueve la aguja (revenue * engagement)
//   4. Señal de alerta: creator activo que cayó vs período anterior
//
// Cada insight trae: key, tone, lens ("Aurum vio"), headline,
// detail, metric destacada y href para profundizar.
// Devuelve solo insights con data suficiente (min signal threshold).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

const DAY = 24 * 60 * 60 * 1000;

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
    const span = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - span);
    const prevTo = from;

    const [
      attributions,
      prevAttributions,
      submissions,
    ] = await Promise.all([
      prisma.influencerAttribution.findMany({
        where: {
          organizationId: org.id,
          createdAt: { gte: from, lte: to },
        },
        select: {
          influencerId: true,
          attributedValue: true,
          createdAt: true,
        },
      }),
      prisma.influencerAttribution.groupBy({
        by: ["influencerId"],
        where: {
          organizationId: org.id,
          createdAt: { gte: prevFrom, lt: prevTo },
        },
        _sum: { attributedValue: true },
        _count: { id: true },
      }),
      prisma.contentSubmission.findMany({
        where: {
          organizationId: org.id,
          status: "APPROVED",
          OR: [
            { publishedAt: { gte: from, lte: to } },
            {
              AND: [
                { publishedAt: null },
                { createdAt: { gte: from, lte: to } },
              ],
            },
          ],
        },
        select: {
          id: true,
          type: true,
          platform: true,
          metrics: true,
          influencerId: true,
        },
      }),
    ]);

    // Necesitamos datos de influencers citados
    const currentIds = new Set(attributions.map((a) => a.influencerId));
    const prevIds = new Set(prevAttributions.map((a) => a.influencerId));
    const idUnion = new Set<string>([...currentIds, ...prevIds]);
    const influencerMap = new Map<
      string,
      { id: string; name: string; code: string; avatarUrl: string | null }
    >();
    if (idUnion.size > 0) {
      const infs = await prisma.influencer.findMany({
        where: { id: { in: Array.from(idUnion) } },
        select: { id: true, name: true, code: true, profileImage: true },
      });
      infs.forEach((i) =>
        influencerMap.set(i.id, {
          id: i.id,
          name: i.name,
          code: i.code,
          avatarUrl: i.profileImage,
        }),
      );
    }

    const insights: any[] = [];

    // ─── Insight 1: Mejor tipo de contenido por engagement ───
    const typeAgg = new Map<
      string,
      { items: number; totalEr: number; views: number }
    >();
    for (const s of submissions) {
      const m = readMetrics(s.metrics);
      const views = Number(m.views || 0);
      if (views < 50) continue; // piso
      const er = engagementRate(m);
      const key = s.type || "OTHER";
      const cur = typeAgg.get(key) || { items: 0, totalEr: 0, views: 0 };
      cur.items += 1;
      cur.totalEr += er;
      cur.views += views;
      typeAgg.set(key, cur);
    }
    const typeList = Array.from(typeAgg.entries())
      .filter(([, v]) => v.items >= 2)
      .map(([t, v]) => ({
        type: t,
        avgEr: v.totalEr / v.items,
        items: v.items,
      }))
      .sort((a, b) => b.avgEr - a.avgEr);
    if (typeList.length >= 2) {
      const best = typeList[0];
      const avgRest = typeList
        .slice(1)
        .reduce((s, x) => s + x.avgEr, 0) / (typeList.length - 1);
      const multiple = avgRest > 0 ? best.avgEr / avgRest : 0;
      if (multiple >= 1.3) {
        insights.push({
          key: "best_content_type",
          tone: "violet",
          icon: "play",
          lens: "Aurum vio un patrón",
          headline: `Los ${readableType(best.type)} te dan ${multiple.toFixed(1)}× más engagement`,
          detail: `Con ${best.items} piezas este período, los ${readableType(best.type).toLowerCase()} promediaron ${(best.avgEr * 100).toFixed(2)}% de engagement · el resto se quedó en ${(avgRest * 100).toFixed(2)}%.`,
          metric: {
            label: "Engagement ratio",
            value: `${multiple.toFixed(1)}×`,
          },
          action: {
            label: "Ver content radar",
            href: "/aura/inicio#content-radar",
          },
        });
      }
    }

    // ─── Insight 2: Creator con mejor ticket promedio ───
    const byCreator = new Map<
      string,
      { revenue: number; conversions: number }
    >();
    for (const a of attributions) {
      const cur = byCreator.get(a.influencerId) || {
        revenue: 0,
        conversions: 0,
      };
      cur.revenue += Number(a.attributedValue || 0);
      cur.conversions += 1;
      byCreator.set(a.influencerId, cur);
    }
    const ticketRanked = Array.from(byCreator.entries())
      .filter(([, v]) => v.conversions >= 3) // mínimo 3 ventas
      .map(([id, v]) => ({
        id,
        avgTicket: v.revenue / v.conversions,
        revenue: v.revenue,
        conversions: v.conversions,
      }))
      .sort((a, b) => b.avgTicket - a.avgTicket);
    if (ticketRanked.length >= 2) {
      const top = ticketRanked[0];
      const avgOthers =
        ticketRanked.slice(1).reduce((s, x) => s + x.avgTicket, 0) /
        (ticketRanked.length - 1);
      const delta = avgOthers > 0 ? (top.avgTicket - avgOthers) / avgOthers : 0;
      if (delta >= 0.2) {
        const inf = influencerMap.get(top.id);
        insights.push({
          key: "top_ticket_creator",
          tone: "pink",
          icon: "sparkle",
          lens: "Aurum te destaca",
          headline: `${inf?.name ?? "Un creator"} levanta el ticket ${Math.round(
            delta * 100,
          )}% por encima del resto`,
          detail: `${inf?.name ?? "Creator"} promedia un ticket de ${fmtARSCompact(top.avgTicket)} en ${top.conversions} ventas, vs ${fmtARSCompact(avgOthers)} del resto del programa.`,
          metric: {
            label: "Ticket promedio",
            value: fmtARSCompact(top.avgTicket),
          },
          avatarUrl: inf?.avatarUrl ?? null,
          action: {
            label: "Ver creator",
            href: inf ? `/influencers/${top.id}` : "/influencers/leaderboard",
          },
        });
      }
    }

    // ─── Insight 3: Plataforma que más mueve la aguja ───
    // revenue por plataforma requeriría relacionar content → orders, no trivial.
    // Usamos una heurística: plataforma con mayor engagement-rate y volumen.
    const platAgg = new Map<
      string,
      { items: number; totalEr: number; views: number }
    >();
    for (const s of submissions) {
      const m = readMetrics(s.metrics);
      const views = Number(m.views || 0);
      if (views < 50) continue;
      const key = s.platform || "OTHER";
      const cur = platAgg.get(key) || { items: 0, totalEr: 0, views: 0 };
      cur.items += 1;
      cur.totalEr += engagementRate(m);
      cur.views += views;
      platAgg.set(key, cur);
    }
    const platList = Array.from(platAgg.entries())
      .filter(([, v]) => v.items >= 2)
      .map(([p, v]) => ({
        platform: p,
        avgEr: v.totalEr / v.items,
        views: v.views,
        items: v.items,
      }))
      .sort((a, b) => b.views * b.avgEr - a.views * a.avgEr);
    if (platList.length >= 2) {
      const winner = platList[0];
      const runnerUp = platList[1];
      const erDelta = runnerUp.avgEr > 0
        ? (winner.avgEr - runnerUp.avgEr) / runnerUp.avgEr
        : 0;
      if (erDelta >= 0.15 || winner.views >= runnerUp.views * 1.5) {
        insights.push({
          key: "winning_platform",
          tone: "amber",
          icon: "flame",
          lens: "Aurum detecta tracción",
          headline: `${readablePlatform(winner.platform)} es tu plataforma ganadora`,
          detail: `${winner.items} piezas generaron ${fmtCompact(winner.views)} views con ${(winner.avgEr * 100).toFixed(2)}% de engagement · ${readablePlatform(runnerUp.platform)} se quedó en ${fmtCompact(runnerUp.views)}.`,
          metric: {
            label: "Views",
            value: fmtCompact(winner.views),
          },
          action: {
            label: "Ver content radar",
            href: "/aura/inicio#content-radar",
          },
        });
      }
    }

    // ─── Insight 4: Creator que cayó vs período anterior ───
    const prevByCreator = new Map<string, number>();
    for (const p of prevAttributions) {
      if (p.influencerId) {
        prevByCreator.set(p.influencerId, Number(p._sum.attributedValue || 0));
      }
    }
    const fallers: {
      id: string;
      prevRevenue: number;
      currRevenue: number;
      drop: number;
    }[] = [];
    for (const [id, prevRev] of prevByCreator.entries()) {
      if (prevRev <= 0) continue;
      const currRev = byCreator.get(id)?.revenue ?? 0;
      const drop = (prevRev - currRev) / prevRev;
      if (drop >= 0.5 && prevRev >= 5000) {
        fallers.push({ id, prevRevenue: prevRev, currRevenue: currRev, drop });
      }
    }
    fallers.sort((a, b) => b.prevRevenue - a.prevRevenue);
    if (fallers.length > 0) {
      const top = fallers[0];
      const inf = influencerMap.get(top.id);
      insights.push({
        key: "creator_falling",
        tone: "rose",
        icon: "alert",
        lens: "Aurum detecta una caída",
        headline: `${inf?.name ?? "Un creator"} cayó ${Math.round(top.drop * 100)}% vs el período anterior`,
        detail: `${inf?.name ?? "Este creator"} venía facturando ${fmtARSCompact(top.prevRevenue)} y ahora está en ${fmtARSCompact(top.currRevenue)}. Puede ser contenido bajo, falta de actividad o algo operativo.`,
        metric: {
          label: "Revenue vs anterior",
          value: `-${Math.round(top.drop * 100)}%`,
        },
        avatarUrl: inf?.avatarUrl ?? null,
        action: {
          label: "Revisar creator",
          href: inf ? `/influencers/${top.id}` : "/influencers/manage",
        },
      });
    }

    // Si no hay ningún insight, devolvemos uno motivacional
    if (insights.length === 0) {
      insights.push({
        key: "cold_start",
        tone: "violet",
        icon: "sparkle",
        lens: "Aurum está aprendiendo",
        headline: "Todavía no tengo señal suficiente para sacar conclusiones",
        detail:
          "Cuando tus creators acumulen más contenido y más ventas atribuidas, acá van a aparecer patrones accionables específicos para tu programa.",
        metric: { label: "Señal", value: "baja" },
        action: {
          label: "Ver campañas en vuelo",
          href: "/aura/inicio",
        },
      });
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      period: { from: from.toISOString(), to: to.toISOString() },
      insights,
    });
  } catch (error) {
    console.error("[aura/insights] error:", error);
    return NextResponse.json(
      { error: "internal", message: (error as Error).message },
      { status: 500 },
    );
  }
}

function readableType(t: string) {
  const map: Record<string, string> = {
    REEL: "Reels",
    STORY: "Stories",
    POST: "Posts",
    TIKTOK: "TikToks",
    YOUTUBE: "YouTubes",
    OTHER: "Otros",
  };
  return map[t] || t;
}
function readablePlatform(p: string) {
  const map: Record<string, string> = {
    INSTAGRAM: "Instagram",
    TIKTOK: "TikTok",
    YOUTUBE: "YouTube",
    OTHER: "Otro",
  };
  return map[p] || p;
}
function fmtCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
}
function fmtARSCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}
