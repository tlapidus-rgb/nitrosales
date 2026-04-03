import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";
import { getVtexConfig } from "@/lib/vtex-credentials";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/shipping-rates/carriers
 *
 * Returns distinct carrier + service combinations from TWO sources:
 * 1. Real orders in DB (shippingCarrier + shippingService fields)
 * 2. VTEX Logistics API (shipping policies / carriers configured in VTEX)
 *
 * This ensures ALL shipping types appear even if few orders have been
 * detailed yet. The order_count reflects actual DB orders with that carrier.
 */
export async function GET() {
  const org = await getOrganization();
  const orgId = org.id;

  try {
    // Source 1: Carriers found in actual order data
    const dbCarriers = await prisma.$queryRaw<
      Array<{ carrier: string; service: string; order_count: string }>
    >`
      SELECT
        "shippingCarrier" as carrier,
        "shippingService" as service,
        COUNT(*)::text as order_count
      FROM orders
      WHERE "organizationId" = ${orgId}
        AND "shippingCarrier" IS NOT NULL
        AND "shippingCarrier" != ''
        AND status NOT IN ('CANCELLED', 'RETURNED')
      GROUP BY "shippingCarrier", "shippingService"
      ORDER BY COUNT(*) DESC
    `;

    // Source 2: Also count orders by selectedSla from VTEX order details
    // Many orders have shippingService (selectedSla) but shippingCarrier might be null
    // if the carrier wasn't extracted. Let's also query by shippingService alone.
    const dbByService = await prisma.$queryRaw<
      Array<{ service: string; order_count: string }>
    >`
      SELECT
        "shippingService" as service,
        COUNT(*)::text as order_count
      FROM orders
      WHERE "organizationId" = ${orgId}
        AND "shippingService" IS NOT NULL
        AND "shippingService" != ''
        AND status NOT IN ('CANCELLED', 'RETURNED')
      GROUP BY "shippingService"
      ORDER BY COUNT(*) DESC
    `;

    // Source 3: Fetch shipping policies from VTEX Logistics API
    let vtexCarriers: Array<{ carrier: string; service: string; vtexId: string }> = [];
    try {
      const vtexConfig = await getVtexConfig(orgId);
      const resp = await fetch(
        `${vtexConfig.baseUrl}/api/logistics/pvt/shipping-policies`,
        { headers: vtexConfig.headers as any, next: { revalidate: 0 } }
      );
      if (resp.ok) {
        const policies = await resp.json();
        if (Array.isArray(policies)) {
          vtexCarriers = policies
            .filter((p: any) => p.isActive !== false)
            .map((p: any) => ({
              carrier: p.shippingMethod || p.carrierName || p.name || "Desconocido",
              service: p.name || p.id || "Sin nombre",
              vtexId: p.id || "",
            }));
        }
      }
    } catch (vtexErr: any) {
      console.warn("Could not fetch VTEX shipping policies:", vtexErr.message);
      // Non-fatal: we still have DB data
    }

    // Merge all sources into a unified map: key = "carrier|service"
    const merged = new Map<string, { carrier: string; service: string; orderCount: number; fromVtex: boolean }>();

    // Add DB carriers (with actual order counts)
    for (const c of dbCarriers) {
      const key = `${c.carrier}|${c.service}`;
      merged.set(key, {
        carrier: c.carrier,
        service: c.service,
        orderCount: parseInt(c.order_count),
        fromVtex: false,
      });
    }

    // Add DB by-service entries (for orders where carrier is null but service exists)
    for (const s of dbByService) {
      // Check if this service already exists in merged (from dbCarriers)
      const existingWithCarrier = [...merged.values()].find(
        (m) => m.service === s.service
      );
      if (!existingWithCarrier) {
        const key = `_unknown|${s.service}`;
        merged.set(key, {
          carrier: s.service, // Use service name as carrier label
          service: s.service,
          orderCount: parseInt(s.order_count),
          fromVtex: false,
        });
      } else {
        // Update the order count to the higher value (service-level count is more accurate)
        const key = `${existingWithCarrier.carrier}|${existingWithCarrier.service}`;
        const existing = merged.get(key);
        if (existing) {
          existing.orderCount = Math.max(existing.orderCount, parseInt(s.order_count));
        }
      }
    }

    // Add VTEX carriers that aren't already in DB
    for (const vc of vtexCarriers) {
      const existsInDb = [...merged.values()].some(
        (m) => m.service === vc.service || m.carrier === vc.carrier
      );
      if (!existsInDb) {
        const key = `vtex|${vc.vtexId}`;
        merged.set(key, {
          carrier: vc.carrier,
          service: vc.service,
          orderCount: 0,
          fromVtex: true,
        });
      }
    }

    // Sort by order count descending, then by name
    const carriers = [...merged.values()].sort((a, b) => {
      if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
      return a.service.localeCompare(b.service);
    });

    return NextResponse.json({
      carriers,
      sources: {
        dbCarriers: dbCarriers.length,
        dbByService: dbByService.length,
        vtexPolicies: vtexCarriers.length,
      },
    });
  } catch (error: any) {
    console.error("Error fetching carriers:", error);
    return NextResponse.json(
      { error: "Error obteniendo carriers", details: error.message },
      { status: 500 }
    );
  }
}
