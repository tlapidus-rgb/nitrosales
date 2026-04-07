// ══════════════════════════════════════════════════════════════
// NitroPixel · Data Quality Score API — Read-Only
// ──────────────────────────────────────────────────────────────
// GET /api/nitropixel/data-quality-score?window=24h|7d|30d
//
// Devuelve el "NitroScore" (0-100) y sus 5 palancas:
//   1. Cobertura de clicks       (peso 25%)
//   2. Riqueza de identidad      (peso 25%)
//   3. Match Quality de Meta CAPI (peso 20%)
//   4. Frescura de señales        (peso 15%)
//   5. Confiabilidad del webhook  (peso 15%)
//
// Window selector: 24h (post-fixes), 7d (semanal), 30d (mensual).
// Computa delta vs período anterior del mismo tamaño.
//
// 100% READ-ONLY · cero migraciones · cero columnas nuevas.
// Cacheado en memoria 5 minutos por org+window.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MS_DAY = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Fecha de los fixes de calidad de NitroPixel — usado para el banner explicativo.
// El score histórico (7d/30d) está siendo arrastrado por data anterior a esta fecha.
const FIX_APPLIED_AT = new Date("2026-04-07T00:00:00Z");

// ── Cache en memoria por organización + window ──
type CacheEntry = { data: unknown; expiresAt: number };
const cache = new Map<string, CacheEntry>();

// ── Tipos del resultado ──
type WindowKey = "24h" | "7d" | "30d";

interface LeverResult {
  key: "click_coverage" | "identity_richness" | "capi_match" | "signal_freshness" | "webhook_reliability";
  name: string;
  description: string;
  current: number;
  target: number;
  weight: number;
  status: "perfect" | "great" | "good" | "opportunity";
  moneyAtRiskArs: number;
  unlockTitle: string;
  unlockSteps: string[];
}

interface QualityScoreResponse {
  ok: boolean;
  window: WindowKey;
  windowLabel: string;
  windowDays: number;
  score: number;
  scoreLabel: string;
  scoreColor: string;
  priorScore: number | null;
  trendDelta: number | null;
  attributedRevenue: number;
  totalPurchases: number;
  levers: LeverResult[];
  opportunities: Array<{
    id: string;
    title: string;
    description: string;
    action: string;
    metric: string | null;
    metricValue: number | null;
    createdAt: string;
  }>;
  // Contexto histórico para el banner explicativo
  fixAppliedAt: string;
  daysSinceFix: number;
  historicalDragWarning: boolean;
  computedAt: string;
}

// ── Helpers ──
function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function statusForRatio(current: number, target: number): LeverResult["status"] {
  if (current >= target) return "perfect";
  if (current >= target * 0.9) return "great";
  if (current >= target * 0.7) return "good";
  return "opportunity";
}

function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Excelente", color: "#10b981" };
  if (score >= 75) return { label: "Muy bueno", color: "#06b6d4" };
  if (score >= 60) return { label: "Bueno", color: "#8b5cf6" };
  return { label: "Por desbloquear", color: "#a855f7" };
}

function parseWindow(input: string | null): { key: WindowKey; days: number; label: string } {
  if (input === "24h") return { key: "24h", days: 1, label: "últimas 24 horas" };
  if (input === "30d") return { key: "30d", days: 30, label: "últimos 30 días" };
  return { key: "7d", days: 7, label: "últimos 7 días" };
}

