// ══════════════════════════════════════════════════════════════
// AUDIENCE SYNC — Meta Custom Audiences
// ══════════════════════════════════════════════════════════════
// Implementación basada en Meta Marketing API v21.0
// Ref: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences
//
// Flujo:
// 1. Crear Custom Audience vacía (tipo CUSTOMER_LIST)
// 2. Generar session_id único
// 3. Hashear PII con SHA256 (email, name, city, country)
// 4. Subir en batches de 10,000 (máximo de Meta)
// 5. Marcar last_batch_flag=true en el último batch
//
// CANDADO DE SEGURIDAD: Requiere AUDIENCE_SYNC_ENABLED=true

import { createHash } from "crypto";
import { prisma } from "@/lib/db/client";
import type { SyncableCustomer, SyncResult } from "./types";

// ─── SHA256 Helper (Meta requiere lowercase hex) ───

function sha256(value: string): string {
  return createHash("sha256")
    .update(value.toLowerCase().trim())
    .digest("hex");
}

// ─── Resolve Meta Ads credentials ───

async function resolveMetaAdsCredentials(organizationId: string): Promise<{
  adAccountId: string;
  accessToken: string;
} | null> {
  const connection = await prisma.connection.findFirst({
    where: {
      organizationId,
      platform: "META_ADS" as any,
      status: "ACTIVE" as any,
    },
    select: { credentials: true },
  });

  let adAccountId: string | undefined;
  let accessToken: string | undefined;

  if (connection?.credentials) {
    const creds = connection.credentials as Record<string, string>;
    adAccountId = creds.adAccountId || creds.ad_account_id;
    accessToken = creds.accessToken || creds.access_token;
  }

  // Multi-tenant: NO fallback env vars (META_AD_ACCOUNT_ID / META_ADS_ACCESS_TOKEN)
  // Solo se usan las credentials de la Connection de la org. Si la org no tiene
  // Meta Ads conectado, retorna null y el sync se skipea.

  if (!adAccountId || !accessToken) return null;
  return { adAccountId, accessToken };
}

// ─── Create Custom Audience on Meta ───

async function createMetaAudience(
  adAccountId: string,
  accessToken: string,
  name: string,
  description?: string
): Promise<{ id: string } | { error: string }> {
  const url = `https://graph.facebook.com/v21.0/act_${adAccountId}/customaudiences`;

  const body: Record<string, string> = {
    name,
    subtype: "CUSTOM",
    description: description || `NitroSales Audience Sync - ${name}`,
    customer_file_source: "USER_PROVIDED_ONLY",
    access_token: accessToken,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    return { error: result.error?.message || `HTTP ${response.status}` };
  }

  return { id: result.id };
}

// ─── Prepare customer data for Meta ───
// Schema: EMAIL, FN, LN, CT, COUNTRY, EXTERN_ID
// Multi-key matching mejora el match rate un 15-25% vs solo email

function prepareMetaBatch(customers: SyncableCustomer[]): {
  schema: string[];
  data: string[][];
} {
  const schema = ["EMAIL", "FN", "LN", "CT", "COUNTRY", "EXTERN_ID"];
  const data: string[][] = [];

  for (const c of customers) {
    if (!c.email) continue;
    data.push([
      sha256(c.email),
      c.firstName ? sha256(c.firstName) : "",
      c.lastName ? sha256(c.lastName) : "",
      c.city ? sha256(c.city) : "",
      sha256(c.country || "ar"),
      c.id, // EXTERN_ID no requiere hash
    ]);
  }

  return { schema, data };
}

// ─── Upload batch to Meta ───

async function uploadBatchToMeta(
  adAccountId: string,
  accessToken: string,
  audienceId: string,
  payload: {
    schema: string[];
    data: string[][];
    session_id: string;
    batch_seq: number;
    last_batch_flag: boolean;
    estimated_num_total?: number;
  }
): Promise<{ success: boolean; error: string }> {
  const url = `https://graph.facebook.com/v21.0/${audienceId}/users`;

  const body = {
    payload: {
      schema: payload.schema,
      data: payload.data,
    },
    session: {
      session_id: Number(payload.session_id),
      batch_seq: payload.batch_seq,
      last_batch_flag: payload.last_batch_flag,
      ...(payload.estimated_num_total && { estimated_num_total: payload.estimated_num_total }),
    },
    access_token: accessToken,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    // Rate limit check (error code 80003)
    if (result.error?.code === 80003) {
      return { success: false, error: "RATE_LIMITED" };
    }
    return { success: false, error: result.error?.message || `HTTP ${response.status}` };
  }

  return { success: true, error: "" };
}

