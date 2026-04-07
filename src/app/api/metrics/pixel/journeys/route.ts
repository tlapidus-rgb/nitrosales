export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ══════════════════════════════════════════════════════════════
// Customer Journeys API — NitroPixel
// ══════════════════════════════════════════════════════════════
// Devuelve las ultimas N ordenes con su recorrido de touchpoints.
// Estrategia: ALINEADA CON "ORDENES EN VIVO".
//   - Solo ordenes con CUALQUIER PixelAttribution (cualquier modelo).
//     Los touchpoints son hechos del visitante; el modelo solo
//     decide como repartir el credito. Por eso da igual el modelo
//     a la hora de mostrar el journey.
//   - Para cada orden se prefiere la attribution con mas touchpoints.
//   - Sin waterfall a trafficSource (evita "Fulfillment", "Directo"
//     y otros strings de canal que no son touchpoints reales).
//   - Mismos filtros de calidad: excluye marketplace/MELI,
//     CANCELLED/PENDING y totalValue <= 0.
// ══════════════════════════════════════════════════════════════
// GET /api/metrics/pixel/journeys?limit=20
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { getCached, setCache } from "@/lib/api-cache";

interface RawTouchpoint {
  timestamp?: string | number;
  source?: string;
  medium?: string;
  campaign?: string;
  clickId?: string;
  page?: string;
  eventId?: string;
}

interface JourneyTouchpoint {
  ts: string | null;
  source: string;
  medium: string | null;
  campaign: string | null;
  page: string | null;
  label: string;
}

interface JourneyOrder {
  orderId: string;
  externalId: string;
  orderDate: string;
  totalValue: number;
  currency: string;
  itemCount: number;
  status: string;
  customerEmail: string | null;
  visitorId: string | null;
  source: string; // de donde vino la atribucion: "attribution" | "events" | "traffic_source" | "direct"
  touchpointCount: number;
  conversionLag: number | null;
  attributedValue: number;
  touchpoints: JourneyTouchpoint[];
}

// ── Normalizacion de canal ────────────────────────────────────
function normalizeSource(src?: string | null, medium?: string | null, page?: string | null): string {
  const s = (src || "").toLowerCase().trim();
  const m = (medium || "").toLowerCase().trim();

  if (!s && !m) return "direct";
  if (s.includes("facebook") || s.includes("instagram") || s.includes("meta") || s === "fb" || s === "ig" || s.includes("ig.com") || s.includes("fb.com")) return "meta";
  if (s.includes("google")) {
    if (m.includes("organic") || m === "seo" || s === "google_organic") return "google_organic";
    return "google";
  }
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("youtube") || s.includes("yt.")) return "youtube";
  if (s.includes("mercadolibre") || s.includes("meli") || s.includes("ml.com.ar") || s === "ml") return "mercadolibre";
  if (s.includes("email") || m.includes("email") || s.includes("mailchimp") || s.includes("klaviyo")) return "email";
  if (s.includes("whatsapp") || s.includes("wa.me") || s === "wa") return "whatsapp";
  if (s === "(direct)" || s === "direct" || (!s && (m === "(none)" || m === "none"))) return "direct";
  if (m === "organic" || s === "organic") return "organic";
  if (m === "referral" || s === "referral") return "referral";
  if (m === "cpc" || m === "ppc" || m === "paid") return "google";
  if (m === "social" || m === "social-paid") return "meta";
  return s || "direct";
}

const CHANNEL_LABELS: Record<string, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  google_organic: "Google Orgánico",
  tiktok: "TikTok Ads",
  youtube: "YouTube",
  mercadolibre: "MercadoLibre",
  email: "Email",
  whatsapp: "WhatsApp",
  direct: "Directo",
  organic: "Orgánico",
  referral: "Referral",
};

function buildLabel(channel: string): string {
  return CHANNEL_LABELS[channel] || channel.charAt(0).toUpperCase() + channel.slice(1);
}

