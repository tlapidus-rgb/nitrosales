// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// /api/admin/migrate-onboarding-v2 — Expansión campos onboarding
// ══════════════════════════════════════════════════════════════
// Agrega 4 campos a onboarding_requests:
//   - timezone (default Buenos Aires)
//   - currency (ARS/USD)
//   - metaPixelId + metaPixelTokenEncrypted (para CAPI, distinto de Meta Ads)
//   - fiscalCondition (Monotributo/Responsable Inscripto/Exento)
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (!key || key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const results: string[] = [];

    // Nuevos campos
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "onboarding_requests"
        ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
        ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'ARS',
        ADD COLUMN IF NOT EXISTS "fiscalCondition" TEXT,
        ADD COLUMN IF NOT EXISTS "metaPixelId" TEXT,
        ADD COLUMN IF NOT EXISTS "metaPixelTokenEncrypted" TEXT;
    `);
    results.push("onboarding_requests: 5 columnas nuevas (timezone, currency, fiscalCondition, metaPixelId, metaPixelTokenEncrypted)");

    return NextResponse.json({
      ok: true,
      message: "onboarding_requests v2 — campos adicionales listos",
      results,
    });
  } catch (error: any) {
    console.error("[migrate-onboarding-v2] error:", error);
    return NextResponse.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
