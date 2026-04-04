// ══════════════════════════════════════════════════════════════
// Influencer Attribution Engine
// ══════════════════════════════════════════════════════════════
// Called after a PURCHASE event is attributed by the standard
// pixel attribution engine. Checks if the order came from an
// influencer via:
//   1. UTM tracking (utm_source=inf_*) — PRIORITY
//   2. Coupon code match — FALLBACK if no UTM match
//
// Supports commission tiers: if the influencer has tiers
// configured, the commission % is determined by their monthly
// revenue instead of the flat rate.
//
// This is a lightweight post-process — it reads the existing
// PixelAttribution and does NOT modify any existing data.
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

/**
 * Determine the effective commission % for an influencer.
 * If commission tiers are configured and the influencer's monthly
 * revenue falls into a tier, that tier's % is used. Otherwise,
 * the influencer's base commissionPercent is used.
 */
async function getEffectiveCommission(
  influencerId: string,
  organizationId: string,
  basePercent: number
): Promise<{ percent: number; tierLabel: string | null }> {
  const tiers = await prisma.influencerCommissionTier.findMany({
    where: { influencerId },
    orderBy: { minRevenue: "asc" },
  });

  if (tiers.length === 0) {
    return { percent: basePercent, tierLabel: null };
  }

  // Get current month revenue
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthAgg = await prisma.influencerAttribution.aggregate({
    where: {
      influencerId,
      organizationId,
      createdAt: { gte: startOfMonth },
    },
    _sum: { attributedValue: true },
  });
  const monthRevenue = Number(monthAgg._sum.attributedValue || 0);

  // Find matching tier
  for (const tier of tiers) {
    const min = Number(tier.minRevenue);
    const max = tier.maxRevenue ? Number(tier.maxRevenue) : Infinity;
    if (monthRevenue >= min && monthRevenue < max) {
      return {
        percent: Number(tier.commissionPercent),
        tierLabel: tier.label,
      };
    }
  }

  // If no tier matches (revenue exceeds all tiers), use the highest tier
  const highestTier = tiers[tiers.length - 1];
  return {
    percent: Number(highestTier.commissionPercent),
    tierLabel: highestTier.label,
  };
}

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

  // 2. Get the order (needed for both UTM and coupon paths)
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { totalValue: true, externalId: true, couponCode: true },
  });
  if (!order) {
    return { attributed: false };
  }

  // ──────────────────────────────────────────────────────
  // PATH A: UTM-based attribution (PRIORITY)
  // ──────────────────────────────────────────────────────
  let influencerCode: string | null = null;
  let campaignSlug: string | null = null;
  let attributionSource: "UTM" | "COUPON" = "UTM";
  let touchpoints: any[] | null = null;
  let pixelAttributionId: string | null = null;

  const pixelAttribution = await prisma.pixelAttribution.findFirst({
    where: { orderId, organizationId, model: "LAST_CLICK" },
  });

  if (pixelAttribution) {
    const tps = pixelAttribution.touchpoints as Array<{
      source?: string;
      medium?: string;
      campaign?: string;
      timestamp?: string;
    }>;

    if (tps && Array.isArray(tps)) {
      touchpoints = tps;
      pixelAttributionId = pixelAttribution.id;

      for (const tp of tps) {
        const source = tp.source || "";
        if (source.startsWith("inf_")) {
          influencerCode = source.replace("inf_", "");
          campaignSlug = tp.campaign || null;
          break;
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────
  // PATH B: Coupon-based attribution (FALLBACK)
  // Only if no UTM match was found
  // ──────────────────────────────────────────────────────
  if (!influencerCode && order.couponCode) {
    const couponMatch = await prisma.influencerCoupon.findFirst({
      where: {
        organizationId,
        code: order.couponCode.toUpperCase(),
        isActive: true,
      },
      include: { influencer: { select: { code: true, status: true } } },
    });

    if (couponMatch && couponMatch.influencer.status !== "INACTIVE") {
      influencerCode = couponMatch.influencer.code;
      attributionSource = "COUPON";
      console.log(
        `[Influencer Attribution] Coupon "${order.couponCode}" matched to influencer @${influencerCode}`
      );
    }
  }

  if (!influencerCode) {
    return { attributed: false };
  }

  // 3. Find the influencer
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

  // 4. Find matching campaign (optional, only for UTM path)
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

  // 5. Calculate commission (with tier support)
  const orderValue = Number(order.totalValue);
  const basePercent = Number(influencer.commissionPercent);
  const { percent: effectivePercent, tierLabel } = await getEffectiveCommission(
    influencer.id,
    organizationId,
    basePercent
  );
  const commissionAmount = (orderValue * effectivePercent) / 100;

  // 6. Create attribution record
  await prisma.influencerAttribution.create({
    data: {
      organizationId,
      orderId,
      influencerId: influencer.id,
      campaignId,
      attributedValue: orderValue,
      commissionAmount,
      attributionModel: "LAST_CLICK",
      attributionSource,
      touchpoints: touchpoints || [],
      pixelAttributionId,
    },
  });

  const tierInfo = tierLabel ? ` [Tier: ${tierLabel}]` : "";
  console.log(
    `[Influencer Attribution] Order ${order.externalId} → ${influencer.name} (@${influencer.code}) via ${attributionSource} | $${orderValue} → commission $${commissionAmount.toFixed(2)} (${effectivePercent}%)${tierInfo}`
  );

  return { attributed: true, influencerCode };
}
