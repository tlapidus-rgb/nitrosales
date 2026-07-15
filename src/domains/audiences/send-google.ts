// ══════════════════════════════════════════════════════════════
// AUDIENCE SYNC — Google Customer Match
// ══════════════════════════════════════════════════════════════
// Implementación basada en Google Ads API v17
// Ref: https://developers.google.com/google-ads/api/docs/remarketing/audience-segments/customer-match
//
// NOTA IMPORTANTE (April 2026): Google está deprecando Customer Match uploads
// via Google Ads API. Tokens inactivos desde Oct 2025 deben migrar a Data Manager API.
// Esta implementación usa el approach actual que sigue funcionando para tokens activos.
//
// Flujo:
// 1. Crear User List (CrmBasedUserList) si no existe
// 2. Crear OfflineUserDataJob
// 3. Agregar operaciones (hasta 100K identifiers por request)
// 4. Ejecutar el job
// 5. Pollear status
//
// CANDADO DE SEGURIDAD: Requiere AUDIENCE_SYNC_ENABLED=true

import { createHash } from "crypto";
import { prisma } from "@/lib/db/client";
import type { SyncableCustomer, SyncResult } from "./types";

// ─── SHA256 Helper ───

function sha256(value: string): string {
  return createHash("sha256")
    .update(value.toLowerCase().trim())
    .digest("hex");
}

// Gmail normalization: remove dots and + aliases before hashing
function normalizeGmail(email: string): string {
  const [local, domain] = email.toLowerCase().trim().split("@");
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const cleaned = local.replace(/\./g, "").split("+")[0];
    return `${cleaned}@${domain}`;
  }
  return email.toLowerCase().trim();
}

// ─── Resolve Google Ads credentials ───

async function resolveGoogleAdsCredentials(organizationId: string): Promise<{
  accessToken: string;
  customerId: string;
  developerToken: string;
  loginCustomerId?: string;
} | null> {
  const connection = await prisma.connection.findFirst({
    where: {
      organizationId,
      platform: "GOOGLE_ADS" as any,
      status: "ACTIVE" as any,
    },
    select: { credentials: true },
  });

  let accessToken: string | undefined;
  let customerId: string | undefined;
  let developerToken: string | undefined;
  let loginCustomerId: string | undefined;

  if (connection?.credentials) {
    const creds = connection.credentials as Record<string, string>;
    accessToken = creds.accessToken || creds.access_token;
    customerId = creds.customerId || creds.customer_id;
    developerToken = creds.developerToken || creds.developer_token;
    loginCustomerId = creds.loginCustomerId || creds.login_customer_id;
  }

  // Multi-tenant: accessToken + customerId son per-org (Connection table only).
  // developerToken es a nivel APP de NitroSales (compartido entre orgs) — OK fallback env.
  developerToken = developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!accessToken || !customerId || !developerToken) return null;
  return { accessToken, customerId, developerToken, loginCustomerId };
}

// ─── Create User List on Google Ads ───

