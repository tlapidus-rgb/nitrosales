// ══════════════════════════════════════════════════════════════
// NitroPixel · Data Quality Score API — Read-Only
// ──────────────────────────────────────────────────────────────
// GET /api/nitropixel/data-quality-score
//
// Devuelve el "NitroScore" (0-100) y sus 5 palancas:
//   1. Cobertura de clicks       (peso 25%)
//   2. Riqueza de identidad      (peso 25%)
//   3. Match Quality de Meta CAPI (peso 20%)
//   4. Frescura de señales        (peso 15%)
//   5. Confiabilidad del webhook  (peso 15%)
//
// Cada palanca incluye: current%, target%, status, peso, copy positivo
// y money-at-risk en ARS (cuánto revenue atribuido se está dejando
// sobre la mesa por no estar al 100%).
//
// 100% READ-ONLY · cero migraciones · cero columnas nuevas.
// Cacheado en memoria 5 minutos por org para ahorrar queries.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MS_DAY = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ── Cache en memoria por organización ──
type CacheEntry = { data: unknown; expiresAt: number };
const cache = new Map<string, CacheEntry>();

// ── Tipos del resultado ──
interface LeverResult {
  key: "click_coverage" | "identity_richness" | "capi_match" | "signal_freshness" | "webhook_reliability";
  name: string;
  description: string; // copy positivo
  current: number; // 0-100
  target: number; // 0-100
  weight: number; // 0-1
  status: "perfect" | "great" | "good" | "opportunity";
  moneyAtRiskArs: number; // revenue que se gana si llega al target
  unlockTitle: string;
  unlockSteps: string[];
}

interface QualityScoreResponse {
  ok: boolean;
  score: number; // 0-100 ponderado
  scoreLabel: string; // "Excelente" | "Muy bueno" | "Bueno" | "Por desbloquear"
  scoreColor: string; // hex
  trendDelta: number | null; // diff vs hace 7 días (placeholder por ahora: null)
  attributedRevenue30d: number;
  totalPurchases30d: number;
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

export async function GET() {
  try {
    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // ─── Cache hit ───
    const cached = cache.get(orgId);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.data);
    }

    const now = new Date();
    const ago7d = new Date(now.getTime() - 7 * MS_DAY);
    const ago30d = new Date(now.getTime() - 30 * MS_DAY);

