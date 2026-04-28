// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/fix-vtex-creds-retry
// Body: { orgId }
// ══════════════════════════════════════════════════════════════
// Sanitize las credentials VTEX que ya estan guardadas en DB
// (remueve U+2028, NBSP, zero-width, y filtra a ASCII printable),
// resetea el backfill_job VTEX a QUEUED para que retome, y dispara
// el runner inmediatamente.
//
// Uso: cuando el cliente copio credentials VTEX desde un lugar con
// formato (Notion/PDF) y el backfill fallo con error ByteString.
// Evita que el cliente tenga que volver al wizard.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { waitUntil } from "@vercel/functions";

export const dynamic = "force-dynamic";

const BACKFILL_RUNNER_KEY = "nitrosales-secret-key-2024-production";

function sanitizeString(s: string): string {
  return s
    .replace(/[\u2028\u2029\u200B\u200C\u200D\uFEFF\u00A0]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const orgId = String(body.orgId || "");
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

    // 1. Read + sanitize VTEX connection credentials
    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "VTEX" as any },
      select: { id: true, credentials: true },
    });
    if (!conn) return NextResponse.json({ error: "No VTEX connection for org" }, { status: 404 });

    const original = conn.credentials as any || {};
    const sanitized: any = {};
    const changes: Record<string, { before: number; after: number }> = {};

    for (const [k, v] of Object.entries(original)) {
      if (typeof v === "string") {
        const clean = sanitizeString(v);
        sanitized[k] = clean;
        if (clean !== v) {
          changes[k] = { before: v.length, after: clean.length };
        }
      } else {
        sanitized[k] = v;
      }
    }

    await prisma.connection.update({
      where: { id: conn.id },
      data: {
        credentials: sanitized,
        lastSyncError: null,
        status: "ACTIVE" as any,
      },
    });

    // 2. Reset VTEX backfill job to QUEUED (only if exists)
    const resetResult = await prisma.$executeRawUnsafe(
      `UPDATE "backfill_jobs"
       SET "status" = 'QUEUED',
           "lastError" = NULL,
           "lastChunkAt" = NULL,
           "updatedAt" = NOW()
       WHERE "organizationId" = $1
         AND "platform" = 'VTEX'
         AND "status" IN ('RUNNING', 'FAILED')`,
      orgId
    );

    // 3. Trigger runner immediately
    const baseUrl = process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
    waitUntil(
      fetch(`${baseUrl}/api/cron/backfill-runner?key=${BACKFILL_RUNNER_KEY}`, { method: "GET" })
        .then((r) => console.log(`[fix-vtex-creds] runner triggered: ${r.status}`))
        .catch((err) => console.error(`[fix-vtex-creds] runner trigger failed: ${err.message}`))
    );

    return NextResponse.json({
      ok: true,
      orgId,
      changes,
      jobsReset: Number(resetResult),
      note: "Backfill VTEX va a retomar en unos segundos. Refrescá la página de progreso.",
    });
  } catch (err: any) {
    console.error("[fix-vtex-creds-retry]", err);
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
