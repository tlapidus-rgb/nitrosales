// ══════════════════════════════════════════════════════════════
// NitroPixel — Meta Conversions API (CAPI)
// ══════════════════════════════════════════════════════════════
// Envía eventos PURCHASE server-side a Meta para:
// 1. Mejorar Event Match Quality (EMQ) → mejor optimización de campañas
// 2. Capturar conversiones que el browser-side pixel pierde (ad blockers, ITP)
// 3. Dedup con el Meta Pixel del browser via event_id
//
// Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
// ══════════════════════════════════════════════════════════════

import { prisma } from '@/lib/db/client';
import crypto from 'crypto';

// ─── Types ───

interface CAPIEventData {
  orderId: string;
  total: number;
  currency: string;
  email?: string;
  phone?: string;
  products?: Array<{ id: string; name: string; price: number; quantity: number }>;
  eventId: string; // For dedup with browser pixel
  sourceUrl?: string;
  userAgent?: string;
  ipAddress?: string;
  fbclid?: string;
  fbc?: string; // _fbc cookie value
  fbp?: string; // _fbp cookie value
}

// ─── Hash helpers (Meta requires SHA256, lowercase, trimmed) ───

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

// ─── Send CAPI event ───

export async function sendCapiPurchase(
  organizationId: string,
  data: CAPIEventData,
  pixelEventId?: string // DB id of the PixelEvent, to mark as capiSent
): Promise<boolean> {
  try {
    // 1. Get Meta credentials from Connection
    const connection = await prisma.connection.findFirst({
      where: {
        organizationId,
        platform: 'META' as any, // Platform enum
        status: 'ACTIVE' as any,
      },
      select: { credentials: true }
    });

    // Resolve credentials: Connection table (multi-tenant) → env vars (single-tenant fallback)
    let pixelId: string | undefined;
    let accessToken: string | undefined;

    if (connection?.credentials) {
      const creds = connection.credentials as Record<string, string>;
      pixelId = creds.pixelId || creds.pixel_id;
      accessToken = creds.accessToken || creds.access_token;
    }

    // Fallback to env vars (for single-tenant deployments like NitroSales)
    if (!pixelId || !accessToken) {
      pixelId = pixelId || process.env.META_PIXEL_ID;
      accessToken = accessToken || process.env.META_ADS_ACCESS_TOKEN;
    }

    if (!pixelId || !accessToken) {
      // Neither Connection nor env vars have credentials — skip silently
      return false;
    }

    // 2. Build the CAPI event payload
    // https://developers.facebook.com/docs/marketing-api/conversions-api/parameters
    const timestamp = Math.floor(Date.now() / 1000);

    // User data — hash PII fields per Meta requirements
    const userData: Record<string, any> = {};
    if (data.email) userData.em = [sha256(data.email)];
    if (data.phone) userData.ph = [sha256(data.phone.replace(/[^0-9]/g, ''))];
    if (data.ipAddress) userData.client_ip_address = data.ipAddress;
    if (data.userAgent) userData.client_user_agent = data.userAgent;
    if (data.fbclid) userData.fbc = data.fbc || `fb.1.${timestamp}.${data.fbclid}`;
    if (data.fbp) userData.fbp = data.fbp;
    // Country hint for Argentina
    userData.country = [sha256('ar')];

    // Custom data — purchase details
    const customData: Record<string, any> = {
      value: data.total,
      currency: data.currency || 'ARS',
      order_id: data.orderId,
    };

    if (data.products && data.products.length > 0) {
      customData.contents = data.products.map(p => ({
        id: p.id,
        quantity: p.quantity,
        item_price: p.price,
      }));
      customData.content_type = 'product';
      customData.num_items = data.products.reduce((sum, p) => sum + p.quantity, 0);
    }

    const eventPayload = {
      data: [{
        event_name: 'Purchase',
        event_time: timestamp,
        event_id: data.eventId, // Dedup key with browser Meta Pixel
        event_source_url: data.sourceUrl || undefined,
        action_source: 'website',
        user_data: userData,
        custom_data: customData,
      }],
    };

    // 3. Send to Meta CAPI endpoint
    const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventPayload),
      signal: AbortSignal.timeout(5000), // 5s timeout — don't block event processing
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown');
      console.error(`[NitroPixel CAPI] Meta API error ${response.status}: ${errorBody}`);
      return false;
    }

    const result = await response.json();
    console.log(`[NitroPixel CAPI] Purchase sent for order ${data.orderId}: events_received=${result.events_received}`);

    // 4. Mark the PixelEvent as capiSent
    if (pixelEventId) {
      await prisma.pixelEvent.update({
        where: { id: pixelEventId },
        data: { capiSent: true, capiSentAt: new Date() }
      }).catch(() => {}); // Non-fatal
    }

    return true;
  } catch (error) {
    // CAPI failure must NEVER break event processing
    console.error('[NitroPixel CAPI] Error sending to Meta:', error);
    return false;
  }
}
