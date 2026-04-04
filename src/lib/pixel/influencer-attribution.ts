// ══════════════════════════════════════════════════════════════
// Influencer Attribution Engine
// ══════════════════════════════════════════════════════════════
// Called after a PURCHASE event is attributed by the standard
// pixel attribution engine. Checks if the order came from an
// influencer (utm_source=inf_*) and creates an
// InfluencerAttribution record.
//
// This is a lightweight post-process — it reads the existing
// PixelAttribution and does NOT modify any existing data.
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

export async function attributeOrderToInfluencer(
  orderId: string,
  organizationId: string
): Promise<{ attributed: boolean; influencerCode?: string }> {
  // 1. Check if already attributed to an influencer
  const existing = await prisma.influencerAttribution.findFirst({
    where: { orderId, organizationId },
  });
  if (existing) {
    return { attributed: true, influencerCode: undefined };
  }

  // 2. Get the LAST_CLICK pixel attribution
  const pixelAttribution = await prisma.pixelAttribution.findFirst({
    where: { orderId, organizationId, model: "LAST_CLICK" },
  });
  if (!pixelAttribution) {
    return { attributed: false };
  }

  // 3. Parse touchpoints to find influencer UTM
  const touchpoints = pixelAttribution.touchpoints as Array<{
    source?: string;
    medium?: string;
    campaign?: string;
    timestamp?: string;
  }>;

  if (!touchpoints || !Array.isArray(touchpoints)) {
    return { attributed: false };
  }

  let influencerCode: string | null = null;
  let campaignSlug: string | null = null;

  for (const tp of touchpoints) {
    const source = tp.source || "";
    if (source.startsWith("inf_")) {
      influencerCode = source.replace("inf_", "");
      campaignSlug = tp.campaign || null;
      break;
    }
  }

  if (!influencerCode) {
    return { attributed: false };
  }

  // 4. Find the influencer
  const influencer = await prisma.influencer.findUnique({
    where: {
      organizationId_code: { organizationId, code: influencerCode },
    },
  });

  if (!influencer || influencer.status === "INACTIVE") {
    console.log(
      `[Influencer Attribution] Code "${influencerCode}" not found or inactive for org ${organizationId}`
    );
    return { attributed: false, influencerCode };
  }

  // 5. Get order value
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { totalValue: true, externalId: true },
  });

  if (!order) {
    return { attributed: false, influencerCode };
  }

  // 6. Find matching campaign (optional)
  let campaignId: string | null = null;
  if (campaignSlug) {
    const campaigns = await prisma.influencerCampaign.findMany({
      where: {
        influencerId: influencer.id,
        organizationId,
        status: "ACTIVE",
      },
    });
    const match = campaigns.find((c) => {
      const slug = c.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 30);
      return slug === campaignSlug;
    });
    if (match) campaignId = match.id;
  }

  // 7. Calculate commission
  const orderValue = Number(order.totalValue);
  const commissionPercent = Number(influencer.commissionPercent);
  const commissionAmount = (orderValue * commissionPercent) / 100;

  // 8. Create attribution record
  await prisma.influencerAttribution.create({
    data: {
      organizationId,
      orderId,
      influencerId: influencer.id,
      campaignId,
      attributedValue: orderValue,
      commissionAmount,
      attributionModel: "LAST_CLICK",
      attributionSource: "UTM",
      touchpoints,
      pixelAttributionId: pixelAttribution.id,
    },
  });

  console.log(
    `[Influencer Attribution] Order ${order.externalId} → ${influencer.name} (@${influencer.code}) | $${orderValue} → commission $${commissionAmount.toFixed(2)} (${commissionPercent}%)`
  );

  return { attributed: true, influencerCode };
}