// ──────────────────────────────────────────────────────────
// Compute lever percentages for a given time range
// ──────────────────────────────────────────────────────────
async function computeLeverPercents(
  orgId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<{
  clickCoveragePct: number;
  identityPct: number;
  capiPct: number;
  freshPct: number;
  webhookPct: number;
  attributedRevenue: number;
  totalPurchases: number;
  visitorsWithEmail: number;
  visitorsWithBoth: number;
  clickTotal: number;
  totalPurchasesForMatch: number;
  totalTouchpoints: number;
  totalOrders: number;
}> {
  const [
    clickCoverageRows,
    visitorsWithEmail,
    visitorsWithBoth,
    purchaseRows,
    attributionSample,
    orderRows,
    revenueAgg,
    totalPurchases,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ has_click: boolean; has_utm: boolean; cnt: bigint }>>`
      SELECT
        (
          ("clickIds"->>'fbclid') IS NOT NULL OR
          ("clickIds"->>'gclid') IS NOT NULL OR
          ("clickIds"->>'ttclid') IS NOT NULL OR
          ("clickIds"->>'msclkid') IS NOT NULL OR
          ("clickIds"->>'li_fat_id') IS NOT NULL
        ) AS has_click,
        (("utmParams"->>'source') IS NOT NULL) AS has_utm,
        COUNT(*)::bigint AS cnt
      FROM pixel_events
      WHERE "organizationId" = ${orgId}
        AND "receivedAt" >= ${rangeStart}
        AND "receivedAt" < ${rangeEnd}
        AND type IN ('PAGE_VIEW', 'PAGEVIEW', 'SESSION_START')
      GROUP BY 1, 2
    `,
    prisma.pixelVisitor.count({
      where: {
        organizationId: orgId,
        email: { not: null },
        lastSeenAt: { gte: rangeStart, lt: rangeEnd },
      },
    }),
    prisma.pixelVisitor.count({
      where: {
        organizationId: orgId,
        email: { not: null },
        phone: { not: null },
        lastSeenAt: { gte: rangeStart, lt: rangeEnd },
      },
    }),
    prisma.$queryRaw<Array<{ has_match: boolean; cnt: bigint }>>`
      SELECT
        ("metaFbc" IS NOT NULL OR "metaFbp" IS NOT NULL) AS has_match,
        COUNT(*)::bigint AS cnt
      FROM pixel_events
      WHERE "organizationId" = ${orgId}
        AND "receivedAt" >= ${rangeStart}
        AND "receivedAt" < ${rangeEnd}
        AND type = 'PURCHASE'
      GROUP BY 1
    `,
    prisma.pixelAttribution.findMany({
      where: {
        organizationId: orgId,
        model: "NITRO",
        createdAt: { gte: rangeStart, lt: rangeEnd },
      },
      select: { touchpoints: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: {
        organizationId: orgId,
        createdAt: { gte: rangeStart, lt: rangeEnd },
      },
      select: { createdAt: true, orderDate: true },
      take: 1000,
      orderBy: { createdAt: "desc" },
    }),
    prisma.pixelAttribution.aggregate({
      where: {
        organizationId: orgId,
        model: "NITRO",
        createdAt: { gte: rangeStart, lt: rangeEnd },
      },
      _sum: { attributedValue: true },
    }),
    prisma.pixelEvent.count({
      where: {
        organizationId: orgId,
        type: "PURCHASE",
        receivedAt: { gte: rangeStart, lt: rangeEnd },
      },
    }),
  ]);

  // Lever 1 — Click coverage
  let clicksWithUtm = 0;
  let clicksWithoutUtm = 0;
  for (const r of clickCoverageRows) {
    const c = Number(r.cnt);
    if (r.has_click && r.has_utm) clicksWithUtm += c;
    else if (r.has_click && !r.has_utm) clicksWithoutUtm += c;
  }
  const clickTotal = clicksWithUtm + clicksWithoutUtm;
  const clickCoverageRatio = clickTotal > 0 ? clicksWithUtm / clickTotal : 1;

  // Lever 2 — Identity richness
  const identityRatio = visitorsWithEmail > 0 ? visitorsWithBoth / visitorsWithEmail : 1;

  // Lever 3 — CAPI match
  let purchasesWithMatch = 0;
  let purchasesWithoutMatch = 0;
  for (const r of purchaseRows) {
    const c = Number(r.cnt);
    if (r.has_match) purchasesWithMatch += c;
    else purchasesWithoutMatch += c;
  }
  const totalPurchasesForMatch = purchasesWithMatch + purchasesWithoutMatch;
  const capiRatio = totalPurchasesForMatch > 0 ? purchasesWithMatch / totalPurchasesForMatch : 1;

  // Lever 4 — Signal freshness
  let totalTouchpoints = 0;
  let freshTouchpoints = 0;
  for (const att of attributionSample) {
    const tps = att.touchpoints as Array<Record<string, unknown>> | null;
    if (!Array.isArray(tps)) continue;
    for (const tp of tps) {
      totalTouchpoints += 1;
      const confidence = (tp as { confidence?: string }).confidence;
      if (
        !confidence ||
        confidence === "fresh_click" ||
        confidence === "fresh_utm" ||
        confidence === "referrer"
      ) {
        freshTouchpoints += 1;
      }
    }
  }
  const freshRatio = totalTouchpoints > 0 ? freshTouchpoints / totalTouchpoints : 1;

  // Lever 5 — Webhook reliability
  let ordersFast = 0;
  let ordersSlow = 0;
  const FIVE_MIN_MS = 5 * 60 * 1000;
  for (const o of orderRows) {
    const lag = o.createdAt.getTime() - o.orderDate.getTime();
    if (Math.abs(lag) < FIVE_MIN_MS) ordersFast += 1;
    else ordersSlow += 1;
  }
  const totalOrders = ordersFast + ordersSlow;
  const webhookRatio = totalOrders > 0 ? ordersFast / totalOrders : 1;

  return {
    clickCoveragePct: Math.round(clickCoverageRatio * 100),
    identityPct: Math.round(identityRatio * 100),
    capiPct: Math.round(capiRatio * 100),
    freshPct: Math.round(freshRatio * 100),
    webhookPct: Math.round(webhookRatio * 100),
    attributedRevenue: Number(revenueAgg._sum.attributedValue ?? 0),
    totalPurchases,
    visitorsWithEmail,
    visitorsWithBoth,
    clickTotal,
    totalPurchasesForMatch,
    totalTouchpoints,
    totalOrders,
  };
}

