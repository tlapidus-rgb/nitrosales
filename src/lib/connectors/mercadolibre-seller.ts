// ══════════════════════════════════════════════════════════════
// MercadoLibre Seller Connector — READ-ONLY seller data access
// ══════════════════════════════════════════════════════════════
// IMPORTANT: All functions in this file are READ-ONLY.
// They NEVER write, update, or delete anything on MercadoLibre.
// This protects the production ML account (ELMUNDODELJUG).
//
// Functions:
//   - getSellerToken(): Get valid token, auto-refresh if expired
//   - fetchSellerListings(): Get all active listings
//   - fetchSellerOrders(): Get recent orders
//   - fetchSellerReputation(): Get reputation metrics
//   - fetchSellerQuestions(): Get buyer questions
//   - fetchSellerShipments(): Get shipment status
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

const ML_API = "https://api.mercadolibre.com";

// ── Token Management ─────────────────────────────────────────

interface MLStoredCredentials {
  appId: string;
  secretKey: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: number;
  mlUserId: number;
}

/**
 * Get a valid ML access token for seller-scoped operations.
 * Auto-refreshes using refresh_token if expired, and persists new tokens to DB.
 *
 * orgId es OBLIGATORIO para multi-tenant safety. Si lo omitís, throw.
 * Cambio Sesión 52 Fase 12: antes hacía findFirst sin orgId (bug CRITICAL
 * cuando hay múltiples orgs con ML conectado).
 */
