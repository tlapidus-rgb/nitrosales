export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Pulso Aurum
// ══════════════════════════════════════════════════════════════
// Endpoint que devuelve una frase "humana" de una línea que resume
// el estado del programa de creators hoy. Se calcula a partir de
// señales reales (influencers activos, attributions, campañas,
// submissions pendientes, payouts) en el período consultado.
//
// Cache: in-memory por (orgId + period hash), TTL 1h. Se invalida
// automáticamente al vencer; un pequeño stamp se devuelve en la
// response para que el front sepa si la frase está fresca.
//
// En esta primera versión generamos la frase de forma determinística
// a partir de reglas sobre los números, sin LLM. Es rápida, gratis y
// ya se siente "inteligente". Cuando validemos la UX, la reemplazamos
// por un call a Anthropic Haiku para tono más narrativo.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

type PulseResult = {
  headline: string;
  tone: "neutral" | "good" | "attention" | "celebration";
  generatedAt: string;
  cacheKey: string;
  period: { from: string; to: string; label: string };
};

// ─── Cache en memoria (1h TTL) ───────────────────────────────
type CacheEntry = { result: PulseResult; expiresAt: number };
const PULSE_CACHE = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000; // 1h

function cleanupCache() {
  const now = Date.now();
  for (const [k, v] of PULSE_CACHE.entries()) {
    if (v.expiresAt < now) PULSE_CACHE.delete(k);
  }
}

// ─── Period helpers ──────────────────────────────────────────
function getPeriod(url: URL): { from: Date; to: Date; label: string } {
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  if (fromParam && toParam) {
    return {
      from: new Date(fromParam),
      to: new Date(toParam),
      label: "custom",
    };
  }
  // Default: este mes calendario (del 1 al hoy)
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now);
  return { from, to, label: "este_mes" };
}

function fmtARS(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

// ─── Handler ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const url = new URL(req.url);
    const period = getPeriod(url);
    const force = url.searchParams.get("force") === "1";

    const cacheKey = `${org.id}:${period.from.toISOString()}:${period.to.toISOString()}`;

    // Cache hit
    if (!force) {
      cleanupCache();
      const hit = PULSE_CACHE.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        return NextResponse.json(hit.result);
      }
    }

    // ─── Señales ─────────────────────────────────────────
    const [
      activeCreators,
      attributionsAgg,
      pendingApps,
      pendingSubmissions,
      activeCampaigns,
      creatorsInPeriod,
    ] = await Promise.all([
      prisma.influencer.count({
        where: { organizationId: org.id, status: "ACTIVE" },
      }),
      prisma.influencerAttribution.aggregate({
        where: {
          organizationId: org.id,
          createdAt: { gte: period.from, lte: period.to },
        },
        _sum: { attributedValue: true, commissionAmount: true },
        _count: { id: true },
      }),
      prisma.influencerApplication.count({
        where: { organizationId: org.id, status: "PENDING" },
      }),
      prisma.contentSubmission.count({
        where: { organizationId: org.id, status: "PENDING" },
      }),
      prisma.influencerCampaign.count({
        where: {
          organizationId: org.id,
          startDate: { lte: period.to },
          endDate: { gte: period.from },
        },
      }),
      prisma.influencerAttribution.groupBy({
        by: ["influencerId"],
        where: {
          organizationId: org.id,
          createdAt: { gte: period.from, lte: period.to },
        },
        _sum: { attributedValue: true },
      }),
    ]);

    const revenue = Number(attributionsAgg._sum.attributedValue || 0);
    const conversions = attributionsAgg._count.id || 0;
    const creatorsThatSold = creatorsInPeriod.length;

    // ─── Reglas para armar la frase ──────────────────────
    let headline = "";
    let tone: PulseResult["tone"] = "neutral";

    if (activeCreators === 0) {
      headline =
        "Tu programa está vacío. Sumá tu primer creator o compartí el link público de aplicaciones para arrancar.";
      tone = "attention";
    } else if (revenue === 0 && conversions === 0) {
      headline = `Tenés ${activeCreators} creators activos pero todavía no hay ventas atribuidas este período. Buen momento para plantar una campaña.`;
      tone = "attention";
    } else if (pendingApps >= 3) {
      headline = `Van ${fmtARS(revenue)} en el período con ${conversions} conversiones. Hay ${pendingApps} aplicaciones esperando tu revisión.`;
      tone = "attention";
    } else if (pendingSubmissions >= 3) {
      headline = `${fmtARS(revenue)} generados y ${pendingSubmissions} piezas de contenido esperando aprobación.`;
      tone = "attention";
    } else if (activeCampaigns > 0 && creatorsThatSold > 0) {
      headline = `${creatorsThatSold} creators vendiendo, ${activeCampaigns} campaña${activeCampaigns > 1 ? "s" : ""} corriendo, ${fmtARS(revenue)} en el período.`;
      tone = "good";
    } else if (revenue > 0) {
      headline = `${fmtARS(revenue)} atribuidos en el período con ${creatorsThatSold} creators vendiendo.`;
      tone = "good";
    } else {
      headline = `${activeCreators} creators en la red. Semana tranquila, buen momento para mover una campaña nueva.`;
      tone = "neutral";
    }

    const result: PulseResult = {
      headline,
      tone,
      generatedAt: new Date().toISOString(),
      cacheKey,
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        label: period.label,
      },
    };

    PULSE_CACHE.set(cacheKey, {
      result,
      expiresAt: Date.now() + TTL_MS,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[aura/pulse GET]", error);
    return NextResponse.json(
      { error: error?.message || "pulse_failed" },
      { status: 500 }
    );
  }
}