async function createGoogleUserList(
  creds: { accessToken: string; customerId: string; developerToken: string; loginCustomerId?: string },
  name: string,
  description?: string
): Promise<{ resourceName: string } | { error: string }> {
  const url = `https://googleads.googleapis.com/v17/customers/${creds.customerId}/userLists:mutate`;

  const body = {
    operations: [{
      create: {
        name,
        description: description || `NitroSales Audience Sync - ${name}`,
        membershipLifeSpan: 540, // Max allowed (days)
        crmBasedUserList: {
          uploadKeyType: "CONTACT_INFO",
          dataSourceType: "FIRST_PARTY",
        },
      },
    }],
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${creds.accessToken}`,
    "developer-token": creds.developerToken,
  };
  if (creds.loginCustomerId) {
    headers["login-customer-id"] = creds.loginCustomerId;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    return { error: result.error?.message || `HTTP ${response.status}` };
  }

  const resourceName = result.results?.[0]?.resourceName;
  if (!resourceName) {
    return { error: "No resource name in response" };
  }

  return { resourceName };
}

// ─── Prepare UserIdentifier objects ───
// Google uses ONE identifier per UserIdentifier object
// So a customer with email + first name + last name = 3 separate objects

function prepareGoogleOperations(customers: SyncableCustomer[]): Array<{
  create: { userIdentifiers: Array<Record<string, any>> };
}> {
  const operations: Array<{ create: { userIdentifiers: Array<Record<string, any>> } }> = [];

  for (const c of customers) {
    if (!c.email) continue;

    const identifiers: Array<Record<string, any>> = [];

    // Email (always present at this point)
    identifiers.push({
      hashedEmail: sha256(normalizeGmail(c.email)),
    });

    // Address info (requires all 4: first, last, country, postal)
    // We don't have postal codes, so we send email + address partial where possible
    if (c.firstName && c.lastName) {
      identifiers.push({
        addressInfo: {
          hashedFirstName: sha256(c.firstName),
          hashedLastName: sha256(c.lastName),
          countryCode: (c.country || "AR").toUpperCase(),
        },
      });
    }

    operations.push({
      create: { userIdentifiers: identifiers },
    });
  }

  return operations;
}

// ─── Execute Offline User Data Job ───

async function executeGoogleJob(
  creds: { accessToken: string; customerId: string; developerToken: string; loginCustomerId?: string },
  userListResourceName: string,
  operations: Array<{ create: { userIdentifiers: Array<Record<string, any>> } }>
): Promise<{ success: boolean; error?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${creds.accessToken}`,
    "developer-token": creds.developerToken,
  };
  if (creds.loginCustomerId) {
    headers["login-customer-id"] = creds.loginCustomerId;
  }

  // Step 1: Create the job
  const createJobUrl = `https://googleads.googleapis.com/v17/customers/${creds.customerId}/offlineUserDataJobs:create`;
  const createJobBody = {
    job: {
      type: "CUSTOMER_MATCH_USER_LIST",
      customerMatchUserListMetadata: {
        userList: userListResourceName,
        consent: {
          adUserData: "GRANTED",
          adPersonalization: "GRANTED",
        },
      },
    },
  };

  const createResponse = await fetch(createJobUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(createJobBody),
    signal: AbortSignal.timeout(15000),
  });

  const createResult = await createResponse.json();
  if (!createResponse.ok || createResult.error) {
    return { success: false, error: `Create job failed: ${createResult.error?.message || createResponse.status}` };
  }

  const jobResourceName = createResult.resourceName;
  if (!jobResourceName) {
    return { success: false, error: "No job resource name returned" };
  }

  // Step 2: Add operations (up to 100K per request)
  const BATCH_SIZE = 100000;
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const batch = operations.slice(i, i + BATCH_SIZE);
    const addUrl = `https://googleads.googleapis.com/v17/${jobResourceName}:addOperations`;
    const addBody = {
      operations: batch,
      enablePartialFailure: true,
    };

    const addResponse = await fetch(addUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(addBody),
      signal: AbortSignal.timeout(30000),
    });

    const addResult = await addResponse.json();
    if (!addResponse.ok || addResult.error) {
      return { success: false, error: `Add operations failed: ${addResult.error?.message || addResponse.status}` };
    }
  }

  // Step 3: Run the job
  const runUrl = `https://googleads.googleapis.com/v17/${jobResourceName}:run`;
  const runResponse = await fetch(runUrl, {
    method: "POST",
    headers,
    body: "{}",
    signal: AbortSignal.timeout(15000),
  });

  if (!runResponse.ok) {
    const runResult = await runResponse.json();
    return { success: false, error: `Run job failed: ${runResult.error?.message || runResponse.status}` };
  }

  return { success: true };
}

// ─── Main Sync Function ───

export async function syncToGoogle(
  organizationId: string,
  audienceId: string,
  googleListId: string | null,
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
      platform: "GOOGLE",
      customersSent: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // CANDADO 2: Credentials
  const creds = await resolveGoogleAdsCredentials(organizationId);
  if (!creds) {
    return {
      success: false,
      skipped: true,
      reason: "No Google Ads credentials configured",
      platform: "GOOGLE",
      customersSent: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // CANDADO 3: Minimum size (Google needs ~100 for list to show)
  if (customers.length < 20) {
    return {
      success: false,
      skipped: true,
      reason: `Too few customers (${customers.length}). Google requires more for useful matching.`,
      platform: "GOOGLE",
      customersSent: 0,
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // Step 1: Create user list if needed
    let listResourceName = googleListId;
    if (!listResourceName) {
      const createResult = await createGoogleUserList(
        creds,
        `NitroSales - ${audienceName}`,
        `Audiencia sincronizada desde NitroSales. ${customers.length} clientes.`
      );

      if ("error" in createResult) {
        return {
          success: false,
          skipped: false,
          reason: `Failed to create Google user list: ${createResult.error}`,
          platform: "GOOGLE",
          customersSent: 0,
          durationMs: Date.now() - startTime,
        };
      }

      listResourceName = createResult.resourceName;

      // Save Google list ID back to our DB
      await prisma.audience.update({
        where: { id: audienceId },
        data: { googleListId: listResourceName },
      });
    }

    // Step 2: Prepare operations
    const operations = prepareGoogleOperations(customers);
    if (operations.length === 0) {
      return {
        success: false,
        skipped: true,
        reason: "No customers with email to send",
        platform: "GOOGLE",
        customersSent: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 3: Execute job
    const jobResult = await executeGoogleJob(creds, listResourceName!, operations);

    if (!jobResult.success) {
      return {
        success: false,
        skipped: false,
        reason: jobResult.error,
        platform: "GOOGLE",
        customersSent: 0,
        durationMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      skipped: false,
      platform: "GOOGLE",
      customersSent: operations.length,
      externalAudienceId: listResourceName!,
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      success: false,
      skipped: false,
      reason: `Unexpected error: ${err.message}`,
      platform: "GOOGLE",
      customersSent: 0,
      durationMs: Date.now() - startTime,
    };
  }
}
