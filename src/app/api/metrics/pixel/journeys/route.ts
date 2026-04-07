export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ══════════════════════════════════════════════════════════════
// Customer Journeys API — NitroPixel
// ══════════════════════════════════════════════════════════════
// Devuelve las ultimas N ordenes con su recorrido completo de
// touchpoints. Estrategia robusta en 3 capas:
//   1) PixelAttribution (modelo NITRO) — fuente principal
//   2) PixelEvents del visitor asociado al customer/email
//   3) Order.trafficSource como fallback
// Asi siempre devolvemos algo aunque el motor de atribucion
// todavia no haya corrido.
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

    // ── Capa 1: traer las ultimas ordenes con su attribution NITRO (si existe) ──
    // LEFT JOIN logic: traemos las ordenes mas recientes y por separado las attributions.
    const recentOrders = await prisma.order.findMany({
      where: { organizationId: orgId },
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
        trafficSource: true,
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

    // Buscamos cualquier atribucion para esas ordenes (cualquier modelo, priorizando NITRO)
    const attributions = await prisma.pixelAttribution.findMany({
      where: { organizationId: orgId, orderId: { in: orderIds } },
      include: { visitor: { select: { id: true, visitorId: true, email: true } } },
    });

    // Indexar por orderId, priorizando NITRO
    const attrByOrder = new Map<string, (typeof attributions)[number]>();
    for (const a of attributions) {
      const existing = attrByOrder.get(a.orderId);
      if (!existing || a.model === "NITRO") attrByOrder.set(a.orderId, a);
    }

    // Para ordenes sin atribucion, intentamos buscar pixel events del visitor por email
    const ordersWithoutAttr = recentOrders.filter((o) => !attrByOrder.has(o.id) && o.customer?.email);
    const emails = Array.from(new Set(ordersWithoutAttr.map((o) => o.customer!.email!).filter(Boolean)));

    const visitorsByEmail = new Map<string, { id: string; visitorId: string }>();
    if (emails.length > 0) {
      const visitors = await prisma.pixelVisitor.findMany({
        where: { organizationId: orgId, email: { in: emails } },
        select: { id: true, visitorId: true, email: true },
      });
      for (const v of visitors) {
        if (v.email) visitorsByEmail.set(v.email, { id: v.id, visitorId: v.visitorId });
      }
    }

    // Para cada orden sin attribution pero con visitor encontrado, traer sus eventos previos a la compra
    const eventsByOrder = new Map<string, JourneyTouchpoint[]>();
    const visitorIdsToFetch: string[] = [];
    for (const o of ordersWithoutAttr) {
      const v = o.customer?.email ? visitorsByEmail.get(o.customer.email) : null;
      if (v) visitorIdsToFetch.push(v.id);
    }

    if (visitorIdsToFetch.length > 0) {
      const events = await prisma.pixelEvent.findMany({
        where: {
          organizationId: orgId,
          visitorId: { in: visitorIdsToFetch },
          type: { in: ["PAGE_VIEW", "VIEW_PRODUCT", "ADD_TO_CART"] },
        },
        select: {
          visitorId: true,
          timestamp: true,
          utmParams: true,
          referrer: true,
          pageUrl: true,
        },
        orderBy: { timestamp: "asc" },
        take: 500,
      });

      // Agrupar por visitor
      const byVisitor = new Map<string, typeof events>();
      for (const e of events) {
        if (!byVisitor.has(e.visitorId)) byVisitor.set(e.visitorId, []);
        byVisitor.get(e.visitorId)!.push(e);
      }

      // Mapear ordenes -> visitor.id -> events filtrados (eventos antes de orderDate)
      for (const o of ordersWithoutAttr) {
        const email = o.customer?.email;
        if (!email) continue;
        const v = visitorsByEmail.get(email);
        if (!v) continue;
        const evts = (byVisitor.get(v.id) || []).filter((e) => e.timestamp <= o.orderDate);
        if (evts.length === 0) continue;
        // Tomamos hasta 6 eventos representativos: primero, ultimo, y los 4 mas espaciados en el medio
        const pick = pickRepresentativeEvents(evts, 6);
        const tps = dedupeTouchpoints(
          pick.map((e) => {
            const utm = (e.utmParams as any) || {};
            const ref = e.referrer || "";
            const refSource = ref ? extractRefSource(ref) : "";
            return tpFromRaw({
              timestamp: e.timestamp.toISOString(),
              source: utm.source || refSource,
              medium: utm.medium,
              campaign: utm.campaign,
              page: e.pageUrl || undefined,
            });
          })
        );
        eventsByOrder.set(o.id, tps);
      }
    }

    // ── Construir respuesta final ──
    const orders: JourneyOrder[] = recentOrders.map((o) => {
      const attr = attrByOrder.get(o.id);

      // Capa 1: attribution con touchpoints en JSON
      if (attr) {
        const raw = (attr.touchpoints as unknown as RawTouchpoint[]) || [];
        const tps = dedupeTouchpoints(raw.map(tpFromRaw));
        if (tps.length > 0) {
          return {
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
          };
        }
      }

      // Capa 2: pixel events del visitor
      const eventTps = eventsByOrder.get(o.id);
      if (eventTps && eventTps.length > 0) {
        return {
          orderId: o.id,
          externalId: o.externalId,
          orderDate: o.orderDate.toISOString(),
          totalValue: Number(o.totalValue),
          currency: o.currency,
          itemCount: o.itemCount,
          status: o.status,
          customerEmail: o.customer?.email ?? null,
          visitorId: null,
          source: "events",
          touchpointCount: eventTps.length,
          conversionLag: null,
          attributedValue: 0,
          touchpoints: eventTps,
        };
      }

      // Capa 3: trafficSource de la orden
      const ts = o.trafficSource;
      if (ts && ts.toLowerCase() !== "unknown") {
        const ch = normalizeSource(ts);
        return {
          orderId: o.id,
          externalId: o.externalId,
          orderDate: o.orderDate.toISOString(),
          totalValue: Number(o.totalValue),
          currency: o.currency,
          itemCount: o.itemCount,
          status: o.status,
          customerEmail: o.customer?.email ?? null,
          visitorId: null,
          source: "traffic_source",
          touchpointCount: 1,
          conversionLag: null,
          attributedValue: 0,
          touchpoints: [{ ts: o.orderDate.toISOString(), source: ch, medium: null, campaign: null, page: null, label: buildLabel(ch) }],
        };
      }

      // Ultimo recurso: directo
      return {
        orderId: o.id,
        externalId: o.externalId,
        orderDate: o.orderDate.toISOString(),
        totalValue: Number(o.totalValue),
        currency: o.currency,
        itemCount: o.itemCount,
        status: o.status,
        customerEmail: o.customer?.email ?? null,
        visitorId: null,
        source: "direct",
        touchpointCount: 1,
        conversionLag: null,
        attributedValue: 0,
        touchpoints: [{ ts: o.orderDate.toISOString(), source: "direct", medium: null, campaign: null, page: null, label: "Directo" }],
      };
    });

    const payload = { orders };
    setCache("journeys", payload, 60_000, ...cacheKey);
    return NextResponse.json(payload);
  } catch (e: any) {
    console.error("[journeys] error", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────
function pickRepresentativeEvents<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  // Tomamos primero, ultimo, y N-2 espaciados en el medio
  const result: T[] = [arr[0]];
  const middle = arr.slice(1, -1);
  const stepCount = max - 2;
  if (stepCount > 0 && middle.length > 0) {
    const step = middle.length / stepCount;
    for (let i = 0; i < stepCount; i++) {
      const idx = Math.min(Math.floor(i * step), middle.length - 1);
      result.push(middle[idx]);
    }
  }
  result.push(arr[arr.length - 1]);
  return result;
}

function extractRefSource(referrer: string): string {
  try {
    const u = new URL(referrer);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host.includes("facebook") || host.includes("instagram") || host.includes("fb.")) return "meta";
    if (host.includes("google")) return "google";
    if (host.includes("tiktok")) return "tiktok";
    if (host.includes("youtube") || host.includes("yt.")) return "youtube";
    if (host.includes("mercadolibre") || host.includes("meli")) return "mercadolibre";
    if (host.includes("whatsapp") || host.includes("wa.me")) return "whatsapp";
    if (host.includes("bing")) return "google";
    return host;
  } catch {
    return "";
  }
}
