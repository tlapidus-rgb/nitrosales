export const dynamic = "force-dynamic";
export const revalidate = 0;

// ═══════════════════════════════════════════════════════════════════
// /api/bondly/behavioral-ltv — Behavioral LTV Explorer
// ═══════════════════════════════════════════════════════════════════
//
// Devuelve una lista paginada de visitantes pixel con su behavioral
// score 0-100 calculado por src/lib/bondly/behavioral-score.ts.
//
// READ-ONLY sobre NitroPixel. No escribe nada, no modifica schemas.
// CLAUDE.md §REGLA #3b: sin JOIN a tablas pesadas, sin CASTs riesgosos,
// max 3 queries por batch, pool=8.
//
// IP protection (ver plan Trust Layer):
//   - Solo devuelve `score`, `tier`, `drivers` textuales y metadata
//     no-sensible. NUNCA pesos ni señales crudas.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import {
  computeBehavioralScore,
  type BehavioralScoreResult,
} from "@/lib/bondly/behavioral-score";

interface VisitorRow {
  id: string; // PK cuid used for FK joins
  visitorId: string; // UUID del cookie _np_vid
  email: string | null;
  phone: string | null;
  customerId: string | null;
  totalSessions: number;
  totalPageViews: number;
  deviceTypesCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  cartAdds30d: number;
  uniqueProducts: number;
  hasPurchase: boolean;
  firstSource: string | null;
}

interface VisitorResponse {
  visitorId: string;
  displayId: string; // anonimizado: "V-a1b2c3d4" para anónimos, email/phone para identificados
  isIdentified: boolean;
  isCustomer: boolean;
  customerId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  daysSinceLastSeen: number;
  score: number;
  tier: BehavioralScoreResult["tier"];
  drivers: string[];
  decayed: boolean;
  status: "anonymous" | "identified_no_purchase" | "customer";
}

