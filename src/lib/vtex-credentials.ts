// ══════════════════════════════════════════════════════════════
// VTEX Credential Access - Single Source of Truth
// ══════════════════════════════════════════════════════════════
// All VTEX API routes MUST use this module to get credentials.
// Credentials come from: Connection table > env vars > error.
// NO hardcoded keys anywhere else in the codebase.

import { prisma } from "@/lib/db/client";
import {
  decryptCredentials,
  isEncrypted,
  isEncryptionConfigured,
} from "@/lib/crypto";

export interface VtexCredentialSet {
  accountName: string;
  appKey: string;
  appToken: string;
}

export interface VtexHeaders {
  "X-VTEX-API-AppKey": string;
  "X-VTEX-API-AppToken": string;
  "Content-Type": string;
}

/**
 * Get VTEX credentials for an organization.
 * Priority: Connection table (DB) > environment variables > throws error.
 *
 * @param organizationId - The org to get credentials for.
 *        Pass null to use env-var-only mode (for legacy routes during migration).
 */
export async function getVtexCredentials(
  organizationId: string | null
): Promise<VtexCredentialSet> {
  // 1. Try Connection table if we have an orgId
  if (organizationId) {
    try {
      const connection = await prisma.connection.findUnique({
        where: {
          organizationId_platform: {
            organizationId,
            platform: "VTEX",
          },
        },
      });

      if (connection?.credentials) {
        let creds: Record<string, string>;

        // Support both encrypted (string) and plain (JSON object) credentials
        const raw = connection.credentials;
        if (typeof raw === "string" && isEncrypted(raw)) {
          // Encrypted format: decrypt first
          creds = decryptCredentials(raw);
        } else if (typeof raw === "object" && raw !== null) {
          // Plain JSON format (legacy, pre-encryption)
          creds = raw as Record<string, string>;
        } else {
          creds = {};
        }

        if (creds.appKey && creds.appToken && creds.accountName) {
          return {
            accountName: creds.accountName,
            appKey: creds.appKey,
            appToken: creds.appToken,
          };
        }
      }
    } catch (e) {
      // DB read failed, fall through to env vars
      console.warn("[vtex-credentials] DB lookup failed, trying env vars", e);
    }
  }

  // 2. Fallback to environment variables
  const appKey = process.env.VTEX_APP_KEY;
  const appToken = process.env.VTEX_APP_TOKEN;
  const accountName = process.env.VTEX_ACCOUNT_NAME || "mundojuguete";

  if (appKey && appToken) {
    return { accountName, appKey, appToken };
  }

  // 3. No credentials found
  throw new Error(
    `No VTEX credentials found for org ${organizationId || "unknown"}. ` +
      "Set VTEX_APP_KEY + VTEX_APP_TOKEN env vars or configure Connection in DB."
  );
}

/**
 * Build VTEX API headers from credentials.
 */
export function buildVtexHeaders(creds: VtexCredentialSet): VtexHeaders {
  return {
    "X-VTEX-API-AppKey": creds.appKey,
    "X-VTEX-API-AppToken": creds.appToken,
    "Content-Type": "application/json",
  };
}

/**
 * Build VTEX base URL from account name.
 */
export function buildVtexBaseUrl(accountName: string): string {
  return `https://${accountName}.vtexcommercestable.com.br`;
}

/**
 * Convenience: get credentials + headers + baseUrl in one call.
 */
export async function getVtexConfig(organizationId: string | null) {
  const creds = await getVtexCredentials(organizationId);
  return {
    creds,
    headers: buildVtexHeaders(creds),
    baseUrl: buildVtexBaseUrl(creds.accountName),
  };
}
