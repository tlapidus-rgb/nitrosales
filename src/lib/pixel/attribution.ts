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

/**
 * Extract the canonical domain from a hostname (strips www. and trailing dots).
 * e.g. "www.elmundodeljuguete.com.ar." → "elmundodeljuguete.com.ar"
 */
function canonicalDomain(hostname: string): string {
  return hostname.replace(/^www\./, '').replace(/\.$/, '').toLowerCase();
}

/**
 * Detect source/medium from a referrer URL.
 * Returns null for self-referrals (referrer matches the store's own domain).
 * @param storeDomains - Set of canonical domains belonging to this store
 */
function detectSourceFromReferrer(
  referrer: string | null | undefined,
  storeDomains?: Set<string>
): { source: string; medium: string } | null {
  if (!referrer) return null;
  try {
    const hostname = new URL(referrer).hostname.toLowerCase();
    const canonical = canonicalDomain(hostname);

    // Self-referral filter: if the referrer is the store itself, treat as no referrer (→ direct)
    if (storeDomains && storeDomains.has(canonical)) {
      return null;
    }

    for (const rule of REFERRER_RULES) {
      if (rule.pattern.test(hostname)) {
        return { source: rule.source, medium: rule.medium };
      }
    }
    // Unknown external referrer → generic referral
    if (hostname && hostname.length > 0) {
      return { source: canonical, medium: 'referral' };
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
        sessionId: true,
        timestamp: true,
        clickIds: true,
        utmParams: true,
        pageUrl: true,
        referrer: true,
        props: true, // Contains _signals_fresh and _is_landing flags
      }
    });

    if (events.length === 0) return;

    // ─── Build store domain set for self-referral filtering ───
    // Extract the store's own domain(s) from pageUrl of its events.
    // This avoids needing manual config — the pixel events tell us the domain.
    const storeDomains = new Set<string>();
    for (const event of events) {
      if (event.pageUrl) {
        try {
          const host = new URL(event.pageUrl).hostname.toLowerCase();
          storeDomains.add(canonicalDomain(host));
        } catch { /* skip malformed URLs */ }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // SESSION-BASED TOUCHPOINT ENGINE (v2)
    // ══════════════════════════════════════════════════════════════
    // The key insight: ONE touchpoint per session, not per event.
    //
    // Previous logic counted every event with click IDs as a touchpoint,
    // which caused 3 critical problems:
    // 1. Cookie contamination: stale click IDs from old sessions made
    //    organic/direct visits look like paid traffic
    // 2. Touchpoint inflation: 10 page views in one session = 10 identical
    //    touchpoints instead of 1
    // 3. Invisible organic visits: referrer detection never ran because
    //    stale cookie signals already generated touchpoints
    //
    // New logic: Group events by session → detect source per session →
    // deduplicate consecutive identical sources → one touchpoint per
    // unique channel interaction.
    // ══════════════════════════════════════════════════════════════

    const NON_TOUCHPOINT_TYPES = new Set([
      'PURCHASE', 'IDENTIFY', 'DEBUG_NO_PURCHASE', 'CUSTOM'
    ]);

    // Step 1: Group events by session
    // Events without sessionId are grouped by day to prevent unrelated events
    // from merging into a single artificial session (CRITICAL: avoids misattribution)
    const sessionMap = new Map<string, typeof events>();
    for (const event of events) {
      if (NON_TOUCHPOINT_TYPES.has(event.type)) continue;
      const sid = event.sessionId
        || `_unknown_${Math.floor(event.timestamp.getTime() / (24 * 60 * 60 * 1000))}`;
      if (!sessionMap.has(sid)) sessionMap.set(sid, []);
      sessionMap.get(sid)!.push(event);
    }

    // Step 2: Determine the source for each session
    interface SessionSource {
      timestamp: Date;
      source: string;
      medium?: string;
      campaign?: string;
      clickId?: string;
      clickType?: string;
      page?: string;
      eventId: string;
      viewThrough?: string;
      confidence: 'fresh_click' | 'fresh_utm' | 'referrer' | 'stale_cookie' | 'direct';
    }

    const sessionSources: SessionSource[] = [];

    for (const [_sid, sessionEvents] of sessionMap) {
      // Sort by timestamp (should already be sorted, but be safe)
      sessionEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const firstEvent = sessionEvents[0];
      const props = (firstEvent.props as Record<string, any>) || {};
      const isLanding = props._is_landing === true;

      // Find the landing event (first event with _is_landing=true, or just firstEvent)
      // The landing event has the most reliable referrer for this session
      let landingEvent = firstEvent;
      if (!isLanding) {
        for (const ev of sessionEvents) {
          const evProps = (ev.props as Record<string, any>) || {};
          if (evProps._is_landing === true) {
            landingEvent = ev;
            break;
          }
        }
      }

      const clicks = (landingEvent.clickIds as Record<string, string>) || {};
      const utms = (landingEvent.utmParams as Record<string, string>) || {};

      // BACKWARD COMPAT: Pre-deployment events have _signals_fresh=undefined.
      // We treat undefined as "assume fresh" if click IDs exist, because old events
      // were captured before we started tracking freshness — safer to attribute than lose.
      // Explicitly false means the pixel KNOWS they're stale (post-deployment).
      const signalsFreshRaw = props._signals_fresh; // true | false | undefined
      const signalsFresh = signalsFreshRaw === true
        || (signalsFreshRaw === undefined && Object.keys(clicks).length > 0);
      const hasClicks = Object.keys(clicks).length > 0;
      const hasUtms = !!utms.source;

      // Determine click type from click IDs
      let clickId: string | undefined;
      let clickType: string | undefined;
      if (clicks.fbclid) { clickId = clicks.fbclid; clickType = 'fbclid'; }
      else if (clicks.gclid) { clickId = clicks.gclid; clickType = 'gclid'; }
      else if (clicks.ttclid) { clickId = clicks.ttclid; clickType = 'ttclid'; }
      else if (clicks.li_fat_id) { clickId = clicks.li_fat_id; clickType = 'li_fat_id'; }
      else if (clicks.msclkid) { clickId = clicks.msclkid; clickType = 'msclkid'; }

      // Priority-based source detection:
      // 1. FRESH click IDs from URL → paid click (highest confidence)
      // 2. FRESH UTMs from URL → tracked campaign
      // 3. Referrer on landing event → organic/social/referral
      // 4. Stale click IDs from cookie → previous campaign (low confidence)
      // 5. Direct (no signal at all)

      let source: string | undefined;
      let medium: string | undefined;
      let campaign: string | undefined;
      let confidence: SessionSource['confidence'];

      if (signalsFresh && hasClicks) {
        // Fresh paid click — highest quality touchpoint
        source = utms.source || (clickType === 'fbclid' ? 'meta' : clickType === 'gclid' ? 'google' : clickType === 'ttclid' ? 'tiktok' : clickType === 'li_fat_id' ? 'linkedin' : clickType === 'msclkid' ? 'microsoft' : undefined);
        medium = utms.medium || 'cpc';
        campaign = utms.campaign;
        confidence = 'fresh_click';
      } else if (signalsFresh && hasUtms) {
        // Fresh UTMs without click ID (e.g., email campaign, WhatsApp link with UTMs)
        source = utms.source;
        medium = utms.medium;
        campaign = utms.campaign;
        confidence = 'fresh_utm';
      } else {
        // No fresh signals — try referrer, then stale cookies, then direct
        // Use landingEvent referrer (most reliable for this session)
        const referrerSource = landingEvent.referrer
          ? detectSourceFromReferrer(landingEvent.referrer, storeDomains)
          : null;

        // Also check if ANY event in this session has a usable referrer (landing page might not)
        let sessionReferrerSource = referrerSource;
        if (!sessionReferrerSource) {
          for (const ev of sessionEvents) {
            if (ev.referrer) {
              sessionReferrerSource = detectSourceFromReferrer(ev.referrer, storeDomains);
              if (sessionReferrerSource) break;
            }
          }
        }

        if (sessionReferrerSource) {
          // Referrer detected — this is organic, social, or referral traffic
          // BUT: if we also have stale click IDs AND the referrer is a generic referral
          // (not a known search engine or social platform), prefer the click IDs.
          // This prevents internal redirects or unknown referrers from overriding paid attribution.
          const isKnownExternalSource = ['google', 'bing', 'yahoo', 'duckduckgo', 'baidu',
            'meta', 'tiktok', 'twitter', 'linkedin', 'youtube', 'pinterest',
            'whatsapp', 'telegram', 'mercadolibre', 'gmail', 'outlook'].includes(sessionReferrerSource.source);

          if (hasClicks && !isKnownExternalSource) {
            // Stale click IDs + unknown referrer → prefer click IDs (likely internal redirect)
            source = utms.source || (clickType === 'fbclid' ? 'meta' : clickType === 'gclid' ? 'google' : undefined);
            medium = utms.medium || 'cpc';
            campaign = utms.campaign;
            confidence = 'stale_cookie';
          } else {
            source = sessionReferrerSource.source;
            medium = sessionReferrerSource.medium;
            confidence = 'referrer';
            // Only clear click IDs for known external sources (not stale cookies)
            clickId = undefined;
            clickType = undefined;
          }
        } else if (hasClicks && !signalsFresh) {
          // Stale click IDs from cookie — low confidence, previous campaign
          source = utms.source || (clickType === 'fbclid' ? 'meta' : clickType === 'gclid' ? 'google' : undefined);
          medium = utms.medium || 'cpc';
          campaign = utms.campaign;
          confidence = 'stale_cookie';
        } else {
          // No signals at all — direct traffic
          source = 'direct';
          confidence = 'direct';
        }
      }

      sessionSources.push({
        timestamp: landingEvent.timestamp,
        source: source || 'direct',
        medium,
        campaign,
        clickId: confidence === 'referrer' ? undefined : clickId, // Don't carry stale clickIds into referrer touchpoints
        clickType: confidence === 'referrer' ? undefined : clickType,
        page: landingEvent.pageUrl || undefined,
        eventId: landingEvent.id,
        confidence,
      });
    }

    // Step 3: Sort sessions chronologically
    sessionSources.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Step 4: Deduplicate consecutive sessions with same source+medium+campaign+clickId
    // Only deduplicates STALE cookie sessions (same cookies carried over).
    // Fresh clicks with different click IDs = different ad interactions = separate touchpoints.
    const touchpoints: Touchpoint[] = [];
    let prevKey = '';

    for (const session of sessionSources) {
      const key = `${session.source}|${session.medium || ''}|${session.campaign || ''}|${session.clickId || ''}`;

      if (key === prevKey && session.confidence === 'stale_cookie') {
        // Skip: same source as previous session AND it's from stale cookies
        // This prevents "returning to the same campaign" from inflating touchpoints
        continue;
      }

      // Different source/medium/campaign, or same but with fresh signals = new touchpoint
      touchpoints.push({
        timestamp: session.timestamp.toISOString(),
        source: session.source,
        medium: session.medium,
        campaign: session.campaign,
        clickId: session.clickId,
        clickType: session.clickType,
        page: session.page,
        eventId: session.eventId,
        viewThrough: session.viewThrough,
      });

      prevKey = key;
    }

    // Step 5: View-through detection for organic/direct touchpoints
    // If the ONLY touchpoints are organic/direct but ads were running, flag it
    if (touchpoints.length > 0) {
      const hasOnlyOrganicOrDirect = touchpoints.every(
        tp => tp.source === 'direct' || tp.medium === 'organic' || tp.medium === 'social' || tp.medium === 'referral'
      );
      if (hasOnlyOrganicOrDirect) {
        try {
          const firstTime = new Date(touchpoints[0].timestamp);
          const vtWindowStart = new Date(firstTime.getTime() - 24 * 60 * 60 * 1000);
          const activeAdSpend = await prisma.$queryRaw`
            SELECT LOWER(platform::text) as platform, SUM(spend)::float as spend
            FROM ad_metrics_daily
            WHERE "organizationId" = ${organizationId}
              AND date >= ${vtWindowStart}::date
              AND date <= ${firstTime}::date
              AND spend > 0
            GROUP BY 1
          ` as Array<{ platform: string; spend: number }>;

          if (activeAdSpend.length > 0) {
            const platforms = activeAdSpend.map(a => a.platform).join('+');
            touchpoints[0].viewThrough = `possible_view_through:${platforms}`;
          }
        } catch { /* Non-fatal */ }
      }
    }

    // Step 6: Fallback — if still no touchpoints (all events were non-touchpoint types)
    if (touchpoints.length === 0) {
      const firstEvent = events[0];
      const referrerSource = firstEvent.referrer
        ? detectSourceFromReferrer(firstEvent.referrer, storeDomains) : null;
      touchpoints.push({
        timestamp: firstEvent.timestamp.toISOString(),
        source: referrerSource?.source || 'direct',
        medium: referrerSource?.medium,
        page: firstEvent.pageUrl || undefined,
        eventId: firstEvent.id,
      });
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
