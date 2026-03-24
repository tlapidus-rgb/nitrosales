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
    const userAgent = request.headers.get('user-agent') || '';

    // 5. Procesar cada evento
    for (const event of events) {
      try {
        if (!event.visitor_id || !event.session_id || !event.type) continue;

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
        });

        if (!visitor) continue;

        // Handle IDENTIFY events specially
        if (event.type === 'IDENTIFY' && event.props?.email) {
          await identifyVisitor(orgId, event.visitor_id, {
            email: event.props.email as string
          });
          continue; // IDENTIFY no se guarda como PixelEvent
        }

        // ─── PURCHASE dedup by orderId ───
        // Client-side may fire PURCHASE from dataLayer + orderPlacedAPI.
        // Server-side webhook also creates PURCHASE events.
        // Dedup by orderId to prevent double-counting.
        if (event.type === 'PURCHASE' && event.props?.orderId) {
          const orderId = String(event.props.orderId);
          const existing = await prisma.pixelEvent.findFirst({
            where: {
              organizationId: orgId,
              type: 'PURCHASE',
              props: { path: ['orderId'], equals: orderId }
            }
          });
          if (existing) {
            console.log(`[NitroPixel] Skipping duplicate PURCHASE for order ${orderId}`);
            continue;
          }
        }

        // ─── PURCHASE: also trigger attribution calculation ───
        if (event.type === 'PURCHASE' && event.props?.orderId) {
          try {
            const orderId = String(event.props.orderId);
            // Find matching order in database (created by webhook)
            const order = await prisma.order.findFirst({
              where: {
                organizationId: orgId,
                externalId: { contains: orderId.replace(/-\d+$/, '') } // Handle VTEX order suffixes
              }
            });
            if (order) {
              // Import and run attribution
              const { calculateAttribution } = await import('@/lib/pixel/attribution');
              await calculateAttribution(order.id, visitor.id, orgId);
              console.log(`[NitroPixel] Client-side attribution for order ${orderId} visitor ${visitor.visitorId}`);
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
        await prisma.pixelEvent.create({
          data: {
            type: event.type,
            sessionId: event.session_id,
            pageUrl: event.page_url || undefined,
            referrer: event.referrer || undefined,
            props: event.props || undefined,
            clickIds: event.click_ids || undefined,
            utmParams: event.utm_params || undefined,
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
