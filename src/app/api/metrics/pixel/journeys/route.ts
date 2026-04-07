export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ══════════════════════════════════════════════════════════════
// Customer Journeys API — NitroPixel
// ══════════════════════════════════════════════════════════════
// Devuelve las ultimas N ordenes con su recorrido completo de
// touchpoints (canal de origen, paso por paso). Pensado para
// renderizar visualmente el journey de cada cliente.
// ══════════════════════════════════════════════════════════════
// GET /api/metrics/pixel/journeys?limit=20&model=DATA_DRIVEN
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
  source: string;        // canal normalizado: meta, google, tiktok, organic, direct, email, ml, referral
  medium: string | null;
  campaign: string | null;
  page: string | null;
  label: string;         // texto legible
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
  model: string | null;
  touchpointCount: number;
  conversionLag: number | null;
  attributedValue: number;
  touchpoints: JourneyTouchpoint[];
}

// Normaliza source/utm_source/referrer a un canal canonico
function normalizeSource(src?: string, medium?: string, page?: string): string {
  const s = (src || "").toLowerCase();
  const m = (medium || "").toLowerCase();
  if (!s && !m) {
    if (!page) return "direct";
    return "direct";
  }
  if (s.includes("facebook") || s.includes("instagram") || s.includes("meta") || s === "fb" || s === "ig") return "meta";
  if (s.includes("google")) {
    if (m.includes("organic") || m === "seo") return "google_organic";
    return "google";
  }
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("youtube")) return "youtube";
  if (s.includes("mercadolibre") || s.includes("meli")) return "mercadolibre";
  if (s.includes("email") || m.includes("email")) return "email";
  if (s.includes("whatsapp") || s.includes("wa")) return "whatsapp";
  if (s === "(direct)" || s === "direct" || (!s && m === "(none)")) return "direct";
  if (m === "organic") return "organic";
  if (m === "referral") return "referral";
  return s || "direct";
}

function buildLabel(channel: string, campaign?: string): string {
  const labels: Record<string, string> = {
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
  const base = labels[channel] || channel;
  return campaign ? `${base}` : base;
}

export async function GET(request: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
    const model = (searchParams.get("model") || "DATA_DRIVEN").toUpperCase() as
      | "DATA_DRIVEN" | "LAST_CLICK" | "FIRST_CLICK" | "LINEAR" | "TIME_DECAY";

    const cacheKey = [orgId, limit, model];
    const cached = getCached<{ orders: JourneyOrder[] }>("journeys", ...cacheKey);
    if (cached) return NextResponse.json(cached);

    // Buscar las ultimas N atribuciones del modelo, junto con la orden y customer
    const attributions = await prisma.pixelAttribution.findMany({
      where: { organizationId: orgId, model: model as any },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        order: {
          select: {
            id: true,
            externalId: true,
            orderDate: true,
            totalValue: true,
            currency: true,
            itemCount: true,
            status: true,
            customer: { select: { email: true } },
          },
        },
        visitor: { select: { visitorId: true } },
      },
    });

    const orders: JourneyOrder[] = attributions.map((a) => {
      const raw = (a.touchpoints as unknown as RawTouchpoint[]) || [];
      const touchpoints: JourneyTouchpoint[] = raw.map((t) => {
        const channel = normalizeSource(t.source, t.medium, t.page);
        return {
          ts: t.timestamp ? new Date(t.timestamp).toISOString() : null,
          source: channel,
          medium: t.medium || null,
          campaign: t.campaign || null,
          page: t.page || null,
          label: buildLabel(channel, t.campaign),
        };
      });

      return {
        orderId: a.order.id,
        externalId: a.order.externalId,
        orderDate: a.order.orderDate.toISOString(),
        totalValue: Number(a.order.totalValue),
        currency: a.order.currency,
        itemCount: a.order.itemCount,
        status: a.order.status,
        customerEmail: a.order.customer?.email ?? null,
        visitorId: a.visitor?.visitorId ?? null,
        model: a.model,
        touchpointCount: a.touchpointCount,
        conversionLag: a.conversionLag,
        attributedValue: Number(a.attributedValue),
        touchpoints,
      };
    });

    const payload = { orders, model };
    setCache("journeys", payload, 60_000, ...cacheKey);
    return NextResponse.json(payload);
  } catch (e: any) {
    console.error("[journeys] error", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
