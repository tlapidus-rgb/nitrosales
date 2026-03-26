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
  // Social → social organic (separated by platform for clarity)
  { pattern: /l\.instagram\.com/, source: 'instagram', medium: 'social' },
  { pattern: /instagram\.com/, source: 'instagram', medium: 'social' },
  { pattern: /facebook\.com|fb\.com|m\.facebook\.com/, source: 'facebook', medium: 'social' },
  { pattern: /threads\.com/, source: 'threads', medium: 'social' },
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

    const primaryEvents = await prisma.pixelEvent.findMany({
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
        ipHash: true,
      }
    });

    if (primaryEvents.length === 0) return;

    // ─── IP+UA Identity Merging (Triple Whale Identity Graph approach) ───
    // Find other visitors sharing the same IP hash (same device, different cookies).
    // This recovers cross-session journeys: e.g., Meta ad click → later Google purchase.
    // 99.3% of IP+UA combos are unique to a single visitor, so false positive rate is <1%.
    const visitorIpHashes = new Set<string>();
    for (const ev of primaryEvents) {
      const ipHash = (ev as any).ipHash;
      if (ipHash && ev.sessionId && !ev.sessionId.startsWith('webhook-')) {
        visitorIpHashes.add(ipHash);
      }
    }

    let events = primaryEvents;

    if (visitorIpHashes.size > 0) {
      try {
        // Find other visitors sharing the same IP(s)
        const relatedEvents = await prisma.pixelEvent.findMany({
          where: {
            organizationId,
            ipHash: { in: Array.from(visitorIpHashes) },
            visitorId: { not: visitorId },
            timestamp: { gte: windowStart },
            type: { not: 'IDENTIFY' },
            sessionId: { not: { startsWith: 'webhook-' } },
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
            props: true,
            ipHash: true,
          }
        });

        if (relatedEvents.length > 0) {
          // Merge events from all related visitors, sorted by timestamp
          events = [...primaryEvents, ...relatedEvents].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
        }
      } catch (ipMergeError) {
        // Non-fatal: fall back to primary events only
        console.error('[NitroPixel] IP+UA merge error (non-fatal):', ipMergeError);
      }
    }

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

    // Step 1: Group events by session, with sub-session splitting
    // When a user clicks a new ad within the same browser session (session cookie
    // didn't reset), the click IDs change mid-session. We detect this and split
    // into sub-sessions so each ad click becomes its own touchpoint.
    // This handles historical data where the pixel didn't force session resets.
    const sessionMap = new Map<string, typeof events>();

    // Helper: extract the "click signature" from an event
    const clickSig = (ev: typeof events[0]): string => {
      const c = (ev.clickIds as Record<string, string>) || {};
      const u = (ev.utmParams as Record<string, string>) || {};
      // Key: which platform click + which source/campaign
      const cid = c.fbclid || c.gclid || c.ttclid || c.li_fat_id || c.msclkid || '';
      return `${cid}|${u.source || ''}|${u.campaign || ''}`;
    };

    for (const event of events) {
      if (NON_TOUCHPOINT_TYPES.has(event.type)) continue;
      if (event.sessionId?.startsWith('webhook-')) continue;
      const baseSid = event.sessionId
        || `_unknown_${Math.floor(event.timestamp.getTime() / (24 * 60 * 60 * 1000))}`;

      // For the first event in a session, just add it normally
      if (!sessionMap.has(baseSid)) {
        sessionMap.set(baseSid, [event]);
        continue;
      }

      const currentEvents = sessionMap.get(baseSid)!;
      const lastEvent = currentEvents[currentEvents.length - 1];
      const lastSig = clickSig(lastEvent);
      const thisSig = clickSig(event);

      // If click signature changed AND the new event has fresh signals,
      // split into a new sub-session
      const evProps = (event.props as Record<string, any>) || {};
      const evClicks = (event.clickIds as Record<string, string>) || {};
      const hasNewClicks = Object.keys(evClicks).some(k => evClicks[k]);
      const isFresh = evProps._signals_fresh === true
        || (evProps._signals_fresh === undefined && hasNewClicks);

      if (thisSig !== lastSig && isFresh && hasNewClicks) {
        // New ad click within same session → create sub-session
        const subSid = `${baseSid}_sub_${sessionMap.size}`;
        sessionMap.set(subSid, [event]);
        // Mark this event as a landing for the new sub-session
        if (!evProps._is_landing) {
          (event as any).props = { ...evProps, _is_landing: true };
        }
      } else {
        currentEvents.push(event);
      }
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
            'meta', 'facebook', 'instagram', 'threads', 'tiktok', 'twitter', 'linkedin', 'youtube', 'pinterest',
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

      // Normalize common source aliases for consistency
      const normalizedSource = (source || 'direct').replace(/^ig$/, 'instagram');

      sessionSources.push({
        timestamp: landingEvent.timestamp,
        source: normalizedSource,
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

    // Step 4: Deduplicate consecutive sessions at SOURCE+MEDIUM level
    // A new touchpoint is created only when the SOURCE or MEDIUM changes.
    // Multiple clicks on the same platform (e.g., 5 different Google Ads with
    // different gclids) are collapsed into a single touchpoint because for
    // attribution purposes, what matters is "user engaged with Google Ads",
    // not which specific ad variant they clicked.
    // This matches how Triple Whale and other attribution tools summarize
    // the customer journey at the channel level.
    const touchpoints: Touchpoint[] = [];
    let prevSourceKey = '';

    for (const session of sessionSources) {
      // Dedup key: source + medium only (campaign and clickId are details, not channel changes)
      const sourceKey = `${session.source}|${session.medium || ''}`;

      if (sourceKey === prevSourceKey) {
        // Same channel as previous touchpoint (e.g., consecutive Google cpc sessions).
        // Skip — user is re-engaging with the same channel.
        continue;
      }

      // Different channel = new touchpoint (e.g., Google cpc → Meta social-paid)
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

      prevSourceKey = sourceKey;
    }

    // Step 4b: Remove "checkout-only" touchpoints that have no attribution signal.
    // These appear when a visitor's only tracked page is /checkout/... with no UTMs or referrer.
    // They produce noisy "direct /checkout" entries with zero insight value.
    // Keep them only if they're the ONLY touchpoint (better than nothing).
    if (touchpoints.length > 1) {
      const filtered = touchpoints.filter(tp => {
        if (!tp.page) return true;
        const isCheckoutOnly = /\/checkout\//i.test(tp.page) && tp.source === 'direct' && !tp.campaign && !tp.clickId;
        return !isCheckoutOnly;
      });
      if (filtered.length > 0) {
        touchpoints.length = 0;
        touchpoints.push(...filtered);
      }
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

    // 5. Calculate conversion lag (days between first touch and order)
    // Clamped to >= 0: negative values happen when the pixel event fires
    // slightly after VTEX records the order (same-session timing difference).
    const firstTouchDate = new Date(touchpoints[0].timestamp);
    const orderDate = order.orderDate;
    const conversionLag = Math.max(0, Math.floor(
      (orderDate.getTime() - firstTouchDate.getTime()) / (1000 * 60 * 60 * 24)
    ));

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