// ─── Main Sync Function ───
// Sincroniza una lista de clientes a Meta Custom Audiences

export async function syncToMeta(
  organizationId: string,
  audienceId: string,
  metaAudienceId: string | null,
  audienceName: string,
  customers: SyncableCustomer[]
): Promise<SyncResult> {
  const startTime = Date.now();

  // CANDADO 1: Global flag
  if (process.env.AUDIENCE_SYNC_ENABLED !== "true") {
    return {
      success: false,
      skipped: true,
      reason: "AUDIENCE_SYNC_ENABLED is not true",
      platform: "META",
      customersSent: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // CANDADO 2: Credentials
  const creds = await resolveMetaAdsCredentials(organizationId);
  if (!creds) {
    return {
      success: false,
      skipped: true,
      reason: "No Meta Ads credentials configured",
      platform: "META",
      customersSent: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // CANDADO 3: Minimum audience size (Meta requires ~20 for useful matching)
  if (customers.length < 20) {
    return {
      success: false,
      skipped: true,
      reason: `Too few customers (${customers.length}). Meta requires at least 20 for useful matching.`,
      platform: "META",
      customersSent: 0,
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // Step 1: Create audience on Meta if needed
    let externalId = metaAudienceId;
    if (!externalId) {
      const createResult = await createMetaAudience(
        creds.adAccountId,
        creds.accessToken,
        `NitroSales - ${audienceName}`,
        `Audiencia sincronizada desde NitroSales. ${customers.length} clientes.`
      );

      if ("error" in createResult) {
        return {
          success: false,
          skipped: false,
          reason: `Failed to create Meta audience: ${createResult.error}`,
          platform: "META",
          customersSent: 0,
          durationMs: Date.now() - startTime,
        };
      }

      externalId = createResult.id;

      // Save Meta audience ID back to our DB
      await prisma.audience.update({
        where: { id: audienceId },
        data: { metaAudienceId: externalId },
      });
    }

    // Step 2: Prepare data
    const { schema, data } = prepareMetaBatch(customers);
    if (data.length === 0) {
      return {
        success: false,
        skipped: true,
        reason: "No customers with email to send",
        platform: "META",
        customersSent: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 3: Upload in batches of 10,000
    const BATCH_SIZE = 10000;
    const sessionId = String(Math.floor(Math.random() * 9e15) + 1e15);
    const totalBatches = Math.ceil(data.length / BATCH_SIZE);
    let totalSent = 0;
    const errors: string[] = [];

    for (let i = 0; i < totalBatches; i++) {
      const batchData = data.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
      const isLast = i === totalBatches - 1;

      let retries = 0;
      let batchResult = { success: false, error: "" };

      // Retry with exponential backoff for rate limits
      while (retries < 3) {
        batchResult = await uploadBatchToMeta(
          creds.adAccountId,
          creds.accessToken,
          externalId!,
          {
            schema,
            data: batchData,
            session_id: sessionId,
            batch_seq: i + 1,
            last_batch_flag: isLast,
            estimated_num_total: data.length,
          }
        );

        if (batchResult.success || batchResult.error !== "RATE_LIMITED") break;

        retries++;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries))); // 2s, 4s, 8s
      }

      if (batchResult.success) {
        totalSent += batchData.length;
      } else {
        errors.push(`Batch ${i + 1}: ${batchResult.error}`);
      }

      // Small delay between batches
      if (!isLast) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return {
      success: errors.length === 0,
      skipped: false,
      platform: "META",
      customersSent: totalSent,
      externalAudienceId: externalId!,
      durationMs: Date.now() - startTime,
      batchCount: totalBatches,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      skipped: false,
      reason: `Unexpected error: ${err.message}`,
      platform: "META",
      customersSent: 0,
      durationMs: Date.now() - startTime,
    };
  }
}
