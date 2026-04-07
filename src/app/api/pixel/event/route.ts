export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// NitroPixel — Event Receiver
// ══════════════════════════════════════════════════════════════
// Recibe eventos del snippet JS del pixel.
// POST /api/pixel/event
// Response: 204 No Content (siempre, incluso si hay error)
//
// SEGURIDAD: Este endpoint NUNCA rompe la tienda del cliente.
// Si falla internamente, loguea y devuelve 204 igual.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { findOrCreateVisitor, identifyVisitor, hashIP } from '@/lib/pixel/identity';

// ─── Types ───

interface PixelEventPayload {
  type: string;       // PAGE_VIEW, ADD_TO_CART, PURCHASE, VIEW_PRODUCT, IDENTIFY, CUSTOM
  props?: Record<string, unknown>;
  visitor_id: string;
  session_id: string;
  click_ids?: Record<string, string>;
  utm_params?: Record<string, string>;
  meta_fbc?: string | null; // Real _fbc cookie value (Meta EMQ best practice — never fabricate)
  meta_fbp?: string | null; // Real _fbp cookie value
  signals_fresh?: boolean; // TRUE = click IDs/UTMs from current URL, FALSE = from cookie
  is_landing?: boolean;    // TRUE = first event of a new session (session entry point)
  timestamp: number;  // Unix ms del cliente
  page_url?: string;
  referrer?: string;
  device_type?: string;
}

// ─── Simple in-memory rate limiter ───

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // events per second per org
const RATE_WINDOW = 1000; // ms

