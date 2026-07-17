export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Detalle de una campaña
// ══════════════════════════════════════════════════════════════
// GET:    detalle completo con progreso, attributions (ventas),
//         briefings asociados, content submissions, creator, timeline
// PATCH:  update name / description / startDate / endDate / bonusAmount
//         / bonusTarget / status / influencerId
// DELETE: elimina la campaña (solo si no tiene attributions)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

const DAY = 24 * 60 * 60 * 1000;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const org = await getOrganization(req);
    const id = params.id;

    const campaign = await prisma.influencerCampaign.findFirst({
      where: { organizationId: org.id, id },
      include: {
        influencer: {
          select: {
            id: true,
            name: true,
            code: true,
            email: true,
            profileImage: true,
            commissionPercent: true,
            status: true,
          },
        },
        briefings: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            deadline: true,
            hashtags: true,
            createdAt: true,
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const [attrAgg, recentAttrs, submissions] = await Promise.all([
      prisma.influencerAttribution.aggregate({
        where: { organizationId: org.id, campaignId: id },
        _sum: { attributedValue: true, commissionAmount: true },
        _count: { id: true },
      }),
      prisma.influencerAttribution.findMany({
        where: { organizationId: org.id, campaignId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          attributedValue: true,
          commissionAmount: true,
          attributionSource: true,
          createdAt: true,
          order: {
            select: {
              id: true,
              source: true,
              externalId: true,
            },
          },
        },
      }),
      prisma.contentSubmission.findMany({
        where: {
          organizationId: org.id,
          briefing: { campaignId: id },
        },
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
    ]);

    const revenue = Number(attrAgg._sum.attributedValue || 0);
    const commission = Number(attrAgg._sum.commissionAmount || 0);
    const conversions = attrAgg._count.id || 0;

    const target = campaign.bonusTarget ? Number(campaign.bonusTarget) : null;
    const bonus = campaign.bonusAmount ? Number(campaign.bonusAmount) : null;

    const start = campaign.startDate.getTime();
    const end = campaign.endDate ? campaign.endDate.getTime() : null;
    const now = Date.now();
    const totalDays = end ? Math.max(1, Math.round((end - start) / DAY)) : null;
    const daysElapsed = Math.max(0, Math.round((now - start) / DAY));
    const daysRemaining = end
      ? Math.max(0, Math.round((end - now) / DAY))
      : null;
    const revenuePct =
      target && target > 0 ? Math.min(1, revenue / target) : null;
    const timePct = totalDays ? Math.min(1, daysElapsed / totalDays) : null;

    let progressStatus:
      | "unlocked"
      | "ahead"
      | "on_track"
      | "behind"
      | "at_risk"
      | "no_target"
      | "no_time_limit";
    if (target === null && end === null) progressStatus = "no_time_limit";
    else if (target === null) progressStatus = "no_target";
    else if (revenuePct !== null && revenuePct >= 1) progressStatus = "unlocked";
    else if (timePct === null) {
      progressStatus =
        (revenuePct || 0) >= 0.75
          ? "ahead"
          : (revenuePct || 0) >= 0.4
            ? "on_track"
            : "behind";
    } else {
      const delta = (revenuePct || 0) - timePct;
      if (delta >= 0.08) progressStatus = "ahead";
      else if (delta >= -0.08) progressStatus = "on_track";
      else if (delta >= -0.25) progressStatus = "behind";
      else progressStatus = "at_risk";
    }

    // Daily revenue series (desde start hasta today, max 90 días)
    const cutoffStart = new Date(
      Math.max(start, Date.now() - 90 * DAY),
    );
    const daily = await prisma.influencerAttribution.groupBy({
      by: ["createdAt"],
      where: {
        organizationId: org.id,
        campaignId: id,
        createdAt: { gte: cutoffStart },
      },
      _sum: { attributedValue: true },
      _count: { id: true },
    });
    const dailyByDay = new Map<string, { revenue: number; count: number }>();
    for (const d of daily) {
      const key = d.createdAt.toISOString().slice(0, 10);
      const cur = dailyByDay.get(key) || { revenue: 0, count: 0 };
      cur.revenue += Number(d._sum.attributedValue || 0);
      cur.count += d._count.id || 0;
      dailyByDay.set(key, cur);
    }
    const series: { date: string; revenue: number; count: number }[] = [];
    let cursor = new Date(cutoffStart);
    cursor.setHours(0, 0, 0, 0);
    const endCursor = end ? new Date(end) : new Date();
    endCursor.setHours(23, 59, 59, 999);
    while (cursor.getTime() <= Math.min(endCursor.getTime(), Date.now())) {
      const key = cursor.toISOString().slice(0, 10);
      const v = dailyByDay.get(key) || { revenue: 0, count: 0 };
      series.push({ date: key, revenue: v.revenue, count: v.count });
      cursor = new Date(cursor.getTime() + DAY);
    }

    return NextResponse.json({
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      startDate: campaign.startDate.toISOString(),
      endDate: campaign.endDate ? campaign.endDate.toISOString() : null,
      bonusTarget: target,
      bonusAmount: bonus,
      createdAt: campaign.createdAt.toISOString(),
      revenue,
      commission,
      conversions,
      revenuePct,
      timePct,
      totalDays,
      daysElapsed,
      daysRemaining,
      progressStatus,
      creator: campaign.influencer
        ? {
            id: campaign.influencer.id,
            name: campaign.influencer.name,
            code: campaign.influencer.code,
            email: campaign.influencer.email,
            avatarUrl: campaign.influencer.profileImage,
            commissionPercent: Number(campaign.influencer.commissionPercent),
            status: campaign.influencer.status,
          }
        : null,
      briefings: campaign.briefings.map((b) => ({
        id: b.id,
        title: b.title,
        type: b.type,
        status: b.status,
        deadline: b.deadline ? b.deadline.toISOString() : null,
        hashtags: b.hashtags,
        createdAt: b.createdAt.toISOString(),
      })),
      recentAttributions: recentAttrs.map((a) => ({
        id: a.id,
        attributedValue: Number(a.attributedValue),
        commissionAmount: Number(a.commissionAmount),
        attributionSource: a.attributionSource,
        createdAt: a.createdAt.toISOString(),
        order: a.order
          ? {
              id: a.order.id,
              source: a.order.source,
              externalId: a.order.externalId,
            }
          : null,
      })),
      submissions: submissions.map((s) => ({
        id: s.id,
        type: s.type,
        platform: s.platform,
        contentUrl: s.contentUrl,
        thumbnailUrl: s.thumbnailUrl,
        caption: s.caption,
        status: s.status,
        publishedAt: s.publishedAt ? s.publishedAt.toISOString() : null,
        metrics: s.metrics,
        createdAt: s.createdAt.toISOString(),
      })),
      series,
    });
  } catch (error) {
    console.error("[aura/campaigns/[id] GET] error:", error);
    return NextResponse.json(
      { error: "internal", message: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const org = await getOrganization(req);
    const id = params.id;
    const body = await req.json().catch(() => ({}));

    const existing = await prisma.influencerCampaign.findFirst({
      where: { organizationId: org.id, id },
      select: { id: true, influencerId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Item 32b (reunión Tomy 08/07/26): una vez definida, la campaña NO se
    // modifica. Solo se permite cambiar el ESTADO (finalizar/pausar) y el endDate
    // que acompaña a la finalización. Nombre, fechas de inicio, bonus, etc. quedan
    // fijos. Se ignora cualquier otro campo.
    const data: any = {};
    if (
      typeof body.status === "string" &&
      ["ACTIVE", "PAUSED", "COMPLETED"].includes(body.status.toUpperCase())
    ) {
      data.status = body.status.toUpperCase();
    }
    if (body.endDate !== undefined)
      data.endDate = body.endDate ? new Date(body.endDate) : null;

    // EXCEPCIÓN al item 32b (review 2026-07, D3): la ventana de atribución SÍ es
    // editable. Es un parámetro operativo del tracking (no un término comercial
    // como nombre/bonus/deal): un typo al crearla (ej: 1 en vez de 14) reshapea
    // comisiones en silencio y era incorregible vía API. Validación idéntica al
    // POST: 1-180 días; null/"" = heredar la ventana del creador.
    if (body.attributionWindowDays !== undefined) {
      const raw = body.attributionWindowDays;
      if (raw === null || raw === "") {
        data.attributionWindowDays = null;
      } else {
        const w = Math.round(Number(raw));
        if (!Number.isFinite(w) || w < 1 || w > 180) {
          return NextResponse.json(
            { error: "invalid", message: "Ventana de atribución inválida (1 a 180 días)" },
            { status: 400 },
          );
        }
        data.attributionWindowDays = w;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "no_editable", message: "Una campaña definida no se puede modificar; solo finalizar." },
        { status: 400 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.influencerCampaign.update({
        where: { id, organizationId: org.id }, // org en el where (cierra TOCTOU, patrón D9)
        data,
        select: { id: true, status: true, name: true },
      });
      // Al finalizar la campaña, sus deals dejan de estar activos (item 12/32b):
      // así el creador queda libre para comenzar otra campaña con nueva comisión.
      // Fix review #3: además se corta la comisión del creador (0%) para que no
      // sigan acumulándose comisiones sin campaña activa hasta comenzar otra.
      if (data.status === "COMPLETED") {
        await tx.influencerDeal.updateMany({
          where: { organizationId: org.id, campaignId: id, status: "ACTIVE" },
          data: { status: "ENDED" },
        });
        await tx.influencer.update({
          where: { id: existing.influencerId, organizationId: org.id },
          data: { commissionPercent: 0 },
        });
      }
      return updated;
    });
    return NextResponse.json({ ok: true, campaign: updated });
  } catch (error) {
    console.error("[aura/campaigns/[id] PATCH] error:", error);
    return NextResponse.json(
      { error: "internal", message: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const org = await getOrganization(req);
    const id = params.id;

    const existing = await prisma.influencerCampaign.findFirst({
      where: { organizationId: org.id, id },
      select: { id: true, _count: { select: { attributions: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (existing._count.attributions > 0) {
      return NextResponse.json(
        {
          error: "has_attributions",
          message:
            "No se puede eliminar: la campaña tiene ventas atribuidas. Cambiala a COMPLETED o PAUSED.",
        },
        { status: 400 },
      );
    }

    await prisma.influencerCampaign.delete({ where: { id, organizationId: org.id } }); // org en el where (TOCTOU, D9)
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[aura/campaigns/[id] DELETE] error:", error);
    return NextResponse.json(
      { error: "internal", message: (error as Error).message },
      { status: 500 },
    );
  }
}
