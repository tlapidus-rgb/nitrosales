// ══════════════════════════════════════════════════════════════
// NitroPixel — Attribution Engine
// ══════════════════════════════════════════════════════════════
// Calcula atribucion de orders a campanas de ads.
// Cruza click IDs del pixel (fbclid, gclid) con campanas existentes.
// Soporta 4 modelos: LAST_CLICK, FIRST_CLICK, LINEAR, NITRO.

import { prisma } from '@/lib/db/client';

// ─── Types ───

interface Touchpoint {
  timestamp: string;
  source?: string;
  medium?: string;
  campaign?: string;
  clickId?: string;
  clickType?: string; // fbclid, gclid, ttclid
  page?: string;
  eventId: string;
}

// ─── Calculate Attribution ───

export async function calculateAttribution(
  orderId: string,
  visitorId: string,
  organizationId: string
): Promise<void> {
  try {
    // 1. Get the order
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, totalValue: true, orderDate: true }
    });
    if (!order) return;

    // 2. Get all events from this visitor in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const events = await prisma.pixelEvent.findMany({
      where: {
        visitorId,
        organizationId,
        timestamp: { gte: thirtyDaysAgo },
        type: { not: 'IDENTIFY' } // Skip identify events
      },
      orderBy: { timestamp: 'asc' },
      select: {
        id: true,
        type: true,
        timestamp: true,
        clickIds: true,
        utmParams: true,
        pageUrl: true,
      }
    });

    if (events.length === 0) return;

    // 3. Build touchpoints from events that have attribution signals
    //    IMPORTANT: Only events with click IDs or UTM source count as touchpoints.
    //    PURCHASE, IDENTIFY, and DEBUG events are NEVER touchpoints — they are
    //    conversion/identification events, not traffic sources.
    //    Without this filter, checkout pages that lose cookies across domains
    //    (e.g. VTEX checkout on different subdomain) create false "direct" touchpoints.
    const touchpoints: Touchpoint[] = [];
    const NON_TOUCHPOINT_TYPES = new Set([
      'PURCHASE', 'IDENTIFY', 'DEBUG_NO_PURCHASE', 'CUSTOM'
    ]);

    for (const event of events) {
      // Skip event types that are never traffic touchpoints
      if (NON_TOUCHPOINT_TYPES.has(event.type)) continue;

      const clicks = (event.clickIds as Record<string, string>) || {};
      const utms = (event.utmParams as Record<string, string>) || {};

      // Only count as touchpoint if there's a click ID or UTM source
      const hasSignal = Object.keys(clicks).length > 0 || utms.source;
      if (!hasSignal) continue; // Skip any event without attribution signals

      // Determine click type
      let clickId: string | undefined;
      let clickType: string | undefined;
      if (clicks.fbclid) { clickId = clicks.fbclid; clickType = 'fbclid'; }
      else if (clicks.gclid) { clickId = clicks.gclid; clickType = 'gclid'; }
      else if (clicks.ttclid) { clickId = clicks.ttclid; clickType = 'ttclid'; }

      touchpoints.push({
        timestamp: event.timestamp.toISOString(),
        source: utms.source || (clickType === 'fbclid' ? 'meta' : clickType === 'gclid' ? 'google' : undefined),
        medium: utms.medium || (clickId ? 'cpc' : undefined),
        campaign: utms.campaign,
        clickId,
        clickType,
        page: event.pageUrl || undefined,
        eventId: event.id,
      });
    }

    // If no touchpoints with attribution signal, use first and last page view
    if (touchpoints.length === 0) {
      const firstEvent = events[0];
      const lastEvent = events[events.length - 1];
      touchpoints.push({
        timestamp: firstEvent.timestamp.toISOString(),
        source: 'direct',
        page: firstEvent.pageUrl || undefined,
        eventId: firstEvent.id,
      });
      if (firstEvent.id !== lastEvent.id) {
        touchpoints.push({
          timestamp: lastEvent.timestamp.toISOString(),
          source: 'direct',
          page: lastEvent.pageUrl || undefined,
          eventId: lastEvent.id,
        });
      }
    }

    // 4. Try to match click IDs with campaigns
    let matchedCampaignId: string | null = null;
    let matchedCreativeId: string | null = null;

    // For now, match by UTM campaign name → AdCampaign name
    // In the future, we'll match fbclid → specific ad via Meta API
    const campaignNames = touchpoints
      .map(t => t.campaign)
      .filter(Boolean) as string[];

    if (campaignNames.length > 0) {
      const campaign = await prisma.adCampaign.findFirst({
        where: {
          organizationId,
          name: { in: campaignNames, mode: 'insensitive' }
        }
      });
      if (campaign) matchedCampaignId = campaign.id;
    }

    // 5. Calculate conversion lag
    const firstTouchDate = new Date(touchpoints[0].timestamp);
    const orderDate = order.orderDate;
    const conversionLag = Math.floor(
      (orderDate.getTime() - firstTouchDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const totalValue = Number(order.totalValue);

    // 6. Create attributions for each model
    const models = [
      { model: 'LAST_CLICK' as const, calc: calcLastClick },
      { model: 'FIRST_CLICK' as const, calc: calcFirstClick },
      { model: 'LINEAR' as const, calc: calcLinear },
      { model: 'NITRO' as const, calc: calcNitro },
    ];

    for (const { model, calc } of models) {
      const value = calc(touchpoints, totalValue);

      await prisma.pixelAttribution.upsert({
        where: {
          orderId_model: { orderId, model }
        },
        create: {
          model,
          touchpoints: touchpoints as any,
          touchpointCount: touchpoints.length,
          attributedValue: value,
          conversionLag,
          orderId,
          visitorId,
          campaignId: matchedCampaignId,
          creativeId: matchedCreativeId,
          organizationId,
        },
        update: {
          touchpoints: touchpoints as any,
          touchpointCount: touchpoints.length,
          attributedValue: value,
          conversionLag,
          campaignId: matchedCampaignId,
          creativeId: matchedCreativeId,
        }
      });
    }

    console.log(`[NitroPixel] Attribution calculated for order ${orderId}: ${touchpoints.length} touchpoints, lag ${conversionLag}d, campaign ${matchedCampaignId || 'none'}`);
  } catch (error) {
    console.error('[NitroPixel] Error calculating attribution:', error);
    // NO re-throw — atribucion fallida no debe romper nada
  }
}

// ─── Attribution Models ───

function calcLastClick(touchpoints: Touchpoint[], totalValue: number): number {
  // 100% credit to the last touchpoint
  return totalValue;
}

function calcFirstClick(touchpoints: Touchpoint[], totalValue: number): number {
  // 100% credit to the first touchpoint
  return totalValue;
}

function calcLinear(touchpoints: Touchpoint[], totalValue: number): number {
  // Equal credit split across all touchpoints
  // We store full value but the interpretation is value / touchpointCount
  return totalValue;
}

function calcNitro(touchpoints: Touchpoint[], totalValue: number): number {
  // NitroAttribution: weighted model
  // First touch: 30%, Last touch: 40%, Middle: 30% split
  // For attribution record, we store full value
  // The actual weight per touchpoint is calculated at query time
  return totalValue;
}