function tpFromRaw(t: RawTouchpoint): JourneyTouchpoint {
  const channel = normalizeSource(t.source, t.medium, t.page);
  return {
    ts: t.timestamp ? new Date(t.timestamp).toISOString() : null,
    source: channel,
    medium: t.medium || null,
    campaign: t.campaign || null,
    page: t.page || null,
    label: buildLabel(channel),
  };
}

// Deduplica touchpoints consecutivos del mismo canal
function dedupeTouchpoints(tps: JourneyTouchpoint[]): JourneyTouchpoint[] {
  const out: JourneyTouchpoint[] = [];
  for (const tp of tps) {
    const last = out[out.length - 1];
    if (last && last.source === tp.source) continue;
    out.push(tp);
  }
  return out;
}

// ── Handler ───────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);

    const cacheKey = [orgId, limit];
    const cached = getCached<{ orders: JourneyOrder[] }>("journeys", ...cacheKey);
    if (cached) return NextResponse.json(cached);

    // ── Traer las ultimas N ordenes que tengan ALGUNA PixelAttribution ──
    // Da igual el modelo: los touchpoints son hechos del visitante.
    const recentOrders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        trafficSource: { not: "Marketplace" },
        source: { not: "MELI" },
        channel: { not: "marketplace" },
        status: { notIn: ["CANCELLED", "PENDING"] },
        totalValue: { gt: 0 },
        pixelAttributions: { some: {} },
      },
      orderBy: { orderDate: "desc" },
      take: limit,
      select: {
        id: true,
        externalId: true,
        orderDate: true,
        totalValue: true,
        currency: true,
        itemCount: true,
        status: true,
        customerId: true,
        customer: { select: { email: true } },
      },
    });

    if (recentOrders.length === 0) {
      const empty = { orders: [] as JourneyOrder[] };
      setCache("journeys", empty, 60_000, ...cacheKey);
      return NextResponse.json(empty);
    }

    const orderIds = recentOrders.map((o) => o.id);

    // Traer TODAS las attributions de esas ordenes (cualquier modelo)
    const attributions = await prisma.pixelAttribution.findMany({
      where: { organizationId: orgId, orderId: { in: orderIds } },
      include: { visitor: { select: { id: true, visitorId: true, email: true } } },
    });

    // Para cada orden, quedarse con la attribution que tenga MAS touchpoints reales
    // (los touchpoints son hechos; en general son iguales entre modelos, pero por
    // las dudas elegimos la mas rica).
    const attrByOrder = new Map<string, (typeof attributions)[number]>();
    for (const a of attributions) {
      const aTpCount = Array.isArray(a.touchpoints) ? a.touchpoints.length : 0;
      const existing = attrByOrder.get(a.orderId);
      if (!existing) {
        attrByOrder.set(a.orderId, a);
        continue;
      }
      const eTpCount = Array.isArray(existing.touchpoints) ? existing.touchpoints.length : 0;
      if (aTpCount > eTpCount) attrByOrder.set(a.orderId, a);
    }

    // ── Construir respuesta final (solo data real de pixel) ──
    const orders: JourneyOrder[] = [];
    for (const o of recentOrders) {
      const attr = attrByOrder.get(o.id);
      if (!attr) continue; // safety: should not happen given the WHERE filter

      const raw = (attr.touchpoints as unknown as RawTouchpoint[]) || [];
      const tps = dedupeTouchpoints(raw.map(tpFromRaw));
      if (tps.length === 0) continue; // sin touchpoints reales no mostramos la card

      orders.push({
        orderId: o.id,
        externalId: o.externalId,
        orderDate: o.orderDate.toISOString(),
        totalValue: Number(o.totalValue),
        currency: o.currency,
        itemCount: o.itemCount,
        status: o.status,
        customerEmail: o.customer?.email ?? null,
        visitorId: attr.visitor?.visitorId ?? null,
        source: "attribution",
        touchpointCount: tps.length,
        conversionLag: attr.conversionLag,
        attributedValue: Number(attr.attributedValue),
        touchpoints: tps,
      });
    }

    const payload = { orders };
    setCache("journeys", payload, 60_000, ...cacheKey);
    return NextResponse.json(payload);
  } catch (e: any) {
    console.error("[journeys] error", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}