export async function getSellerToken(
  orgId: string
): Promise<{ token: string; mlUserId: number }> {
  if (!orgId) {
    throw new Error("getSellerToken: orgId es obligatorio (multi-tenant safety)");
  }

  const connection = await prisma.connection.findFirst({
    where: { platform: "MERCADOLIBRE" as any, organizationId: orgId },
  });

  if (!connection) {
    throw new Error(`No MercadoLibre connection found for org ${orgId}`);
  }

  const creds = connection.credentials as unknown as MLStoredCredentials;

  // Token still valid? Return it
  if (creds.accessToken && creds.tokenExpiresAt && Date.now() < creds.tokenExpiresAt - 60000) {
    return { token: creds.accessToken, mlUserId: creds.mlUserId };
  }

  // Token expired — refresh using refresh_token
  if (!creds.refreshToken) {
    throw new Error("ML token expired and no refresh_token available. Re-authorize at /api/auth/mercadolibre/connect");
  }

  console.log("[ML Seller] Token expired, refreshing...");

  const refreshBody = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: creds.appId,
    client_secret: creds.secretKey,
    refresh_token: creds.refreshToken,
  });

  const res = await fetch(`${ML_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: refreshBody.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[ML Seller] Refresh failed:", res.status, errText);
    throw new Error(`ML token refresh failed (${res.status}). Re-authorize at /api/auth/mercadolibre/connect`);
  }

  const data = await res.json();
  const { access_token, refresh_token, expires_in } = data;

  // Persist new tokens to DB
  const newCreds = {
    ...creds,
    accessToken: access_token,
    refreshToken: refresh_token || creds.refreshToken, // ML sends a new refresh_token each time
    tokenExpiresAt: Date.now() + (expires_in * 1000),
  };

  await prisma.connection.update({
    where: { id: connection.id },
    data: {
      credentials: newCreds as any,
      lastSyncAt: new Date(),
    },
  });

  console.log(`[ML Seller] Token refreshed, valid for ${expires_in}s`);
  return { token: access_token, mlUserId: creds.mlUserId };
}

// ── ML API Helper (read-only) ────────────────────────────────

async function mlGet(path: string, token: string): Promise<any> {
  const res = await fetch(`${ML_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ML API GET ${path} failed (${res.status}): ${errText}`);
  }

  return res.json();
}

// ── Listings (Publicaciones) ─────────────────────────────────

/**
 * Fetch listing IDs for the seller by status, then get details in batches.
 * READ-ONLY: Only calls GET endpoints.
 *
 * By default fetches active + paused listings (not closed, which can be 30K+).
 * Use statuses param to control which statuses to fetch.
 */
export async function fetchSellerListings(
  token: string,
  mlUserId: number,
  options: { limit?: number; statuses?: string[] } = {}
): Promise<any[]> {
  const maxItems = options.limit || 10000;
  const statuses = options.statuses || ["active", "paused"]; // Skip 'closed' by default
  const allItems: any[] = [];

  for (const status of statuses) {
    const itemIds = await fetchItemIdsByStatus(token, mlUserId, status, maxItems - allItems.length);
    console.log(`[ML Listings] Status=${status}: ${itemIds.length} items found`);

    // Get item details in batches of 20 (ML multi-get limit)
    for (let i = 0; i < itemIds.length; i += 20) {
      const batch = itemIds.slice(i, i + 20);
      const ids = batch.join(",");
      const data = await mlGet(
        `/items?ids=${ids}&attributes=id,title,status,category_id,price,original_price,currency_id,available_quantity,sold_quantity,listing_type_id,condition,permalink,thumbnail,shipping,catalog_listing,health`,
        token
      );
      for (const item of data) {
        if (item.code === 200 && item.body) {
          allItems.push(item.body);
        }
      }
    }

    if (allItems.length >= maxItems) break;
  }

  console.log(`[ML Listings] Total: ${allItems.length} items fetched`);
  return allItems;
}

/**
 * Fetch item IDs for a specific status using scroll_id for large sets.
 */
async function fetchItemIdsByStatus(
  token: string,
  mlUserId: number,
  status: string,
  maxItems: number
): Promise<string[]> {
  const allIds: string[] = [];
  const batchSize = 50;

  // First try offset-based (works for < 1000 items)
  let offset = 0;
  while (allIds.length < maxItems && offset + batchSize <= 1000) {
    const data = await mlGet(
      `/users/${mlUserId}/items/search?status=${status}&limit=${batchSize}&offset=${offset}`,
      token
    );
    const ids: string[] = data.results || [];
    if (ids.length === 0) break;
    allIds.push(...ids);
    offset += batchSize;
    const total = data.paging?.total || 0;
    if (offset >= total) return allIds; // Got everything
  }

  // If more than 1000 items, switch to scroll_id
  if (allIds.length >= 950) {
    // Reset and use scroll
    allIds.length = 0;
    const scrollData = await mlGet(
      `/users/${mlUserId}/items/search?status=${status}&search_type=scan&limit=${batchSize}`,
      token
    );
    const scrollId = scrollData.scroll_id;
    allIds.push(...(scrollData.results || []));

    while (allIds.length < maxItems && scrollId) {
      const nextData = await mlGet(
        `/users/${mlUserId}/items/search?status=${status}&search_type=scan&scroll_id=${scrollId}&limit=${batchSize}`,
        token
      );
      const ids = nextData.results || [];
      if (ids.length === 0) break;
      allIds.push(...ids);
    }
  }

  return allIds;
}

// ── Orders ───────────────────────────────────────────────────

/**
 * Fetch orders for the seller — paginates through ALL results.
 * READ-ONLY: Only calls GET endpoints.
 * ML hard limit: offset+limit <= 10000 per search query.
 * For more, we split by date ranges.
 */
export async function fetchSellerOrders(
  token: string,
  mlUserId: number,
  options: { dateFrom?: string; maxOrders?: number } = {}
): Promise<any[]> {
  const maxOrders = options.maxOrders || 50000; // Safety cap
  const allOrders: any[] = [];
  const batchSize = 50;

  // Default: last 30 days
  const dateFrom = options.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let offset = 0;
  while (allOrders.length < maxOrders) {
    // ML pagination hard limit: offset + limit <= 10000
    if (offset + batchSize > 10000) {
      console.log(`[ML Orders] Reached ML offset cap at ${allOrders.length} orders`);
      break;
    }

    const data = await mlGet(
      `/orders/search?seller=${mlUserId}&sort=date_desc&limit=${batchSize}&offset=${offset}&order.date_created.from=${dateFrom}`,
      token
    );
    const orders = data.results || [];
    if (orders.length === 0) break;
    allOrders.push(...orders);
    offset += batchSize;

    const total = data.paging?.total || 0;
    if (offset >= total) break;
  }

  console.log(`[ML Orders] Fetched ${allOrders.length} orders total`);
  return allOrders;
}

// ── Reputation ───────────────────────────────────────────────

/**
 * Fetch seller reputation and metrics.
 * READ-ONLY: Only calls GET /users/{id}.
 *
 * Devuelve además los thresholds (umbrales de exclusión) por métrica que
 * MELI expone via metrics.X.exclusion. Son los valores máximos que el
 * seller puede tener antes de bajar de nivel. Vienen "fresh" de MELI en
 * cada llamada, así no dependemos de hardcodear.
 */
export interface MlMetricThreshold {
  rate: number;             // valor actual del seller
  period?: string;          // ej "60 days"
  thresholdPercentage?: number | null;  // umbral max en % (decimal: 0.02 = 2%)
  thresholdFixed?: number | null;       // umbral max en cantidad absoluta
  value?: number;           // cantidad absoluta actual
}

export async function fetchSellerReputation(
  token: string,
  mlUserId: number
): Promise<{
  level: string;
  powerSeller: boolean;
  transactions: { total: number; completed: number; canceled: number };
  ratings: { positive: number; negative: number; neutral: number };
  metrics: {
    claims: MlMetricThreshold;
    delayed: MlMetricThreshold;
    cancellations: MlMetricThreshold;
  };
}> {
  const user = await mlGet(`/users/${mlUserId}`, token);
  const rep = user.seller_reputation || {};
  const transactions = rep.transactions || {};
  const ratings = transactions.ratings || {};
  const metrics = rep.metrics || {};

  // Helper para extraer threshold de cada métrica (claims, delayed, cancellations)
  const buildMetric = (m: any): MlMetricThreshold => ({
    rate: m?.rate || 0,
    period: m?.period,
    value: m?.value,
    thresholdPercentage: m?.exclusion?.percentage ?? null,
    thresholdFixed: m?.exclusion?.fixed ?? null,
  });

  return {
    level: rep.level_id || "unknown",
    powerSeller: !!rep.power_seller_status,
    transactions: {
      total: transactions.total || 0,
      completed: transactions.completed || 0,
      canceled: transactions.canceled || 0,
    },
    ratings: {
      positive: ratings.positive || 0,
      negative: ratings.negative || 0,
      neutral: ratings.neutral || 0,
    },
    metrics: {
      claims: buildMetric(metrics.claims),
      delayed: buildMetric(metrics.delayed_handling_time),
      cancellations: buildMetric(metrics.cancellations),
    },
  };
}

// ── Questions (Preguntas) ────────────────────────────────────

/**
 * Fetch recent questions from buyers.
 * READ-ONLY: Only calls GET endpoints.
 */
export async function fetchSellerQuestions(
  token: string,
  mlUserId: number,
  options: { status?: "UNANSWERED" | "ANSWERED"; limit?: number } = {}
): Promise<any[]> {
  const limit = options.limit || 100;
  const allQuestions: any[] = [];
  let offset = 0;

  const statusFilter = options.status ? `&status=${options.status}` : "";

  while (offset < limit) {
    const batchSize = Math.min(50, limit - offset);
    const data = await mlGet(
      `/my/received_questions/search?seller_id=${mlUserId}&sort_fields=date_created&sort_types=DESC&limit=${batchSize}&offset=${offset}${statusFilter}`,
      token
    );
    const questions = data.questions || [];
    if (questions.length === 0) break;
    allQuestions.push(...questions);
    offset += batchSize;
    if (offset >= (data.total || 0)) break;
  }

  return allQuestions;
}

// ── Shipments ────────────────────────────────────────────────

/**
 * Fetch shipment details for a list of order IDs.
 * READ-ONLY: Only calls GET endpoints.
 */
export async function fetchShipmentForOrder(
  token: string,
  orderId: string
): Promise<any | null> {
  try {
    const data = await mlGet(`/orders/${orderId}/shipments`, token);
    return data;
  } catch {
    return null;
  }
}
