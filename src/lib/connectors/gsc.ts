// ══════════════════════════════════════════════
// Conector de Google Search Console
// ══════════════════════════════════════════════
// Usa la Search Console API para traer keywords,
// posiciones, impresiones y CTR orgánico.
// Reutiliza la misma Service Account de GA4.

import * as crypto from "crypto";

// ── JWT Auth (mismo patrón que sync/ga4) ──

function createJWT(serviceAccount: { client_email: string; private_key: string }) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claim = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })).toString("base64url");

  const signInput = header + "." + claim;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = sign.sign(serviceAccount.private_key, "base64url");

  return signInput + "." + signature;
}

export async function getGSCAccessToken(serviceAccount: { client_email: string; private_key: string }) {
  const jwt = createJWT(serviceAccount);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt,
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error("GSC auth failed: " + JSON.stringify(data));
  }
  return data.access_token as string;
}

// ── Search Analytics API ──

export interface GSCRow {
  keys: string[];  // [date, query, page, device, country]
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCResponse {
  rows?: GSCRow[];
  responseAggregationType?: string;
}

/**
 * Fetch search analytics data from Google Search Console.
 *
 * @param accessToken - OAuth access token
 * @param siteUrl - The site URL registered in GSC (e.g., "https://www.elmundodeljuguete.com.ar/")
 * @param startDate - Start date "YYYY-MM-DD"
 * @param endDate - End date "YYYY-MM-DD"
 * @param startRow - For pagination (GSC returns max 25,000 rows per request)
 */
export async function fetchSearchAnalytics(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  startRow: number = 0,
): Promise<GSCRow[]> {
  const encodedUrl = encodeURIComponent(siteUrl);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedUrl}/searchAnalytics/query`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ["date", "query", "page", "device", "country"],
      rowLimit: 25000,
      startRow,
      type: "web",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GSC API error ${res.status}: ${errText.substring(0, 500)}`);
  }

  const data: GSCResponse = await res.json();
  return data.rows || [];
}

/**
 * Fetch all rows (handles pagination if > 25,000 rows)
 */
export async function fetchAllSearchAnalytics(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GSCRow[]> {
  const allRows: GSCRow[] = [];
  let startRow = 0;

  while (true) {
    const rows = await fetchSearchAnalytics(accessToken, siteUrl, startDate, endDate, startRow);
    allRows.push(...rows);
    if (rows.length < 25000) break; // No more pages
    startRow += 25000;
  }

  return allRows;
}
