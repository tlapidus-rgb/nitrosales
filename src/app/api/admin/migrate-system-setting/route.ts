// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/migrate-system-setting?key=...
// ══════════════════════════════════════════════════════════════
// Crea la tabla system_setting (key TEXT PK, value JSONB).
// Idempotente. Una vez ejecutado, el endpoint /api/me/section-status
// puede leer overrides globales.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "system_setting" (
        "key" TEXT PRIMARY KEY,
        "value" JSONB NOT NULL,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    return NextResponse.json({ ok: true, message: "system_setting tabla creada (o ya existía)." });
  } catch (err: any) {
    console.error("[migrate-system-setting] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
