// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-onboarding-requests — Feature Async Onboarding
// ═══════════════════════════════════════════════════════════════════
// Crea tabla `onboarding_requests` + enum OnboardingStatus.
// Tabla guarda los requests que llegan del formulario público /onboarding.
// Cuando Tomy los revisa y aprueba → convierte en Organization + User owner +
// Connections y marca como ACTIVE.
// ═══════════════════════════════════════════════════════════════════

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

    // Enum de status
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'NEEDS_INFO', 'ACTIVE', 'REJECTED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    results.push("enum OnboardingStatus OK");

    // Tabla
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "onboarding_requests" (
        "id" TEXT PRIMARY KEY,
        "status" "OnboardingStatus" NOT NULL DEFAULT 'PENDING',
        "token" TEXT NOT NULL UNIQUE,

        "companyName" TEXT NOT NULL,
        "proposedSlug" TEXT NOT NULL,
        "cuit" TEXT,
        "industry" TEXT,
        "storeUrl" TEXT NOT NULL,

        "contactName" TEXT NOT NULL,
        "contactEmail" TEXT NOT NULL,
        "contactPhone" TEXT,
        "contactWhatsapp" TEXT,

        "vtexAccountName" TEXT,
        "vtexAppKeyEncrypted" TEXT,
        "vtexAppTokenEncrypted" TEXT,

        "mlUsername" TEXT,

        "metaAdAccountId" TEXT,
        "metaAccessTokenEncrypted" TEXT,

        "googleAdsCustomerId" TEXT,

        "adminNotes" TEXT,
        "progressStage" TEXT NOT NULL DEFAULT 'received',

        "createdOrgId" TEXT,
        "activatedAt" TIMESTAMP(3),

        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    results.push("table onboarding_requests OK");

    // Indices
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "onboarding_requests_status_idx"
      ON "onboarding_requests"("status", "createdAt" DESC);
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "onboarding_requests_contactEmail_idx"
      ON "onboarding_requests"("contactEmail");
    `);
    results.push("indices OK");

    return NextResponse.json({
      ok: true,
      message: "onboarding_requests lista. Feature: Async Onboarding ready.",
      results,
    });
  } catch (error: any) {
    console.error("[migrate-onboarding-requests] error:", error);
    return NextResponse.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
