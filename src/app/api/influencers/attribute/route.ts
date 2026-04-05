export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Influencer Attribution Job
// ══════════════════════════════════════════════════════════════
// POST — After an order is created, check if it came from an
//        influencer (via UTM source = inf_*) and create the
//        InfluencerAttribution record.
//
// Called internally after order sync or pixel purchase event.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    // Get the order
    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId: org.id },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Check if already attributed
    const existingAttribution = await prisma.influencerAttribution.findFirst({
      where: { orderId: order.id, organizationId: org.id },
    });
    if (existingAttribution) {
      return NextResponse.json({
        success: true,
        message: "Already attributed",
        influencerAttributionId: existingAttribution.id,
      });
    }

    // Get pixel attribution for this order (LAST_CLICK model)
    const pixelAttribution = await prisma.pixelAttribution.findFirst({
      where: { orderId: order.id, organizationId: org.id, model: "LAST_CLICK" },
    });

    if (!pixelAttribution) {
      return NextResponse.json({ success: false, message: "No pixel attribution found" });
    }

    // Parse touchpoints to find influencer source
    const touchpoints = pixelAttribution.touchpoints as Array<{
      source?: string;
      medium?: string;
      campaign?: string;
      timestamp?: string;
    }>;

    if (!touchpoints || !Array.isArray(touchpoints)) {
      return NextResponse.json({ success: false, message: "No touchpoints" });
    }

    // Check last touchpoint (LAST_CLICK) for influencer UTM
    // Also check all touchpoints for any influencer touch
    let influencerCode: string | null = null;
    let campaignSlug: string | null = null;

    for (const tp of touchpoints) {
      const source = tp.source || "";
      if (source.startsWith("inf_")) {
        influencerCode = source.replace("inf_", "");
        campaignSlug = tp.campaign || null;
        break; // Use first (most recent in LAST_CLICK) influencer touch
      }
    }

    if (!influencerCode) {
      return NextResponse.json({ success: false, message: "Not from influencer" });
    }

    // Find the influencer
    const influencer = await prisma.influencer.findUnique({
      where: {
        organizationId_code: { organizationId: org.id, code: influencerCode },
      },
    });

    if (!influencer || influencer.status === "INACTIVE") {
      return NextResponse.json({
        success: false,
        message: `Influencer not found or inactive: ${influencerCode}`,
      });
    }

    // Find matching campaign (optional)
    let campaignId: string | null = null;
    if (campaignSlug) {
      const campaigns = await prisma.influencerCampaign.findMany({
        where: {
          influencerId: influencer.id,
          organizationId: org.id,
          status: "ACTIVE",
        },
      });
      // Match by slug
      const match = campaigns.find((c) => {
        const slug = c.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 30);
        return slug === campaignSlug;
      });
      if (match) campaignId = match.id;
    }

    // Calculate commission
    const orderValue = Number(order.totalValue);
    const commissionPercent = Number(influencer.commissionPercent);
    const commissionAmount = (orderValue * commissionPercent) / 100;

    // Create InfluencerAttribution
    const attribution = await prisma.influencerAttribution.create({
      data: {
        organizationId: org.id,
        orderId: order.id,
        influencerId: influencer.id,
        campaignId,
        attributedValue: orderValue,
        commissionAmount,
        attributionModel: "LAST_CLICK",
        attributionSource: "UTM",
        touchpoints: touchpoints,
        pixelAttributionId: pixelAttribution.id,
      },
    });

    console.log(
      `[Influencer Attribution] Order ${order.externalId} → Influencer ${influencer.name} (${influencer.code}) | Revenue: $${orderValue} | Commission: $${commissionAmount.toFixed(2)}`
    );

    return NextResponse.json({
      success: true,
      influencerAttributionId: attribution.id,
      influencer: influencer.name,
      commission: commissionAmount,
    });
  } catch (error: any) {
    console.error("[Influencer Attribute POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
