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
  viewThrough?: string; // "possible_view_through:meta+google" — ad spend detected near organic visit
}

// ─── Referrer-based source detection ───
// Reduces false "direct" by classifying organic, social, and referral traffic.
// Only used when there are NO click IDs or UTM params (i.e. unpaid traffic).

const REFERRER_RULES: Array<{ pattern: RegExp; source: string; medium: string }> = [
  // Search engines → organic
  { pattern: /google\.\w+/, source: 'google', medium: 'organic' },
  { pattern: /bing\.com/, source: 'bing', medium: 'organic' },
  { pattern: /yahoo\.com/, source: 'yahoo', medium: 'organic' },
  { pattern: /duckduckgo\.com/, source: 'duckduckgo', medium: 'organic' },
  { pattern: /baidu\.com/, source: 'baidu', medium: 'organic' },
  // Social → social organic
  { pattern: /facebook\.com|fb\.com/, source: 'meta', medium: 'social' },
  { pattern: /instagram\.com/, source: 'meta', medium: 'social' },
  { pattern: /l\.instagram\.com/, source: 'meta', medium: 'social' },
  { pattern: /tiktok\.com/, source: 'tiktok', medium: 'social' },
  { pattern: /twitter\.com|x\.com|t\.co/, source: 'twitter', medium: 'social' },
  { pattern: /linkedin\.com|lnkd\.in/, source: 'linkedin', medium: 'social' },
  { pattern: /youtube\.com|youtu\.be/, source: 'youtube', medium: 'social' },
  { pattern: /pinterest\.com/, source: 'pinterest', medium: 'social' },
  // Messaging → referral
  { pattern: /whatsapp\.com|wa\.me/, source: 'whatsapp', medium: 'referral' },
  { pattern: /t\.me|telegram\.org/, source: 'telegram', medium: 'referral' },
  // Marketplaces (Argentina) → referral
  { pattern: /mercadolibre\.com/, source: 'mercadolibre', medium: 'referral' },
  // Email providers → email
  { pattern: /mail\.google\.com|gmail\.com/, source: 'gmail', medium: 'email' },
  { pattern: /outlook\.com|hotmail\.com/, source: 'outlook', medium: 'email' },
];

function detectSourceFromReferrer(referrer: string | null | undefined): { source: string; medium: string } | null {
  if (!referrer) return null;
  try {
    const hostname = new URL(referrer).hostname.toLowerCase();
    for (const rule of REFERRER_RULES) {
      if (rule.pattern.test(hostname)) {
        return { source: rule.source, medium: rule.medium };
      }
    }
    // Unknown external referrer → generic referral
    if (hostname && hostname.length > 0) {
      return { source: hostname.replace(/^www\./, ''), medium: 'referral' };
    }
  } catch { /* invalid URL, ignore */ }
  return null;
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

    // 2. Read org settings for attribution window (default: 30 days)
    //    Clients can configure 7, 14, 30, or 60 day windows via settings.attributionWindowDays
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true }
    });
    const orgSettings = (org?.settings as Record<string, any>) || {};
    const VALID_WINDOWS = [7, 14, 30, 60];
    const windowDays = VALID_WINDOWS.includes(orgSettings.attributionWindowDays)
      ? orgSettings.attributionWindowDays
      : 30;

    // 3. Get all events from this visitor within the attribution window
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);

    const events = await prisma.pixelEvent.findMany({
      where: {
        visitorId,
        organizationId,
        timestamp: { gte: windowStart },
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
        referrer: true,
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

    // If no touchpoints with attribution signal, try referrer-based detection.
    // Before defaulting to "direct", check if any PAGE_VIEW has a known referrer.
    if (touchpoints.length === 0) {
      // Try to find a PAGE_VIEW with a classified referrer
      let referrerSource: { source: string; medium: string } | null = null;
      for (const ev of events) {
        if (ev.type === 'PAGE_VIEW' && ev.referrer) {
          referrerSource = detectSourceFromReferrer(ev.referrer);
          if (referrerSource) break;
        }
      }

      const fallbackSource = referrerSource?.source || 'direct';
      const fallbackMedium = referrerSource?.medium || undefined;

      // ── View-through detection ──
      // If the first visit is organic/direct but ad platforms had active spend
      // around that time, flag as potential view-through (user saw ad, didn't click,
      // but later searched/visited directly). This is metadata only — doesn't change
      // attribution calculations, but gives visibility into assisted conversions.
      let viewThroughSignal: string | undefined;
      if ((fallbackSource === 'google' && fallbackMedium === 'organic') || fallbackSource === 'direct') {
        try {
          const firstEventTime = events[0].timestamp;
          const vtWindowStart = new Date(firstEventTime.getTime() - 24 * 60 * 60 * 1000); // 24h before first visit
          const activeAdSpend = await prisma.$queryRaw`
            SELECT LOWER(platform::text) as platform, SUM(spend)::float as spend
            FROM ad_metrics_daily
            WHERE "organizationId" = ${organizationId}
              AND date >= ${vtWindowStart}::date
              AND date <= ${firstEventTime}::date
              AND spend > 0
            GROUP BY 1
          ` as Array<{ platform: string; spend: number }>;

          if (activeAdSpend.length > 0) {
            // There was active ad spend within 24h before this organic/direct visit
            const platforms = activeAdSpend.map(a => a.platform).join('+');
            viewThroughSignal = `possible_view_through:${platforms}`;
          }
        } catch { /* Non-fatal: view-through detection is optional metadata */ }
      }

      const firstEvent = events[0];
      const lastEvent = events[events.length - 1];
      touchpoints.push({
        timestamp: firstEvent.timestamp.toISOString(),
        source: fallbackSource,
        medium: fallbackMedium,
        page: firstEvent.pageUrl || undefined,
        eventId: firstEvent.id,
        ...(viewThroughSignal && { viewThrough: viewThroughSignal }),
      });
      if (firstEvent.id !== lastEvent.id) {
        touchpoints.push({
          timestamp: lastEvent.timestamp.toISOString(),
          source: fallbackSource,
          medium: fallbackMedium,
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

    console.log(`[NitroPixel] Attribution calculated for order ${orderId}: ${touchpoints.length} touchpoints, lag ${conversionLag}d, window ${windowDays}d, campaign ${matchedCampaignId || 'none'}`);
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
