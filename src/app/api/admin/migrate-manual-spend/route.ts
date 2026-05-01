// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/migrate-manual-spend?key=Y
// ══════════════════════════════════════════════════════════════
// Crea la tabla manual_channel_spends para que clientes puedan
// cargar inversion manual de canales sin integracion (TV, radio,
// omnichannel, etc) y el dashboard la sume al ROAS.
//
// Idempotente — usa CREATE TABLE IF NOT EXISTS.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (key !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "manual_channel_spends" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "channel" TEXT NOT NULL,
        "fromDate" TIMESTAMPTZ NOT NULL,
        "toDate" TIMESTAMPTZ NOT NULL,
        "amount" DECIMAL(14, 2) NOT NULL,
        "note" TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "manual_channel_spends_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "manual_channel_spends_org_channel_idx"
        ON "manual_channel_spends" ("organizationId", "channel");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "manual_channel_spends_org_date_idx"
        ON "manual_channel_spends" ("organizationId", "fromDate", "toDate");
    `);

    return NextResponse.json({
      ok: true,
      message: "manual_channel_spends table created (or already existed)",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
