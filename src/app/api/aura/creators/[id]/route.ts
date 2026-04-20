export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Perfil de un creador
// ══════════════════════════════════════════════════════════════
// GET /api/aura/creators/[id]?from=...&to=...
//
// Devuelve todo lo necesario para la pantalla /aura/creadores/[id]:
//   - info básica (name, code, email, commission, avatar, status, whatsapp)
//   - KPIs del período (revenue, orders, aov, commission earned)
//   - KPIs lifetime (all-time totals)
//   - campañas (activas + historial con performance por campaña)
//   - contenido publicado (últimas 12 piezas con métricas)
//   - pagos: commissionEarned total, pendingPayout estimado
//   - actividad reciente (timeline: attributions + submissions + apps)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

const DAY = 24 * 60 * 60 * 1000;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const id = params.id;
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * DAY);
    const from = fromParam ? new Date(fromParam) : defaultFrom;
    const to = toParam ? new Date(toParam) : now;

    const influencer = await prisma.influencer.findFirst({
      where: { id, organizationId: org.id },
      select: {
        id: true,
        name: true,
        code: true,
        email: true,
        profileImage: true,
        status: true,
        commissionPercent: true,
        publicName: true,
        isPublicDashboardEnabled: true,
        dashboardPasswordPlain: true,
        attributionWindowDays: true,
        createdAt: true,
      },
    });
    if (!influencer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [
      periodAttrs,
      lifetimeAttrs,
      campaigns,
      content,
      recentAttrs,
      recentSubs,
      coupons,
      deals,
    ] = await Promise.all([
      // KPIs del período
      prisma.influencerAttribution.aggregate({
        where: {
          organizationId: org.id,
          influencerId: id,
          createdAt: { gte: from, lte: to },
        },
        _sum: { attributedValue: true, commissionAmount: true },
        _count: { _all: true },
      }),
      // Lifetime
      prisma.influencerAttribution.aggregate({
        where: { organizationId: org.id, influencerId: id },
        _sum: { attributedValue: true, commissionAmount: true },
        _count: { _all: true },
      }),
      // Campañas (todas) — incluir deals inline
      prisma.influencerCampaign.findMany({
        where: { organizationId: org.id, influencerId: id },
        orderBy: { startDate: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          description: true,
          bonusAmount: true,
          bonusTarget: true,
          isAlwaysOn: true,
          attributions: {
            select: {
              attributedValue: true,
              commissionAmount: true,
              createdAt: true,
            },
          },
          deals: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
              currency: true,
              commissionPercent: true,
              flatAmount: true,
              flatUnit: true,
              bonusAmount: true,
              bonusMetric: true,
              bonusTarget: true,
              tiers: true,
              cpmRate: true,
              productValue: true,
              productDescription: true,
              excludeFromCommission: true,
              startDate: true,
              endDate: true,
              notes: true,
              createdAt: true,
              _count: { select: { payouts: true } },
            },
          },
        },
      }),
      // Contenido (últimas 12 piezas)
      prisma.contentSubmission.findMany({
        where: { organizationId: org.id, influencerId: id },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          type: true,
          platform: true,
          contentUrl: true,
          thumbnailUrl: true,
          caption: true,
          status: true,
          publishedAt: true,
          metrics: true,
          createdAt: true,
        },
      }),
      // Últimas 10 ventas
      prisma.influencerAttribution.findMany({
        where: { organizationId: org.id, influencerId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          attributedValue: true,
          commissionAmount: true,
          createdAt: true,
          campaign: { select: { id: true, name: true } },
        },
      }),
      // Últimas submissions (mezcla con actividad)
      prisma.contentSubmission.findMany({
        where: { organizationId: org.id, influencerId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          type: true,
          platform: true,
          status: true,
          createdAt: true,
        },
      }),
      // Cupones de tracking
      prisma.influencerCoupon.findMany({
        where: { organizationId: org.id, influencerId: id, isActive: true },
        select: { id: true, code: true, discountPercent: true, discountFixed: true },
      }).catch(() => []),
      // Deals (acuerdos de compensación) — todos, ordenados por createdAt desc
      prisma.influencerDeal.findMany({
        where: { organizationId: org.id, influencerId: id },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: {
          campaign: { select: { id: true, name: true } },
          _count: { select: { payouts: true } },
        },
      }).catch(() => []),
    ]);

    // agregar performance por campaña (reducir las attributions) + deals inline
    const campaignsEnriched = campaigns.map((c) => {
      const revenue = c.attributions.reduce(
        (s, a) => s + Number(a.attributedValue),
        0
      );
      const commission = c.attributions.reduce(
        (s, a) => s + Number(a.commissionAmount),
        0
      );
      const orders = c.attributions.length;
      const bonusTargetNum = c.bonusTarget ? Number(c.bonusTarget) : null;
      const progressPct = bonusTargetNum && bonusTargetNum > 0
        ? Math.min(revenue / bonusTargetNum, 1)
        : null;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate ? c.endDate.toISOString() : null,
        description: c.description,
        bonusAmount: c.bonusAmount ? Number(c.bonusAmount) : null,
        bonusTarget: bonusTargetNum,
        isAlwaysOn: c.isAlwaysOn ?? false,
        revenue,
        commission,
        orders,
        progressPct,
        deals: (c.deals || []).map((d: any) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          status: d.status,
          currency: d.currency,
          commissionPercent: d.commissionPercent != null ? Number(d.commissionPercent) : null,
          flatAmount: d.flatAmount != null ? Number(d.flatAmount) : null,
          flatUnit: d.flatUnit ?? null,
          bonusAmount: d.bonusAmount != null ? Number(d.bonusAmount) : null,
          bonusMetric: d.bonusMetric ?? null,
          bonusTarget: d.bonusTarget != null ? Number(d.bonusTarget) : null,
          tiers: d.tiers ?? null,
          cpmRate: d.cpmRate != null ? Number(d.cpmRate) : null,
          productValue: d.productValue != null ? Number(d.productValue) : null,
          productDescription: d.productDescription ?? null,
          excludeFromCommission: d.excludeFromCommission ?? false,
          startDate: d.startDate ? d.startDate.toISOString() : null,
          endDate: d.endDate ? d.endDate.toISOString() : null,
          notes: d.notes ?? null,
          createdAt: d.createdAt.toISOString(),
          payoutsCount: d._count?.payouts ?? 0,
        })),
      };
    });

    // métricas agregadas de contenido (views totales, engagement promedio)
    type ContentMetrics = {
      views?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      saves?: number;
    };
    const contentEnriched = content.map((c) => {
      const m = (c.metrics as ContentMetrics | null) ?? {};
      const views = Number(m.views ?? 0);
      const likes = Number(m.likes ?? 0);
      const comments = Number(m.comments ?? 0);
      const shares = Number(m.shares ?? 0);
      const saves = Number(m.saves ?? 0);
      const engagement = views > 0 ? (likes + comments + shares + saves) / views : 0;
      return {
        id: c.id,
        type: c.type,
        platform: c.platform,
        contentUrl: c.contentUrl,
        thumbnailUrl: c.thumbnailUrl,
        caption: c.caption,
        status: c.status,
        publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        views,
        likes,
        comments,
        shares,
        saves,
        engagement,
      };
    });

    const totalContentViews = contentEnriched.reduce((s, c) => s + c.views, 0);
    const avgEngagement =
      contentEnriched.length > 0
        ? contentEnriched.reduce((s, c) => s + c.engagement, 0) / contentEnriched.length
        : 0;

    // actividad (mezclar attributions + submissions)
    const activity = [
      ...recentAttrs.map((a) => ({
        kind: "sale" as const,
        at: a.createdAt.toISOString(),
        amount: Number(a.attributedValue),
        commission: Number(a.commissionAmount),
        campaign: a.campaign ? { id: a.campaign.id, name: a.campaign.name } : null,
      })),
      ...recentSubs.map((s) => ({
        kind: "content" as const,
        at: s.createdAt.toISOString(),
        type: s.type,
        platform: s.platform,
        status: s.status,
      })),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 12);

    // período anterior (mismo span) para delta
    const spanMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - spanMs);
    const prevTo = from;
    const prevAgg = await prisma.influencerAttribution.aggregate({
      where: {
        organizationId: org.id,
        influencerId: id,
        createdAt: { gte: prevFrom, lt: prevTo },
      },
      _sum: { attributedValue: true, commissionAmount: true },
      _count: { _all: true },
    });

    const revenue = Number(periodAttrs._sum.attributedValue ?? 0);
    const orders = periodAttrs._count._all;
    const commissionEarned = Number(periodAttrs._sum.commissionAmount ?? 0);
    const prevRevenue = Number(prevAgg._sum.attributedValue ?? 0);
    const deltaRevenue =
      prevRevenue > 0 ? (revenue - prevRevenue) / prevRevenue : null;

    // WhatsApp: si el email tiene formato "+54..." o hay un campo, lo dejamos null
    // por ahora (no hay campo en schema); el front muestra el botón solo si existe.
    const whatsapp: string | null = null;

    // Links: tracking (al store) + dashboard público del creador (en la app)
    const storeUrl = process.env.STORE_URL || "";
    const appUrl = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";
    const trackingLink = `${storeUrl}/?utm_source=inf_${influencer.code}&utm_medium=influencer`;
    const dashboardUrl = `${appUrl}/i/${org.slug}/${influencer.code}`;

    return NextResponse.json({
      creator: {
        id: influencer.id,
        name: influencer.name,
        code: influencer.code,
        email: influencer.email,
        profileImage: influencer.profileImage,
        status: influencer.status,
        commissionPercent: Number(influencer.commissionPercent),
        publicName: influencer.publicName,
        isPublicDashboardEnabled: influencer.isPublicDashboardEnabled,
        dashboardPasswordPlain: influencer.dashboardPasswordPlain ?? null,
        attributionWindowDays: influencer.attributionWindowDays ?? 14,
        createdAt: influencer.createdAt.toISOString(),
        whatsapp,
        trackingLink,
        dashboardUrl,
        coupons: coupons.map((c: any) => ({
          id: c.id,
          code: c.code,
          discountPercent: c.discountPercent != null ? Number(c.discountPercent) : null,
          discountFixed: c.discountFixed != null ? Number(c.discountFixed) : null,
        })),
      },
      kpis: {
        period: {
          revenue,
          orders,
          commissionEarned,
          aov: orders > 0 ? revenue / orders : 0,
          deltaRevenue,
        },
        lifetime: {
          revenue: Number(lifetimeAttrs._sum.attributedValue ?? 0),
          orders: lifetimeAttrs._count._all,
          commissionEarned: Number(lifetimeAttrs._sum.commissionAmount ?? 0),
        },
      },
      campaigns: campaignsEnriched,
      deals: (deals as any[]).map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        status: d.status,
        currency: d.currency,
        commissionPercent: d.commissionPercent != null ? Number(d.commissionPercent) : null,
        flatAmount: d.flatAmount != null ? Number(d.flatAmount) : null,
        flatUnit: d.flatUnit ?? null,
        bonusAmount: d.bonusAmount != null ? Number(d.bonusAmount) : null,
        bonusMetric: d.bonusMetric ?? null,
        bonusTarget: d.bonusTarget != null ? Number(d.bonusTarget) : null,
        tiers: d.tiers ?? null,
        cpmRate: d.cpmRate != null ? Number(d.cpmRate) : null,
        productValue: d.productValue != null ? Number(d.productValue) : null,
        productDescription: d.productDescription ?? null,
        startDate: d.startDate ? d.startDate.toISOString() : null,
        endDate: d.endDate ? d.endDate.toISOString() : null,
        notes: d.notes ?? null,
        createdAt: d.createdAt.toISOString(),
        campaign: d.campaign ? { id: d.campaign.id, name: d.campaign.name } : null,
        payoutsCount: d._count?.payouts ?? 0,
      })),
      content: {
        items: contentEnriched,
        totalViews: totalContentViews,
        avgEngagement,
      },
      activity,
      period: { from: from.toISOString(), to: to.toISOString() },
    });
  } catch (e: any) {
    console.error("[aura/creators/[id]] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// PATCH /api/aura/creators/[id]
// Actualiza commissionPercent, email, publicName, status, profileImage
// ─────────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const id = params.id;
    const body = await req.json();
    const allowed: any = {};
    if (typeof body.commissionPercent === "number") {
      if (body.commissionPercent < 0 || body.commissionPercent > 100) {
        return NextResponse.json(
          { error: "commissionPercent must be 0-100" },
          { status: 400 }
        );
      }
      allowed.commissionPercent = body.commissionPercent;
    }
    if (typeof body.email === "string") allowed.email = body.email.trim() || null;
    if (typeof body.publicName === "string")
      allowed.publicName = body.publicName.trim() || null;
    if (typeof body.status === "string") {
      if (!["ACTIVE", "PAUSED", "INACTIVE"].includes(body.status)) {
        return NextResponse.json({ error: "invalid status" }, { status: 400 });
      }
      allowed.status = body.status;
    }
    if (typeof body.profileImage === "string")
      allowed.profileImage = body.profileImage.trim() || null;
    if (body.attributionWindowDays !== undefined) {
      const raw = body.attributionWindowDays;
      const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
      if (!Number.isFinite(n) || n < 1 || n > 180) {
        return NextResponse.json(
          { error: "attributionWindowDays must be 1-180" },
          { status: 400 }
        );
      }
      allowed.attributionWindowDays = Math.round(n);
    }

    const existing = await prisma.influencer.findFirst({
      where: { id, organizationId: org.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.influencer.update({
      where: { id },
      data: allowed,
      select: {
        id: true,
        name: true,
        code: true,
        email: true,
        status: true,
        commissionPercent: true,
        publicName: true,
        profileImage: true,
        attributionWindowDays: true,
      },
    });

    return NextResponse.json({
      ok: true,
      creator: {
        ...updated,
        commissionPercent: Number(updated.commissionPercent),
        attributionWindowDays: updated.attributionWindowDays ?? 14,
      },
    });
  } catch (e: any) {
    console.error("[aura/creators/[id] PATCH] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
