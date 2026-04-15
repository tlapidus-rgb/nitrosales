export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Bandeja de acciones (Action Inbox)
// ══════════════════════════════════════════════════════════════
// Devuelve las cosas que requieren atención del operador:
//   1. Aplicaciones pendientes (InfluencerApplication PENDING)
//   2. Contenido a revisar (ContentSubmission PENDING)
//   3. Campañas por vencer (endDate dentro de 7 días, status ACTIVE)
//   4. Creators silenciados (ACTIVE pero sin attribution en 14 días)
//
// Cada acción trae: type, priority, title, subtitle, count, href,
// samples (hasta 3) y una timestamp de referencia.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

const DAY = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const now = new Date();
    const in7days = new Date(now.getTime() + 7 * DAY);
    const since14days = new Date(now.getTime() - 14 * DAY);

    const [
      appsPending,
      appsSamples,
      submissionsPending,
      submissionsSamples,
      campaignsExpiring,
      campaignsExpiringSamples,
      activeInfluencers,
      recentAttributions,
    ] = await Promise.all([
      prisma.influencerApplication.count({
        where: { organizationId: org.id, status: "PENDING" },
      }),
      prisma.influencerApplication.findMany({
        where: { organizationId: org.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, name: true, instagram: true, followers: true, createdAt: true },
      }),
      prisma.contentSubmission.count({
        where: { organizationId: org.id, status: "PENDING" },
      }),
      prisma.contentSubmission.findMany({
        where: { organizationId: org.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          type: true,
          platform: true,
          thumbnailUrl: true,
          createdAt: true,
          influencer: { select: { name: true, profileImage: true } },
        },
      }),
      prisma.influencerCampaign.count({
        where: {
          organizationId: org.id,
          status: "ACTIVE",
          endDate: { gte: now, lte: in7days },
        },
      }),
      prisma.influencerCampaign.findMany({
        where: {
          organizationId: org.id,
          status: "ACTIVE",
          endDate: { gte: now, lte: in7days },
        },
        orderBy: { endDate: "asc" },
        take: 3,
        select: {
          id: true,
          name: true,
          endDate: true,
          influencer: { select: { name: true, profileImage: true } },
        },
      }),
      prisma.influencer.findMany({
        where: { organizationId: org.id, status: "ACTIVE" },
        select: { id: true, name: true, profileImage: true, code: true },
      }),
      prisma.influencerAttribution.findMany({
        where: {
          organizationId: org.id,
          createdAt: { gte: since14days },
        },
        select: { influencerId: true },
        distinct: ["influencerId"],
      }),
    ]);

    const activeWithRecent = new Set(recentAttributions.map((a) => a.influencerId));
    const silent = activeInfluencers.filter((i) => !activeWithRecent.has(i.id));
    const silentCount = silent.length;
    const silentSamples = silent.slice(0, 3).map((i) => ({
      id: i.id,
      name: i.name,
      avatarUrl: i.profileImage,
      code: i.code,
    }));

    const actions = [
      {
        key: "applications",
        tone: "pink" as const,
        priority: appsPending > 0 ? 1 : 99,
        icon: "sparkle",
        title: "Aplicaciones para sumarse",
        subtitle: appsPending === 0
          ? "Sin aspirantes nuevos por ahora"
          : `${appsPending} ${appsPending === 1 ? "aspirante" : "aspirantes"} esperando revisión`,
        count: appsPending,
        href: "/influencers/applications",
        cta: appsPending > 0 ? "Revisar aspirantes" : "Ver aplicaciones",
        samples: appsSamples.map((a) => ({
          id: a.id,
          primary: a.name,
          secondary: a.instagram ? `@${a.instagram.replace(/^@/, "")}` : (a.followers ?? "sin dato"),
          hint: relativeTime(a.createdAt),
        })),
      },
      {
        key: "content",
        tone: "violet" as const,
        priority: submissionsPending > 0 ? 2 : 99,
        icon: "play",
        title: "Contenido para revisar",
        subtitle: submissionsPending === 0
          ? "Todo el contenido está al día"
          : `${submissionsPending} ${submissionsPending === 1 ? "pieza pendiente" : "piezas pendientes"} de aprobación`,
        count: submissionsPending,
        href: "/influencers/content",
        cta: submissionsPending > 0 ? "Revisar contenido" : "Ver submissions",
        samples: submissionsSamples.map((s) => ({
          id: s.id,
          primary: s.influencer?.name ?? "Creator",
          secondary: `${s.type} · ${s.platform}`,
          hint: relativeTime(s.createdAt),
          thumbnail: s.thumbnailUrl,
          avatarUrl: s.influencer?.profileImage ?? null,
        })),
      },
      {
        key: "campaigns",
        tone: "amber" as const,
        priority: campaignsExpiring > 0 ? 3 : 99,
        icon: "clock",
        title: "Campañas por vencer",
        subtitle: campaignsExpiring === 0
          ? "No hay campañas cerrando esta semana"
          : `${campaignsExpiring} ${campaignsExpiring === 1 ? "campaña vence" : "campañas vencen"} en los próximos 7 días`,
        count: campaignsExpiring,
        href: "/influencers/campaigns",
        cta: campaignsExpiring > 0 ? "Gestionar campañas" : "Ver campañas",
        samples: campaignsExpiringSamples.map((c) => ({
          id: c.id,
          primary: c.name,
          secondary: c.influencer?.name ?? "—",
          hint: c.endDate ? daysUntil(c.endDate) : "",
          avatarUrl: c.influencer?.profileImage ?? null,
        })),
      },
      {
        key: "silent",
        tone: "rose" as const,
        priority: silentCount > 0 ? 4 : 99,
        icon: "zap",
        title: "Creators silenciados",
        subtitle: silentCount === 0
          ? "Todos tus creators activos están produciendo"
          : `${silentCount} ${silentCount === 1 ? "creator activo" : "creators activos"} sin ventas en 14 días`,
        count: silentCount,
        href: "/influencers/manage",
        cta: silentCount > 0 ? "Reactivar creators" : "Ver creators",
        samples: silentSamples.map((s) => ({
          id: s.id,
          primary: s.name,
          secondary: `@${s.code}`,
          hint: "sin ventas hace 14+ días",
          avatarUrl: s.avatarUrl,
        })),
      },
    ];

    const sorted = actions.sort((a, b) => a.priority - b.priority);
    const totalPending =
      appsPending + submissionsPending + campaignsExpiring + silentCount;

    return NextResponse.json({
      generatedAt: now.toISOString(),
      totalPending,
      actions: sorted,
    });
  } catch (error) {
    console.error("[aura/inbox] error:", error);
    return NextResponse.json(
      { error: "internal", message: (error as Error).message },
      { status: 500 },
    );
  }
}

function relativeTime(d: Date) {
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `hace ${mins} min`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `hace ${hs} h`;
  const days = Math.floor(hs / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

function daysUntil(d: Date) {
  const ms = d.getTime() - Date.now();
  const days = Math.ceil(ms / DAY);
  if (days <= 0) return "vence hoy";
  if (days === 1) return "vence mañana";
  return `vence en ${days} días`;
}