    // ──────────────────────────────────────────────────────────
    // Queries paralelas — todas READ-ONLY
    // ──────────────────────────────────────────────────────────
    const [
      // Lever 1 — Click coverage
      clickCoverageRows,
      // Lever 2 — Identity richness
      visitorsTotal,
      visitorsWithEmail,
      visitorsWithPhone,
      visitorsWithBoth,
      // Lever 3 — Meta CAPI match
      purchaseRows,
      // Lever 4 — Signal freshness (touchpoints)
      attributionSample,
      // Lever 5 — Webhook reliability
      orderRows,
      // Money lever — total attributed revenue 30d
      revenueAgg,
      totalPurchases,
      // Opportunities feed (Insights from cron)
      opportunities,
    ] = await Promise.all([
      // Lever 1: count events that have a click ID + whether they ALSO have UTM source
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
          AND "receivedAt" >= ${ago7d}
          AND type IN ('PAGE_VIEW', 'PAGEVIEW', 'SESSION_START')
        GROUP BY 1, 2
      `,

      // Lever 2: identity totals
      prisma.pixelVisitor.count({
        where: { organizationId: orgId, lastSeenAt: { gte: ago30d } },
      }),
      prisma.pixelVisitor.count({
        where: { organizationId: orgId, email: { not: null }, lastSeenAt: { gte: ago30d } },
      }),
      prisma.pixelVisitor.count({
        where: { organizationId: orgId, phone: { not: null }, lastSeenAt: { gte: ago30d } },
      }),
      prisma.pixelVisitor.count({
        where: {
          organizationId: orgId,
          email: { not: null },
          phone: { not: null },
          lastSeenAt: { gte: ago30d },
        },
      }),

      // Lever 3: PURCHASE events with vs without fbc/fbp
      prisma.$queryRaw<Array<{ has_match: boolean; cnt: bigint }>>`
        SELECT
          ("metaFbc" IS NOT NULL OR "metaFbp" IS NOT NULL) AS has_match,
          COUNT(*)::bigint AS cnt
        FROM pixel_events
        WHERE "organizationId" = ${orgId}
          AND "receivedAt" >= ${ago30d}
          AND type = 'PURCHASE'
        GROUP BY 1
      `,

      // Lever 4: sample of NITRO attributions to inspect touchpoints JSON
      prisma.pixelAttribution.findMany({
        where: {
          organizationId: orgId,
          model: "NITRO",
          createdAt: { gte: ago30d },
        },
        select: { touchpoints: true },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),

      // Lever 5: orders from last 7d with createdAt and orderDate
      prisma.order.findMany({
        where: { organizationId: orgId, createdAt: { gte: ago7d } },
        select: { createdAt: true, orderDate: true },
        take: 1000,
        orderBy: { createdAt: "desc" },
      }),

      // Total NITRO attributed revenue last 30d
      prisma.pixelAttribution.aggregate({
        where: { organizationId: orgId, model: "NITRO", createdAt: { gte: ago30d } },
        _sum: { attributedValue: true },
      }),

      // Total PURCHASE events last 30d (denominator anchor)
      prisma.pixelEvent.count({
        where: { organizationId: orgId, type: "PURCHASE", receivedAt: { gte: ago30d } },
      }),

      // Opportunities = unread Insights from the cron, filtered to data quality types
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

    const attributedRevenue30d = Number(revenueAgg._sum.attributedValue ?? 0);

    // ──────────────────────────────────────────────────────────
    // Lever 1 — Click Coverage
    // ──────────────────────────────────────────────────────────
    let clicksWithUtm = 0;
    let clicksWithoutUtm = 0;
    for (const r of clickCoverageRows) {
      const c = Number(r.cnt);
      if (r.has_click && r.has_utm) clicksWithUtm += c;
      else if (r.has_click && !r.has_utm) clicksWithoutUtm += c;
    }
    const clickTotal = clicksWithUtm + clicksWithoutUtm;
    const clickCoverageRatio = clickTotal > 0 ? clicksWithUtm / clickTotal : 1;
    const clickCoveragePct = Math.round(clickCoverageRatio * 100);
    const clickCoverageLever: LeverResult = {
      key: "click_coverage",
      name: "Cobertura de clicks",
      description:
        "Qué porcentaje de tus clicks pagados llegan con UTMs limpios y listos para atribuir.",
      current: clickCoveragePct,
      target: 95,
      weight: 0.25,
      status: statusForRatio(clickCoveragePct, 95),
      moneyAtRiskArs:
        clickTotal > 0
          ? Math.round((1 - clickCoverageRatio) * attributedRevenue30d * 0.4)
          : 0,
      unlockTitle: "Etiquetá tus clicks pagados",
      unlockSteps: [
        "Abrí Meta Ads Manager → tu campaña → Configuración → URL parameters",
        "Pegá este template: utm_source=meta&utm_medium=cpc&utm_campaign={{campaign.name}}&utm_content={{ad.name}}",
        "En Google Ads activá Auto-Tagging (Configuración → Cuenta) — el gclid se agrega solo",
        "En TikTok Ads pegá: utm_source=tiktok&utm_medium=cpc&utm_campaign=__CAMPAIGN_NAME__",
        "NitroPixel detecta los nuevos UTMs en menos de 1 hora",
      ],
    };

    // ──────────────────────────────────────────────────────────
    // Lever 2 — Identity Richness
    // ──────────────────────────────────────────────────────────
    // Definición: % de visitors identificados (con email) que ADEMÁS tienen phone.
    const identityRatio = visitorsWithEmail > 0 ? visitorsWithBoth / visitorsWithEmail : 1;
    const identityPct = Math.round(identityRatio * 100);
    const identityLever: LeverResult = {
      key: "identity_richness",
      name: "Riqueza de identidad",
      description:
        "Qué porcentaje de tus clientes identificados tienen email + teléfono — la combinación de oro para Meta CAPI.",
      current: identityPct,
      target: 80,
      weight: 0.25,
      status: statusForRatio(identityPct, 80),
      moneyAtRiskArs: Math.round((1 - identityRatio) * attributedRevenue30d * 0.15),
      unlockTitle: "Capturá teléfono en checkout",
      unlockSteps: [
        "VTEX ya pide teléfono en clientProfileData — verificá que el campo no esté oculto",
        "Si usás un theme custom, asegurate que el input phone esté visible y obligatorio",
        "Para customers existentes, agregá un trigger en post-purchase: '¿Querés recibir actualizaciones por WhatsApp?'",
        "NitroPixel ya está leyendo cpd.phone automáticamente — no necesitás tocar código",
      ],
    };

    // ──────────────────────────────────────────────────────────
    // Lever 3 — Meta CAPI Match Quality
    // ──────────────────────────────────────────────────────────
    let purchasesWithMatch = 0;
    let purchasesWithoutMatch = 0;
    for (const r of purchaseRows) {
      const c = Number(r.cnt);
      if (r.has_match) purchasesWithMatch += c;
      else purchasesWithoutMatch += c;
    }
    const totalPurchasesForMatch = purchasesWithMatch + purchasesWithoutMatch;
    const capiRatio = totalPurchasesForMatch > 0 ? purchasesWithMatch / totalPurchasesForMatch : 1;
    const capiPct = Math.round(capiRatio * 100);
    const capiLever: LeverResult = {
      key: "capi_match",
      name: "Match Quality de Meta CAPI",
      description:
        "Qué porcentaje de tus compras se envían a Meta con cookies _fbc/_fbp reales — Meta paga más cuando el match es mayor.",
      current: capiPct,
      target: 70,
      weight: 0.2,
      status: statusForRatio(capiPct, 70),
      moneyAtRiskArs: Math.round((1 - capiRatio) * attributedRevenue30d * 0.2),
      unlockTitle: "Verificá que el Meta Pixel se cargue antes que NitroPixel",
      unlockSteps: [
        "El Meta Pixel base debe cargarse en el <head> del sitio (no al final del body)",
        "NitroPixel lee _fbc y _fbp del browser — si Meta Pixel no se cargó, no existen las cookies",
        "Probá: abrí el sitio → DevTools → Application → Cookies → buscá _fbp (debería empezar con 'fb.1.')",
        "Si _fbp existe pero _fbc no, es porque ningún visitor llegó por un anuncio Meta — eso es normal",
        "Para visitors directos NitroPixel ya envía external_id (email/phone hasheado) que también cuenta para Meta",
      ],
    };

    // ──────────────────────────────────────────────────────────
    // Lever 4 — Signal Freshness
    // ──────────────────────────────────────────────────────────
    let totalTouchpoints = 0;
    let freshTouchpoints = 0;
    for (const att of attributionSample) {
      const tps = att.touchpoints as Array<Record<string, unknown>> | null;
      if (!Array.isArray(tps)) continue;
      for (const tp of tps) {
        totalTouchpoints += 1;
        // confidence puede no existir en touchpoints viejos → asumimos fresh
        const confidence = (tp as { confidence?: string }).confidence;
        if (!confidence || confidence === "fresh_click" || confidence === "fresh_utm" || confidence === "referrer") {
          freshTouchpoints += 1;
        }
      }
    }
    const freshRatio = totalTouchpoints > 0 ? freshTouchpoints / totalTouchpoints : 1;
    const freshPct = Math.round(freshRatio * 100);
    const freshLever: LeverResult = {
      key: "signal_freshness",
      name: "Frescura de señales",
      description:
        "Qué porcentaje de tus atribuciones usan señales frescas (click ID o UTM del momento del click) vs cookies viejas.",
      current: freshPct,
      target: 90,
      weight: 0.15,
      status: statusForRatio(freshPct, 90),
      moneyAtRiskArs: Math.round((1 - freshRatio) * attributedRevenue30d * 0.1),
      unlockTitle: "Mantené las URLs limpias",
      unlockSteps: [
        "No uses redirects intermedios entre el click del ad y tu sitio (cada redirect puede perder el click ID)",
        "Si usás un acortador (bit.ly, etc.), asegurate que pase los query params al destino",
        "En Meta, evitá 'destinos rápidos' que redirigen — usá la URL directa de tu producto",
        "NitroPixel detecta automáticamente cuando una sesión tiene señales frescas vs cookies viejas",
      ],
    };

    // ──────────────────────────────────────────────────────────
    // Lever 5 — Webhook Reliability
    // ──────────────────────────────────────────────────────────
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
    const webhookPct = Math.round(webhookRatio * 100);
    const webhookLever: LeverResult = {
      key: "webhook_reliability",
      name: "Confiabilidad del webhook",
      description:
        "Qué porcentaje de tus órdenes llegan a NitroPixel en menos de 5 minutos — atribución en tiempo real.",
      current: webhookPct,
      target: 99,
      weight: 0.15,
      status: statusForRatio(webhookPct, 99),
      moneyAtRiskArs: Math.round((1 - webhookRatio) * attributedRevenue30d * 0.05),
      unlockTitle: "Verificá el webhook de VTEX",
      unlockSteps: [
        "En VTEX → Admin → Webhooks, confirmá que el endpoint 'NitroSales Orders' esté activo",
        "El URL debe ser: https://app.nitrosales.io/api/webhooks/vtex/orders?key=tu-secret",
        "El trigger debe ser 'Order status changed' — todos los estados",
        "Si una orden tarda en aparecer, NitroPixel hace fallback a polling cada 15 min — nunca se pierde",
      ],
    };

    // ──────────────────────────────────────────────────────────
    // Score ponderado
    // ──────────────────────────────────────────────────────────
    const levers: LeverResult[] = [
      clickCoverageLever,
      identityLever,
      capiLever,
      freshLever,
      webhookLever,
    ];

    const weightedSum = levers.reduce((acc, l) => {
      // Cada palanca aporta proporcional a su % vs target × peso
      const ratio = clamp(l.current / l.target, 0, 1);
      return acc + ratio * l.weight * 100;
    }, 0);
    const score = Math.round(clamp(weightedSum));
    const { label, color } = scoreLabel(score);

    const result: QualityScoreResponse = {
      ok: true,
      score,
      scoreLabel: label,
      scoreColor: color,
      trendDelta: null, // futura mejora: snapshots históricos
      attributedRevenue30d,
      totalPurchases30d: totalPurchases,
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
      computedAt: now.toISOString(),
    };

    cache.set(orgId, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[nitropixel/data-quality-score] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