// ──────────────────────────────────────────────────────────
// Compute weighted score from lever percents
// ──────────────────────────────────────────────────────────
function computeWeightedScore(percents: {
  clickCoveragePct: number;
  identityPct: number;
  capiPct: number;
  freshPct: number;
  webhookPct: number;
}): number {
  const targets = [
    { pct: percents.clickCoveragePct, target: 95, weight: 0.25 },
    { pct: percents.identityPct, target: 80, weight: 0.25 },
    { pct: percents.capiPct, target: 70, weight: 0.2 },
    { pct: percents.freshPct, target: 90, weight: 0.15 },
    { pct: percents.webhookPct, target: 99, weight: 0.15 },
  ];
  const weightedSum = targets.reduce((acc, t) => {
    const ratio = clamp(t.pct / t.target, 0, 1);
    return acc + ratio * t.weight * 100;
  }, 0);
  return Math.round(clamp(weightedSum));
}

export async function GET(req: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const win = parseWindow(url.searchParams.get("window"));

    const cacheKey = `${orgId}:${win.key}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.data);
    }

    const now = new Date();
    const rangeStart = new Date(now.getTime() - win.days * MS_DAY);
    const priorStart = new Date(now.getTime() - 2 * win.days * MS_DAY);
    const priorEnd = rangeStart;

    // Compute current and prior period in parallel
    const [current, prior, opportunities] = await Promise.all([
      computeLeverPercents(orgId, rangeStart, now),
      computeLeverPercents(orgId, priorStart, priorEnd),
      prisma.insight.findMany({
        where: {
          organizationId: orgId,
          isDismissed: false,
          OR: [
            { metric: { startsWith: "ads_untagged_clicks" } },
            { metric: { startsWith: "pixel_quality" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          description: true,
          action: true,
          metric: true,
          metricValue: true,
          createdAt: true,
        },
      }),
    ]);

    const score = computeWeightedScore(current);
    const priorScore = computeWeightedScore(prior);
    const { label, color } = scoreLabel(score);

    const attributedRevenue = current.attributedRevenue;

    // Build full lever results with money-at-risk + unlock instructions
    const clickCoverageRatio = current.clickCoveragePct / 100;
    const identityRatio = current.identityPct / 100;
    const capiRatio = current.capiPct / 100;
    const freshRatio = current.freshPct / 100;
    const webhookRatio = current.webhookPct / 100;

    const levers: LeverResult[] = [
      {
        key: "click_coverage",
        name: "Cobertura de clicks",
        description:
          "Qué porcentaje de tus clicks pagados llegan con UTMs limpios y listos para atribuir.",
        current: current.clickCoveragePct,
        target: 95,
        weight: 0.25,
        status: statusForRatio(current.clickCoveragePct, 95),
        moneyAtRiskArs:
          current.clickTotal > 0
            ? Math.round((1 - clickCoverageRatio) * attributedRevenue * 0.4)
            : 0,
        unlockTitle: "Etiquetá tus clicks pagados",
        unlockSteps: [
          "Abrí Meta Ads Manager → tu campaña → Configuración → URL parameters",
          "Pegá este template: utm_source=meta&utm_medium=cpc&utm_campaign={{campaign.name}}&utm_content={{ad.name}}",
          "En Google Ads activá Auto-Tagging (Configuración → Cuenta) — el gclid se agrega solo",
          "En TikTok Ads pegá: utm_source=tiktok&utm_medium=cpc&utm_campaign=__CAMPAIGN_NAME__",
          "NitroPixel detecta los nuevos UTMs en menos de 1 hora",
        ],
      },
      {
        key: "identity_richness",
        name: "Riqueza de identidad",
        description:
          "Qué porcentaje de tus clientes identificados tienen email + teléfono — la combinación de oro para Meta CAPI.",
        current: current.identityPct,
        target: 80,
        weight: 0.25,
        status: statusForRatio(current.identityPct, 80),
        moneyAtRiskArs: Math.round((1 - identityRatio) * attributedRevenue * 0.15),
        unlockTitle: "Capturá teléfono en checkout",
        unlockSteps: [
          "VTEX ya pide teléfono en clientProfileData — verificá que el campo no esté oculto",
          "Si usás un theme custom, asegurate que el input phone esté visible y obligatorio",
          "Para customers existentes, agregá un trigger en post-purchase: '¿Querés recibir actualizaciones por WhatsApp?'",
          "NitroPixel ya está leyendo cpd.phone automáticamente — no necesitás tocar código",
        ],
      },
      {
        key: "capi_match",
        name: "Match Quality de Meta CAPI",
        description:
          "Qué porcentaje de tus compras se envían a Meta con cookies _fbc/_fbp reales — Meta paga más cuando el match es mayor.",
        current: current.capiPct,
        target: 70,
        weight: 0.2,
        status: statusForRatio(current.capiPct, 70),
        moneyAtRiskArs: Math.round((1 - capiRatio) * attributedRevenue * 0.2),
        unlockTitle: "Verificá que el Meta Pixel se cargue antes que NitroPixel",
        unlockSteps: [
          "El Meta Pixel base debe cargarse en el <head> del sitio (no al final del body)",
          "NitroPixel lee _fbc y _fbp del browser — si Meta Pixel no se cargó, no existen las cookies",
          "Probá: abrí el sitio → DevTools → Application → Cookies → buscá _fbp (debería empezar con 'fb.1.')",
          "Si _fbp existe pero _fbc no, es porque ningún visitor llegó por un anuncio Meta — eso es normal",
          "Para visitors directos NitroPixel ya envía external_id (email/phone hasheado) que también cuenta para Meta",
        ],
      },
      {
        key: "signal_freshness",
        name: "Frescura de señales",
        description:
          "Qué porcentaje de tus atribuciones usan señales frescas (click ID o UTM del momento del click) vs cookies viejas.",
        current: current.freshPct,
        target: 90,
        weight: 0.15,
        status: statusForRatio(current.freshPct, 90),
        moneyAtRiskArs: Math.round((1 - freshRatio) * attributedRevenue * 0.1),
        unlockTitle: "Mantené las URLs limpias",
        unlockSteps: [
          "No uses redirects intermedios entre el click del ad y tu sitio (cada redirect puede perder el click ID)",
          "Si usás un acortador (bit.ly, etc.), asegurate que pase los query params al destino",
          "En Meta, evitá 'destinos rápidos' que redirigen — usá la URL directa de tu producto",
          "NitroPixel detecta automáticamente cuando una sesión tiene señales frescas vs cookies viejas",
        ],
      },
      {
        key: "webhook_reliability",
        name: "Confiabilidad del webhook",
        description:
          "Qué porcentaje de tus órdenes llegan a NitroPixel en menos de 5 minutos — atribución en tiempo real.",
        current: current.webhookPct,
        target: 99,
        weight: 0.15,
        status: statusForRatio(current.webhookPct, 99),
        moneyAtRiskArs: Math.round((1 - webhookRatio) * attributedRevenue * 0.05),
        unlockTitle: "Verificá el webhook de VTEX",
        unlockSteps: [
          "En VTEX → Admin → Webhooks, confirmá que el endpoint 'NitroSales Orders' esté activo",
          "El URL debe ser: https://app.nitrosales.io/api/webhooks/vtex/orders?key=tu-secret",
          "El trigger debe ser 'Order status changed' — todos los estados",
          "Si una orden tarda en aparecer, NitroPixel hace fallback a polling cada 15 min — nunca se pierde",
        ],
      },
    ];

    // Historical drag warning: si la ventana incluye días previos al fix
    // y todavía no pasaron windowDays naturales desde el fix, marcamos warning.
    const daysSinceFix = Math.max(
      0,
      Math.floor((now.getTime() - FIX_APPLIED_AT.getTime()) / MS_DAY)
    );
    const historicalDragWarning = daysSinceFix < win.days;

    // Trend delta solo si hay data suficiente en el período prior
    const priorHasData =
      prior.clickTotal > 0 ||
      prior.visitorsWithEmail > 0 ||
      prior.totalPurchasesForMatch > 0 ||
      prior.totalTouchpoints > 0 ||
      prior.totalOrders > 0;
    const trendDelta = priorHasData ? score - priorScore : null;

    const result: QualityScoreResponse = {
      ok: true,
      window: win.key,
      windowLabel: win.label,
      windowDays: win.days,
      score,
      scoreLabel: label,
      scoreColor: color,
      priorScore: priorHasData ? priorScore : null,
      trendDelta,
      attributedRevenue,
      totalPurchases: current.totalPurchases,
      levers,
      opportunities: opportunities.map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description,
        action: o.action,
        metric: o.metric,
        metricValue: o.metricValue,
        createdAt: o.createdAt.toISOString(),
      })),
      fixAppliedAt: FIX_APPLIED_AT.toISOString(),
      daysSinceFix,
      historicalDragWarning,
      computedAt: now.toISOString(),
    };

    cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[nitropixel/data-quality-score] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