function anonymizeVisitorId(v: string): string {
  // Toma 8 chars del hash visitorId para mostrar en UI sin exponer el ID completo
  const clean = v.replace(/[^a-zA-Z0-9]/g, "");
  return `V-${clean.slice(0, 8).toLowerCase()}`;
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export async function GET(req: NextRequest) {
  try {
    const organizationId = await getOrganizationId();
    const url = new URL(req.url);

    const filter = (url.searchParams.get("filter") || "all") as
      | "all"
      | "anonymous_high"
      | "identified_no_purchase"
      | "customer_low_score";
    const minScore = Math.max(
      0,
      Math.min(100, parseInt(url.searchParams.get("minScore") || "0", 10) || 0)
    );
    const limit = Math.max(
      10,
      Math.min(200, parseInt(url.searchParams.get("limit") || "50", 10) || 50)
    );

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ─── Query principal (1 sola query, con CTE) ────────────────────
    // Trae los 500 visitors más recientes y computa en el mismo SQL:
    //   - cart_adds_30d
    //   - unique_products (distinct props->>'item_id')
    //   - has_purchase
    //   - first_source
    // Todo contra pixel_events filtrado por organizationId + visitorId.
    //
    // LIMIT 500 antes del scoring para no explotar si hay 10K+ visitantes.
    // NOTA CLAUDE.md §REGLA #3b:
    //   - Sin JOIN a orders (tabla grande). Este endpoint es 100% pixel.
    //   - pixel_events.visitorId referencia pixel_visitors.id (cuid PK),
    //     NO la columna `visitorId` (UUID cookie _np_vid). Los joins
    //     abajo usan rv.id = e."visitorId".
    const rows = await prisma.$queryRaw<VisitorRow[]>`
      WITH recent_visitors AS (
        SELECT
          v.id,
          v."visitorId" as "visitorId",
          v.email,
          v.phone,
          v."customerId" as "customerId",
          v."totalSessions" as "totalSessions",
          v."totalPageViews" as "totalPageViews",
          COALESCE(array_length(v."deviceTypes", 1), 0) as "deviceTypesCount",
          v."firstSeenAt" as "firstSeenAt",
          v."lastSeenAt" as "lastSeenAt"
        FROM pixel_visitors v
        WHERE v."organizationId" = ${organizationId}
        ORDER BY v."lastSeenAt" DESC
        LIMIT 500
      ),
      cart_adds AS (
        SELECT
          e."visitorId" as vid,
          COUNT(*)::int as cnt
        FROM pixel_events e
        JOIN recent_visitors rv ON rv.id = e."visitorId"
        WHERE e."organizationId" = ${organizationId}
          AND e.type = 'ADD_TO_CART'
          AND e.timestamp >= ${thirtyDaysAgo}
        GROUP BY e."visitorId"
      ),
      unique_products AS (
        SELECT
          e."visitorId" as vid,
          COUNT(DISTINCT (e.props->>'item_id'))::int as cnt
        FROM pixel_events e
        JOIN recent_visitors rv ON rv.id = e."visitorId"
        WHERE e."organizationId" = ${organizationId}
          AND e.type = 'VIEW_PRODUCT'
          AND e.props->>'item_id' IS NOT NULL
        GROUP BY e."visitorId"
      ),
      purchases AS (
        SELECT
          e."visitorId" as vid,
          COUNT(*)::int as cnt
        FROM pixel_events e
        JOIN recent_visitors rv ON rv.id = e."visitorId"
        WHERE e."organizationId" = ${organizationId}
          AND e.type = 'PURCHASE'
        GROUP BY e."visitorId"
      ),
      first_sources AS (
        SELECT DISTINCT ON (e."visitorId")
          e."visitorId" as vid,
          e."utmParams"->>'utm_source' as source
        FROM pixel_events e
        JOIN recent_visitors rv ON rv.id = e."visitorId"
        WHERE e."organizationId" = ${organizationId}
          AND e."utmParams"->>'utm_source' IS NOT NULL
        ORDER BY e."visitorId", e.timestamp ASC
      )
      SELECT
        rv.id,
        rv."visitorId",
        rv.email,
        rv.phone,
        rv."customerId",
        rv."totalSessions",
        rv."totalPageViews",
        rv."deviceTypesCount",
        rv."firstSeenAt",
        rv."lastSeenAt",
        COALESCE(ca.cnt, 0) as "cartAdds30d",
        COALESCE(up.cnt, 0) as "uniqueProducts",
        (COALESCE(p.cnt, 0) > 0) as "hasPurchase",
        fs.source as "firstSource"
      FROM recent_visitors rv
      LEFT JOIN cart_adds ca ON ca.vid = rv.id
      LEFT JOIN unique_products up ON up.vid = rv.id
      LEFT JOIN purchases p ON p.vid = rv.id
      LEFT JOIN first_sources fs ON fs.vid = rv.id
    `;

    // ─── Scoring en JS (pure function, server-side only) ────────────
    const scored: VisitorResponse[] = rows.map((r) => {
      const daysSince = daysBetween(new Date(r.lastSeenAt), now);
      const scoreResult = computeBehavioralScore({
        totalSessions: Number(r.totalSessions) || 0,
        totalPageViews: Number(r.totalPageViews) || 0,
        cartAddsLast30d: Number(r.cartAdds30d) || 0,
        uniqueProductsViewed: Number(r.uniqueProducts) || 0,
        source: r.firstSource,
        deviceTypesCount: Number(r.deviceTypesCount) || 0,
        daysSinceLastSeen: daysSince,
        hasPurchase: Boolean(r.hasPurchase),
      });

      const isIdentified = Boolean(r.email || r.phone);
      const isCustomer = Boolean(r.customerId);

      let status: VisitorResponse["status"];
      if (isCustomer) status = "customer";
      else if (isIdentified) status = "identified_no_purchase";
      else status = "anonymous";

      const displayId = r.email
        ? r.email
        : r.phone
        ? r.phone
        : anonymizeVisitorId(r.visitorId);

      return {
        visitorId: r.visitorId,
        displayId,
        isIdentified,
        isCustomer,
        customerId: r.customerId,
        firstSeenAt: new Date(r.firstSeenAt).toISOString(),
        lastSeenAt: new Date(r.lastSeenAt).toISOString(),
        daysSinceLastSeen: daysSince,
        score: scoreResult.score,
        tier: scoreResult.tier,
        drivers: scoreResult.drivers,
        decayed: scoreResult.decayed,
        status,
      };
    });

    // ─── Filtros ────────────────────────────────────────────────────
    let filtered = scored;
    if (filter === "anonymous_high") {
      filtered = scored.filter(
        (v) => v.status === "anonymous" && v.score >= 70
      );
    } else if (filter === "identified_no_purchase") {
      filtered = scored.filter((v) => v.status === "identified_no_purchase");
    } else if (filter === "customer_low_score") {
      filtered = scored.filter((v) => v.status === "customer" && v.score < 40);
    }

    if (minScore > 0) {
      filtered = filtered.filter((v) => v.score >= minScore);
    }

    // Orden: score desc, con empate por actividad reciente
    filtered.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.daysSinceLastSeen - b.daysSinceLastSeen;
    });

    const paginated = filtered.slice(0, limit);

    // ─── Stats agregadas (todas sobre el set no-filtrado) ──────────
    const highScore = scored.filter((v) => v.score >= 70).length;
    const anonymousHighScore = scored.filter(
      (v) => v.status === "anonymous" && v.score >= 70
    ).length;
    const identifiedNoPurchase = scored.filter(
      (v) => v.status === "identified_no_purchase"
    ).length;
    const customerLowScore = scored.filter(
      (v) => v.status === "customer" && v.score < 40
    ).length;

    return NextResponse.json({
      visitors: paginated,
      totalReturned: paginated.length,
      totalAnalyzed: scored.length,
      stats: {
        total: scored.length,
        highScore,
        anonymousHighScore,
        identifiedNoPurchase,
        customerLowScore,
      },
      filter,
      minScore,
      limit,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/bondly/behavioral-ltv] error:", err);
    return NextResponse.json(
      {
        error: "Failed to compute behavioral LTV",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
