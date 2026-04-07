// ══════════════════════════════════════════════════════════════
// NitroPixel — Meta Conversions API (CAPI)
// ══════════════════════════════════════════════════════════════
// Envía eventos server-side a Meta para:
// 1. Mejorar Event Match Quality (EMQ) → mejor optimización de campañas
// 2. Capturar conversiones que el browser-side pixel pierde (ad blockers, ITP)
// 3. Dedup con el Meta Pixel del browser via event_id
//
// Supported events: Purchase, ViewContent, AddToCart, InitiateCheckout
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
  fbc?: string; // _fbc cookie value (REAL — never fabricated)
  fbp?: string; // _fbp cookie value (REAL)
  externalId?: string; // Stable first-party id (visitorId or customerId) — boosts EMQ
  countryCode?: string; // ISO-2, e.g. 'ar', 'br'. Defaults to 'ar' (org-aware later).
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
    // EMQ best practice: include as many identifiers as possible.
    // CRITICAL: never fabricate fbc — only send real _fbc cookie value.
    const userData: Record<string, any> = {};
    if (data.email) userData.em = [sha256(data.email)];
    if (data.phone) userData.ph = [sha256(data.phone.replace(/[^0-9]/g, ''))];
    if (data.ipAddress) userData.client_ip_address = data.ipAddress;
    if (data.userAgent) userData.client_user_agent = data.userAgent;
    if (data.fbc) userData.fbc = data.fbc; // REAL value only — never fabricate
    if (data.fbp) userData.fbp = data.fbp;
    if (data.externalId) userData.external_id = [sha256(data.externalId)]; // Stable first-party id boosts EMQ
    // Country hint — defaults to 'ar' until org-level country lookup is wired
    userData.country = [sha256((data.countryCode || 'ar').toLowerCase())];

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

// ─── Generic CAPI Event Sender (Full-Funnel) ───
// Supports ViewContent, AddToCart, InitiateCheckout, Purchase
// sendCapiPurchase remains the primary Purchase sender (backward compat)

type CAPIEventName = 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase';

interface CAPIGenericData {
  eventId: string;
  sourceUrl?: string;
  userAgent?: string;
  ipAddress?: string;
  email?: string;
  phone?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  externalId?: string; // Stable first-party id (visitorId or customerId) — boosts EMQ
  countryCode?: string; // ISO-2, defaults to 'ar'
  // Product data (ViewContent, AddToCart)
  productId?: string;
  productName?: string;
  productPrice?: number;
  category?: string;
  // Cart/Checkout data
  value?: number;
  currency?: string;
  numItems?: number;
  // Purchase data (use sendCapiPurchase for purchases instead)
  orderId?: string;
  products?: Array<{ id: string; name: string; price: number; quantity: number }>;
}

async function resolveMetaCredentials(organizationId: string): Promise<{ pixelId: string; accessToken: string } | null> {
  const connection = await prisma.connection.findFirst({
    where: {
      organizationId,
      platform: 'META' as any,
      status: 'ACTIVE' as any,
    },
    select: { credentials: true }
  });

  let pixelId: string | undefined;
  let accessToken: string | undefined;

  if (connection?.credentials) {
    const creds = connection.credentials as Record<string, string>;
    pixelId = creds.pixelId || creds.pixel_id;
    accessToken = creds.accessToken || creds.access_token;
  }

  if (!pixelId || !accessToken) {
    pixelId = pixelId || process.env.META_PIXEL_ID;
    accessToken = accessToken || process.env.META_ADS_ACCESS_TOKEN;
  }

  if (!pixelId || !accessToken) return null;
  return { pixelId, accessToken };
}

function buildUserData(data: CAPIGenericData): Record<string, any> {
  // EMQ best practice (Meta): include as many real identifiers as possible.
  // CRITICAL: never fabricate fbc — only send the real _fbc cookie value.
  const userData: Record<string, any> = {};
  if (data.email) userData.em = [sha256(data.email)];
  if (data.phone) userData.ph = [sha256(data.phone.replace(/[^0-9]/g, ''))];
  if (data.ipAddress) userData.client_ip_address = data.ipAddress;
  if (data.userAgent) userData.client_user_agent = data.userAgent;
  if (data.fbc) userData.fbc = data.fbc; // REAL value only
  if (data.fbp) userData.fbp = data.fbp;
  if (data.externalId) userData.external_id = [sha256(data.externalId)];
  userData.country = [sha256((data.countryCode || 'ar').toLowerCase())];
  return userData;
}

function buildCustomData(eventName: CAPIEventName, data: CAPIGenericData): Record<string, any> {
  const customData: Record<string, any> = {};

  switch (eventName) {
    case 'ViewContent':
      if (data.productId) customData.content_ids = [data.productId];
      if (data.productName) customData.content_name = data.productName;
      if (data.productPrice) customData.value = data.productPrice;
      if (data.category) customData.content_category = data.category;
      customData.content_type = 'product';
      customData.currency = data.currency || 'ARS';
      break;

    case 'AddToCart':
      if (data.productId) customData.content_ids = [data.productId];
      if (data.productName) customData.content_name = data.productName;
      customData.content_type = 'product';
      customData.value = data.productPrice || data.value || 0;
      customData.currency = data.currency || 'ARS';
      break;

    case 'InitiateCheckout':
      if (data.value) customData.value = data.value;
      if (data.numItems) customData.num_items = data.numItems;
      customData.currency = data.currency || 'ARS';
      break;

    case 'Purchase':
      customData.value = data.value || 0;
      customData.currency = data.currency || 'ARS';
      if (data.orderId) customData.order_id = data.orderId;
      if (data.products && data.products.length > 0) {
        customData.contents = data.products.map(p => ({
          id: p.id, quantity: p.quantity, item_price: p.price,
        }));
        customData.content_type = 'product';
        customData.num_items = data.products.reduce((sum, p) => sum + p.quantity, 0);
      }
      break;
  }

  return customData;
}

export async function sendCapiEvent(
  organizationId: string,
  eventName: CAPIEventName,
  data: CAPIGenericData,
  pixelEventId?: string
): Promise<boolean> {
  try {
    const creds = await resolveMetaCredentials(organizationId);
    if (!creds) return false;

    const timestamp = Math.floor(Date.now() / 1000);
    const userData = buildUserData(data);
    const customData = buildCustomData(eventName, data);

    const eventPayload = {
      data: [{
        event_name: eventName,
        event_time: timestamp,
        event_id: data.eventId,
        event_source_url: data.sourceUrl || undefined,
        action_source: 'website' as const,
        user_data: userData,
        custom_data: customData,
      }],
    };

    const url = `https://graph.facebook.com/v21.0/${creds.pixelId}/events?access_token=${creds.accessToken}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventPayload),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown');
      console.error(`[NitroPixel CAPI] ${eventName} error ${response.status}: ${errorBody}`);
      return false;
    }

    const result = await response.json();
    console.log(`[NitroPixel CAPI] ${eventName} sent: events_received=${result.events_received}`);

    // Mark the PixelEvent as capiSent
    if (pixelEventId) {
      await prisma.pixelEvent.update({
        where: { id: pixelEventId },
        data: { capiSent: true, capiSentAt: new Date() }
      }).catch(() => {});
    }

    return true;
  } catch (error) {
    console.error(`[NitroPixel CAPI] Error sending ${eventName} to Meta:`, error);
    return false;
  }
}