function isRateLimited(orgId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(orgId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(orgId, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT;
}

// ─── PAGE_VIEW dedup (prevents inflation from double GTM loads) ───
// Key: "sessionId|pageUrl" → timestamp. Discard if same key within 2 seconds.
// Map auto-cleans entries older than 10 seconds to prevent memory growth.

const recentPageViews = new Map<string, number>();
const PV_DEDUP_WINDOW = 2000; // ms
const PV_CLEANUP_INTERVAL = 10000; // ms

function isDuplicatePageView(sessionId: string, pageUrl: string): boolean {
  const key = `${sessionId}|${pageUrl}`;
  const now = Date.now();
  const lastSeen = recentPageViews.get(key);
  if (lastSeen && (now - lastSeen) < PV_DEDUP_WINDOW) {
    return true; // Duplicate — discard
  }
  recentPageViews.set(key, now);
  // Lazy cleanup: remove stale entries every ~100 calls
  if (recentPageViews.size > 500) {
    for (const [k, ts] of recentPageViews) {
      if (now - ts > PV_CLEANUP_INTERVAL) recentPageViews.delete(k);
    }
  }
  return false;
}

// ─── Bot detection by User-Agent ───
// Filters crawlers, scrapers, and monitoring bots that inflate metrics.
// Conservative list: only well-known bots to avoid false positives.

// IMPORTANT: Do NOT add "whatsapp" here — WhatsApp in-app browser includes "WhatsApp"
// in its User-Agent and blocking it would silently drop all WhatsApp traffic (huge in LATAM).
// facebookexternalhit already covers Meta's link preview bot separately.
// Similarly, do NOT add "telegram" — only "telegrambot" matches the bot, not the in-app browser.
const BOT_PATTERNS = /bot|crawl|spider|slurp|facebookexternalhit|bingpreview|googlebot|yandex|baidu|duckduckbot|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|applebot|twitterbot|linkedinbot|telegrambot|pingdom|uptimerobot|statuspage|headlesschrome|phantomjs|lighthouse|pagespeed/i;

function isBot(ua: string): boolean {
  if (!ua || ua.length < 10) return true; // Empty or suspicious UA
  return BOT_PATTERNS.test(ua);
}

// ─── Device type from User-Agent ───

function detectDevice(ua: string): string {
  if (!ua) return 'unknown';
  const lower = ua.toLowerCase();
  if (lower.includes('mobile') || lower.includes('android') || lower.includes('iphone')) return 'mobile';
  if (lower.includes('tablet') || lower.includes('ipad')) return 'tablet';
  return 'desktop';
}

// ─── POST handler ───

export async function POST(request: NextRequest) {
  try {
    // 1. Org ID del header O query param (sendBeacon no puede setear headers)
    const orgId = request.headers.get('x-np-org') || request.nextUrl.searchParams.get('org');
    if (!orgId) {
      return new NextResponse(null, { status: 204 });
    }

    // 2. Rate limit
    if (isRateLimited(orgId)) {
      return new NextResponse(null, { status: 204 });
    }

    // 2b. Bot filtering — discard crawlers/scrapers silently
    const userAgentEarly = request.headers.get('user-agent') || '';
    if (isBot(userAgentEarly)) {
      return new NextResponse(null, { status: 204 });
    }

    // 3. Parse body — MUST use request.text() + JSON.parse()
    // sendBeacon envía con Content-Type: text/plain para evitar CORS preflight.
    // request.json() puede fallar silenciosamente con text/plain en algunos runtimes.
    // Esto causaba que TODOS los eventos del pixel se descartaran sin log.
    let body: { events: PixelEventPayload[] };
    try {
      const rawText = await request.text();
      if (!rawText || rawText.trim() === '') {
        console.warn('[NitroPixel] Empty body received');
        return new NextResponse(null, { status: 204 });
      }
      body = JSON.parse(rawText);
    } catch (parseError) {
      console.error('[NitroPixel] Failed to parse event body:', parseError);
      return new NextResponse(null, { status: 204 });
    }

    if (!body.events || !Array.isArray(body.events) || body.events.length === 0) {
      console.warn('[NitroPixel] No events array in body or empty array');
      return new NextResponse(null, { status: 204 });
    }

    // Log event batch receipt for debugging
    const eventTypes = body.events.map(e => e.type).join(',');
    console.log(`[NitroPixel] Received ${body.events.length} events [${eventTypes}] from org ${orgId}`);

    // Limitar a 10 eventos por request (prevenir abuse)
    const events = body.events.slice(0, 10);

    // 4. Metadata del request
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               request.headers.get('x-real-ip') || '';
    const ipHashed = ip ? hashIP(ip) : undefined;
    const country = request.headers.get('x-vercel-ip-country') || undefined;
    const region = request.headers.get('x-vercel-ip-country-region') || undefined;
    const userAgent = userAgentEarly; // Already captured above for bot check

    // 5. Procesar cada evento
    for (const event of events) {
      try {
        if (!event.visitor_id || !event.session_id || !event.type) continue;

        // Dedup PAGE_VIEW: discard if same session+page within 2 seconds (double GTM load)
        if (event.type === 'PAGE_VIEW' && event.page_url) {
          if (isDuplicatePageView(event.session_id, event.page_url)) {
            continue;
          }
        }

        const deviceType = event.device_type || detectDevice(userAgent);

        // Find or create visitor
        const visitor = await findOrCreateVisitor(orgId, event.visitor_id, {
          sessionId: event.session_id,
          deviceType,
          country,
          region,
          clickIds: event.click_ids,
          utmParams: event.utm_params,
          pageUrl: event.page_url,
          metaFbc: event.meta_fbc || null,
          metaFbp: event.meta_fbp || null,
        });

        if (!visitor) continue;

        // ── Store browser fingerprint (data-only, never used for merge) ──
        // The fingerprint is generated client-side and sent as _fp in props.
        // We store it on the visitor record for future cross-session analysis.
        if (event.props?._fp && typeof event.props._fp === 'string') {
          try {
            await prisma.$executeRawUnsafe(
              'UPDATE pixel_visitors SET "fingerprintHash" = $1 WHERE id = $2 AND "fingerprintHash" IS NULL',
              event.props._fp,
              visitor.id
            );
          } catch (_fpErr) {
            // Non-fatal — fingerprint storage is optional
          }
        }

        // Handle IDENTIFY events: identify visitor AND persist event for funnel tracking
        if (event.type === 'IDENTIFY' && (event.props?.email || event.props?.phone)) {
          await identifyVisitor(orgId, event.visitor_id, {
            email: event.props.email as string | undefined,
            phone: event.props.phone as string | undefined,
          });
          // NOTE: Do NOT continue — let the event be saved as PixelEvent below
          // so the dashboard can count identified visitors via event type queries.
          // PII is stripped from props before persistence.
          event.props = { identified: true };
        }

        // ─── PURCHASE dedup + reconciliation ───
        // Client-side may fire PURCHASE from dataLayer + orderPlacedAPI.
        // Server-side webhook also creates PURCHASE events.
        //
        // CRITICAL FIX: OrderId format mismatch between browser and webhook.
        // Browser sends: "1619951503020" (from dataLayer/orderPlaced URL)
        // Webhook stores: "1619951503020-01" (VTEX format with suffix)
        // Old code used exact match → 0% overlap → duplicate events everywhere.
        //
        // New logic:
        // 1. Normalize orderId by stripping VTEX suffix for comparison
        // 2. If webhook PURCHASE already exists → DON'T skip!
        //    Instead, MERGE: update the webhook event to link to this browser visitor
        //    (browser visitor has real click IDs and tracking data)
        // 3. Re-trigger attribution with the real browser visitor
        if (event.type === 'PURCHASE' && event.props?.orderId) {
          const rawOrderId = String(event.props.orderId);
          const orderIdBase = rawOrderId.replace(/-\d+$/, ''); // Strip VTEX suffix

          // Search with string_contains to match both formats
          const existing = await prisma.pixelEvent.findFirst({
            where: {
              organizationId: orgId,
              type: 'PURCHASE',
              props: { path: ['orderId'], string_contains: orderIdBase }
            }
          });

          if (existing) {
            const existingSource = (existing.props as any)?.source;

            // Case A: Exact same event from same visitor → true duplicate, skip
            if (existing.visitorId === visitor.id) {
              console.log(`[NitroPixel] Skipping true duplicate PURCHASE for order ${rawOrderId}`);
              continue;
            }

            // Case B: Webhook event exists, browser visitor arrives → MERGE
            // The browser visitor has real tracking data (click IDs, UTMs, referrer).
            // The webhook visitor was matched heuristically (checkout page, email, etc).
            // Browser data is MORE RELIABLE for attribution → re-link.
            if (existingSource === 'webhook') {
              console.log(`[NitroPixel] RECONCILIATION: Browser PURCHASE for order ${rawOrderId} found webhook event. Merging visitor ${visitor.visitorId} → replacing webhook visitor ${existing.visitorId}`);

              // Update the webhook event to point to the browser visitor
              await prisma.pixelEvent.update({
                where: { id: existing.id },
                data: {
                  visitorId: visitor.id,
                  props: {
                    ...(existing.props as any || {}),
                    _reconciled: true,
                    _reconciledAt: new Date().toISOString(),
                    _originalVisitorId: existing.visitorId,
                    _reconciledFrom: 'browser-merge',
                  }
                }
              });

              // Re-trigger attribution with the real browser visitor
              try {
                const order = await prisma.order.findFirst({
                  where: {
                    organizationId: orgId,
                    externalId: { contains: orderIdBase }
                  }
                });
                if (order) {
                  const { calculateAttribution } = await import('@/lib/pixel/attribution');
                  await calculateAttribution(order.id, visitor.id, orgId);
                  console.log(`[NitroPixel] RECONCILIATION: Re-attributed order ${rawOrderId} to browser visitor ${visitor.visitorId}`);
                }
              } catch (reconAttrError) {
                console.error('[NitroPixel] Reconciliation attribution error (non-fatal):', reconAttrError);
              }

              continue; // Don't create a new event — we updated the existing one
            }

            // Case C: Browser duplicate from same client (dataLayer + orderPlacedAPI both fired)
            console.log(`[NitroPixel] Skipping duplicate PURCHASE for order ${rawOrderId} (source: ${existingSource})`);
            continue;
          }
        }

        // ─── PURCHASE: trigger attribution calculation ───
        if (event.type === 'PURCHASE' && event.props?.orderId) {
          try {
            const rawOrderId = String(event.props.orderId);
            const orderIdBase = rawOrderId.replace(/-\d+$/, '');
            // Find matching order in database (created by webhook)
            const order = await prisma.order.findFirst({
              where: {
                organizationId: orgId,
                externalId: { contains: orderIdBase }
              }
            });
            if (order) {
              // Import and run attribution
              const { calculateAttribution } = await import('@/lib/pixel/attribution');
              await calculateAttribution(order.id, visitor.id, orgId);
              console.log(`[NitroPixel] Client-side attribution for order ${rawOrderId} visitor ${visitor.visitorId}`);

              // ── Influencer attribution (non-blocking, fire-and-forget) ──
              try {
                const { attributeOrderToInfluencer } = await import('@/lib/pixel/influencer-attribution');
                attributeOrderToInfluencer(order.id, orgId).catch((e: unknown) =>
                  console.error('[NitroPixel] Influencer attribution error:', e)
                );
              } catch {
                // Module not found or import error — non-fatal
              }
            }
          } catch (attrError) {
            console.error('[NitroPixel] Attribution error (non-fatal):', attrError);
          }
        }

        // Generate CAPI event ID for purchase events (for dedup with Meta Pixel)
        const capiEventId = event.type === 'PURCHASE'
          ? `np_${event.visitor_id.slice(0, 8)}_${Date.now()}`
          : undefined;

        // Log PURCHASE events for visibility (critical for debugging)
        if (event.type === 'PURCHASE') {
          console.log(`[NitroPixel] PURCHASE event received: orderId=${event.props?.orderId}, visitor=${event.visitor_id}, source=${event.props?.source}`);
        }

        // Create the event
        // Merge signals_fresh and is_landing into props to avoid schema migration
        // These flags are critical for accurate multi-touch attribution:
        // - signals_fresh: distinguishes paid clicks from stale cookie data
        // - is_landing: marks session entry points for session-level touchpoint dedup
        const enrichedProps = {
          ...(event.props || {}),
          ...(event.signals_fresh !== undefined && { _signals_fresh: event.signals_fresh }),
          ...(event.is_landing !== undefined && { _is_landing: event.is_landing }),
        };

        const createdEvent = await prisma.pixelEvent.create({
          data: {
            type: event.type,
            sessionId: event.session_id,
            pageUrl: event.page_url || undefined,
            referrer: event.referrer || undefined,
            props: Object.keys(enrichedProps).length > 0 ? enrichedProps : undefined,
            clickIds: event.click_ids || undefined,
            utmParams: event.utm_params || undefined,
            metaFbc: event.meta_fbc || undefined,
            metaFbp: event.meta_fbp || undefined,
            deviceType,
            country,
            region,
            ipHash: ipHashed,
            userAgent: userAgent.slice(0, 500),
            timestamp: new Date(event.timestamp),
            capiEventId,
            visitorId: visitor.id,
            organizationId: orgId,
          }
        });

        // ─── CAPI: Send PURCHASE to Meta Conversions API (non-blocking) ───
        if (event.type === 'PURCHASE' && capiEventId) {
          try {
            const { sendCapiPurchase } = await import('@/lib/pixel/capi');
            // Fire-and-forget: don't await, don't block the response
            sendCapiPurchase(orgId, {
              orderId: String(event.props?.orderId || ''),
              total: Number(event.props?.total || 0),
              currency: String(event.props?.currency || 'ARS'),
              email: event.props?.email as string | undefined,
              products: event.props?.products as any[] | undefined,
              eventId: capiEventId,
              sourceUrl: event.page_url,
              userAgent,
              ipAddress: ip,
              fbclid: event.click_ids?.fbclid,
              fbc: event.meta_fbc || undefined,
              fbp: event.meta_fbp || undefined,
              externalId: visitor.id,
            }, createdEvent.id).catch(err => {
              console.error('[NitroPixel CAPI] Non-fatal error:', err);
            });
          } catch (capiErr) {
            // CAPI import/call failure is non-fatal
            console.error('[NitroPixel CAPI] Import error:', capiErr);
          }
        }

        // ─── CAPI: Send funnel events to Meta (non-blocking, fire-and-forget) ───
        // ViewContent, AddToCart, InitiateCheckout → improves Meta's funnel optimization
        const CAPI_FUNNEL_EVENTS: Record<string, 'ViewContent' | 'AddToCart' | 'InitiateCheckout'> = {
          'VIEW_CONTENT': 'ViewContent',
          'VIEW_PRODUCT': 'ViewContent',   // Alias used in our pixel
          'ADD_TO_CART': 'AddToCart',
          'CHECKOUT_SHIPPING': 'InitiateCheckout',  // First checkout step = InitiateCheckout for Meta
          'INITIATE_CHECKOUT': 'InitiateCheckout',
        };
        const capiEventName = CAPI_FUNNEL_EVENTS[event.type];
        if (capiEventName && createdEvent) {
          try {
            const { sendCapiEvent } = await import('@/lib/pixel/capi');
            sendCapiEvent(orgId, capiEventName, {
              eventId: `${event.type}_${createdEvent.id}`,
              sourceUrl: event.page_url,
              userAgent,
              ipAddress: ip,
              email: visitor?.email || (event.props?.email as string | undefined),
              fbclid: event.click_ids?.fbclid,
              fbc: event.meta_fbc || undefined,
              fbp: event.meta_fbp || undefined,
              externalId: visitor?.id,
              productId: event.props?.product_id as string | undefined,
              productName: event.props?.product_name as string | undefined,
              productPrice: event.props?.price ? Number(event.props.price) : undefined,
              category: event.props?.category as string | undefined,
            }, createdEvent.id).catch(err => {
              console.error(`[NitroPixel CAPI] ${capiEventName} non-fatal error:`, err);
            });
          } catch (capiFunnelErr) {
            console.error('[NitroPixel CAPI] Funnel import error:', capiFunnelErr);
          }
        }

        // ─── Google Ads: Send PURCHASE conversion (non-blocking, fire-and-forget) ───
        // Only fires when gclid is present (visitor came from Google Ads)
        if (event.type === 'PURCHASE' && event.click_ids?.gclid && createdEvent) {
          try {
            const { sendGoogleConversion } = await import('@/lib/pixel/google-ads');
            sendGoogleConversion(orgId, {
              gclid: event.click_ids.gclid,
              orderId: String(event.props?.orderId || ''),
              total: Number(event.props?.total || 0),
              currency: String(event.props?.currency || 'ARS'),
              email: visitor?.email || (event.props?.email as string | undefined),
            }, createdEvent.id).catch(err => {
              console.error('[NitroPixel GoogleAds] Non-fatal error:', err);
            });
          } catch (googleErr) {
            console.error('[NitroPixel GoogleAds] Import error:', googleErr);
          }
        }
      } catch (eventError) {
        // Error en un evento individual no rompe los demas
        console.error('[NitroPixel] Error processing event:', event.type, eventError);
      }
    }

    // 6. SIEMPRE 204, sin importar que paso internamente
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-np-org',
      }
    });
  } catch (error) {
    // Error general — logueamos pero NUNCA devolvemos error al cliente
    console.error('[NitroPixel] Fatal error in event receiver:', error);
    return new NextResponse(null, { status: 204 });
  }
}

// ─── OPTIONS handler (CORS preflight) ───

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-np-org',
      'Access-Control-Max-Age': '86400',
    }
  });
}
