// ══════════════════════════════════════════════════════════════
// NitroPixel — Google Ads Offline Conversion Upload
// ══════════════════════════════════════════════════════════════
// Sends PURCHASE conversions to Google Ads via Offline Conversion
// Upload API for Enhanced Conversions. Requires:
// 1. Active GOOGLE_ADS connection with valid OAuth credentials
// 2. gclid captured from visitor's click (stored in pixel_events.clickIds)
// 3. Conversion action ID configured in connection credentials
//
// Pattern: fire-and-forget, same as Meta CAPI
// Docs: https://developers.google.com/google-ads/api/docs/conversions/upload-clicks
// ══════════════════════════════════════════════════════════════

import { prisma } from '@/lib/db/client';

// ─── Types ───

interface GoogleConversionData {
  gclid: string;
  orderId: string;
  total: number;
  currency: string;
  conversionDateTime?: string; // ISO format, defaults to now
  email?: string; // For Enhanced Conversions
}

// ─── Send conversion to Google Ads ───

export async function sendGoogleConversion(
  organizationId: string,
  data: GoogleConversionData,
  pixelEventId?: string
): Promise<boolean> {
  try {
    // 1. Get Google Ads credentials from Connection table
    const connection = await prisma.connection.findFirst({
      where: {
        organizationId,
        platform: 'GOOGLE_ADS' as any,
        status: 'ACTIVE' as any,
      },
      select: { credentials: true }
    });

    if (!connection?.credentials) {
      // No active Google Ads connection — skip silently
      return false;
    }

    const creds = connection.credentials as Record<string, string>;
    const accessToken = creds.accessToken || creds.access_token;
    const customerId = creds.customerId || creds.customer_id;
    const conversionActionId = creds.conversionActionId || creds.conversion_action_id;

    if (!accessToken || !customerId || !conversionActionId) {
      // Missing required credentials — skip silently
      return false;
    }

    // 2. Build the conversion payload
    // https://developers.google.com/google-ads/api/rest/reference/rest/v17/customers/uploadClickConversions
    const conversionDateTime = data.conversionDateTime ||
      new Date().toISOString().replace('T', ' ').replace('Z', '+00:00');

    const conversionPayload = {
      conversions: [{
        gclid: data.gclid,
        conversionAction: `customers/${customerId}/conversionActions/${conversionActionId}`,
        conversionDateTime,
        conversionValue: data.total,
        currencyCode: data.currency || 'ARS',
        orderId: data.orderId,
      }],
      partialFailure: true,
    };

    // 3. Send to Google Ads API
    const url = `https://googleads.googleapis.com/v17/customers/${customerId}:uploadClickConversions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': creds.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
        ...(creds.loginCustomerId && { 'login-customer-id': creds.loginCustomerId }),
      },
      body: JSON.stringify(conversionPayload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown');
      console.error(`[NitroPixel GoogleAds] API error ${response.status}: ${errorBody}`);
      return false;
    }

    const result = await response.json();
    const hasErrors = result.partialFailureError?.details?.length > 0;
    if (hasErrors) {
      console.error(`[NitroPixel GoogleAds] Partial failure for order ${data.orderId}:`, JSON.stringify(result.partialFailureError));
      return false;
    }

    console.log(`[NitroPixel GoogleAds] Conversion sent for order ${data.orderId} (gclid: ${data.gclid.slice(0, 10)}...)`);

    // 4. Mark event as sent (reuse capiSent fields or add separate tracking)
    if (pixelEventId) {
      await prisma.pixelEvent.update({
        where: { id: pixelEventId },
        data: {
          props: {
            path: ['_googleAdsSent'],
            set: true,
          } as any,
        }
      }).catch(() => {}); // Non-fatal
    }

    return true;
  } catch (error) {
    // Google Ads failure must NEVER break event processing
    console.error('[NitroPixel GoogleAds] Error sending conversion:', error);
    return false;
  }
}
