// ══════════════════════════════════════════════════════════════
// NitroPixel — Webhook Signature Verification
// ══════════════════════════════════════════════════════════════
// Validates inbound webhook requests against a shared secret to
// prevent unauthorized injection of fake orders / events.
//
// Verification modes (in priority order):
//   1. HMAC-SHA256 signature header  (X-Webhook-Signature: sha256=<hex>)
//   2. Plain shared-secret header     (X-Webhook-Secret: <secret>)
//
// HMAC mode is preferred for production. The plain-secret mode is
// kept as a backwards-compatible escape hatch for partners that
// cannot sign payloads.
//
// Resolution order for the secret:
//   1. Connection.credentials.webhookSecret  (per-org, multi-tenant)
//   2. process.env.WEBHOOK_SECRET             (single-tenant fallback)
//
// SAFETY: If NO secret is configured anywhere, requests are allowed
// (gradual rollout) but a warning is logged. Set WEBHOOK_ENFORCE=1
// in env to switch to hard-deny mode.
// ══════════════════════════════════════════════════════════════

import crypto from "crypto";
import { prisma } from "@/lib/db/client";

export interface VerificationResult {
  ok: boolean;
  reason?: string;
  mode?: "hmac" | "plain" | "no-secret-allow";
}

/**
 * Resolve a webhook secret for a given organization + provider key.
 * Looks at the Connection table first, then falls back to env var.
 */
async function resolveSecret(
  organizationId: string | null,
  providerEnvVar: string,
): Promise<string | null> {
  if (organizationId) {
    try {
      const connections = await prisma.connection.findMany({
        where: { organizationId },
        select: { credentials: true },
      });
      for (const c of connections) {
        const creds = (c.credentials || {}) as Record<string, unknown>;
        const fromCreds = (creds.webhookSecret || creds.webhook_secret) as string | undefined;
        if (fromCreds) return fromCreds;
      }
    } catch {
      // Non-fatal — fall through to env var
    }
  }
  const fromEnv = process.env[providerEnvVar] || process.env.WEBHOOK_SECRET;
  return fromEnv || null;
}

/**
 * Constant-time string compare to avoid timing attacks.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify a webhook request. Pass the raw body string (not parsed JSON)
 * because HMAC must be calculated over the exact bytes received.
 */
export async function verifyWebhookSignature(opts: {
  rawBody: string;
  headers: Headers;
  organizationId: string | null;
  providerEnvVar: string; // e.g. "VTEX_WEBHOOK_SECRET"
}): Promise<VerificationResult> {
  const { rawBody, headers, organizationId, providerEnvVar } = opts;
  const secret = await resolveSecret(organizationId, providerEnvVar);

  // No secret configured anywhere → soft allow with warning (gradual rollout).
  // Flip WEBHOOK_ENFORCE=1 in env to hard-deny.
  if (!secret) {
    if (process.env.WEBHOOK_ENFORCE === "1") {
      return { ok: false, reason: "no-secret-configured-and-enforce-on" };
    }
    console.warn(
      `[Webhook Verify] No secret configured (provider=${providerEnvVar}, org=${organizationId || "unknown"}). Allowing with warning. Set ${providerEnvVar} or WEBHOOK_SECRET to enforce.`,
    );
    return { ok: true, mode: "no-secret-allow" };
  }

  // Mode 1: HMAC signature header (preferred)
  const sig =
    headers.get("x-webhook-signature") ||
    headers.get("x-hub-signature-256") ||
    headers.get("x-vtex-signature");
  if (sig) {
    const provided = sig.startsWith("sha256=") ? sig.slice(7) : sig;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");
    if (safeEqual(provided.toLowerCase(), expected.toLowerCase())) {
      return { ok: true, mode: "hmac" };
    }
    return { ok: false, reason: "hmac-mismatch", mode: "hmac" };
  }

  // Mode 2: Plain shared secret header (backwards compatible)
  const plain = headers.get("x-webhook-secret") || headers.get("x-vtex-secret");
  if (plain) {
    if (safeEqual(plain, secret)) {
      return { ok: true, mode: "plain" };
    }
    // Plain header was sent but does NOT match → always hard deny
    // (this is an unambiguous attempt to authenticate that failed).
    return { ok: false, reason: "plain-secret-mismatch", mode: "plain" };
  }

  // Secret IS configured but the request did NOT include any signature
  // header at all. This is the common case for VTEX, which by default
  // does not sign webhooks. To preserve the gradual rollout promise,
  // we soft-allow with a warning UNLESS WEBHOOK_ENFORCE=1 is set.
  // This prevents a stray env var from silently 401-ing all real orders.
  if (process.env.WEBHOOK_ENFORCE === "1") {
    return { ok: false, reason: "missing-signature-and-enforce-on" };
  }
  console.warn(
    `[Webhook Verify] Secret configured but no signature header present (provider=${providerEnvVar}, org=${organizationId || "unknown"}). Allowing with warning. Configure provider to send X-Webhook-Signature, or set WEBHOOK_ENFORCE=1 to hard-deny.`,
  );
  return { ok: true, mode: "no-secret-allow" };
}
