import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { igualSeguro } from "@/lib/comparacion-segura";

export function creatorPasswordFromRequest(req: NextRequest): string | null {
  const encoded = req.headers.get("x-creator-password");
  if (encoded === null) return new URL(req.url).searchParams.get("password");
  try { return encoded.length <= 12288 ? decodeURIComponent(encoded) : ""; }
  catch { return ""; }
}

export function creatorPasswordMatches(password: unknown, stored: string | null): boolean {
  return typeof password === "string" && password.length > 0 && password.length <= 1024 &&
    !!stored && igualSeguro(createHash("sha256").update(password).digest("hex"), stored);
}

// The unique key serializes increments across instances. The database owns time.
// Denied attempts do not extend the fixed window.
export const CONSUME_CREATOR_ATTEMPT_SQL = `
INSERT INTO creator_password_attempts (key, attempts, expires_at)
VALUES ($1, 1, statement_timestamp() + interval '1 minute')
ON CONFLICT (key) DO UPDATE SET
  attempts = CASE WHEN creator_password_attempts.expires_at <= statement_timestamp()
    THEN 1 ELSE LEAST(creator_password_attempts.attempts + 1, $2::int + 1) END,
  expires_at = CASE WHEN creator_password_attempts.expires_at <= statement_timestamp()
    THEN statement_timestamp() + interval '1 minute' ELSE creator_password_attempts.expires_at END
RETURNING attempts, expires_at::text AS "window", GREATEST(1, CEIL(EXTRACT(EPOCH FROM
  (expires_at - statement_timestamp()))))::int AS retry_after`;

export function creatorAttemptKeys(req: NextRequest, slug: string, code: string) {
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() || "unknown").toLowerCase();
  const hash = (parts: string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  // Independent scopes: rotating IPs cannot replenish the account budget.
  return [{ key: hash(["account", slug, code]), limit: 5 },
    { key: hash(["ip", ip]), limit: 30 }];
}

export async function limitCreatorPassword(req: NextRequest, slug: string, code: string) {
  try {
    let retryAfter = 0;
    const receipts: Array<{ key: string; window: string }> = [];
    for (const { key, limit } of creatorAttemptKeys(req, slug, code)) {
      const [row] = await prisma.$queryRawUnsafe<Array<{ attempts: number; retry_after: number; window: string }>>(
        CONSUME_CREATOR_ATTEMPT_SQL, key, limit,
      );
      if (!row) throw new Error("Missing admission result");
      if (row.attempts > limit) retryAfter = Math.max(retryAfter, row.retry_after);
      receipts.push({ key, window: row.window });
    }
    const blocked = retryAfter ? NextResponse.json({ valid: false,
      error: "Demasiados intentos. Esperá un minuto y probá de nuevo." },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } }) : null;
    let released = false;
    return { blocked, async success() {
      if (blocked || released) return;
      released = true;
      // Refund only this successful request, never reset anyone else's failures.
      // Matching the original window prevents late replies refunding a new one.
      for (const receipt of receipts) {
        await prisma.$executeRawUnsafe(`UPDATE creator_password_attempts
          SET attempts = GREATEST(0, attempts - 1) WHERE key = $1 AND expires_at = $2::timestamptz`,
        receipt.key, receipt.window);
      }
    } };
  } catch {
    // Includes missing migration. No in-memory fallback.
    return { blocked: NextResponse.json({ valid: false, error: "No se pudo verificar el acceso. Intentá nuevamente." },
      { status: 503, headers: { "Cache-Control": "no-store" } }), async success() {} };
  }
}
