// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/migrate-onboarding-ready-for-review
// ══════════════════════════════════════════════════════════════
// Agrega el valor 'READY_FOR_REVIEW' al enum OnboardingStatus.
// Idempotente.
//
// READY_FOR_REVIEW = backfill termino, falta que admin (Tomy) revise
// y active manualmente. Estado intermedio entre BACKFILLING y ACTIVE
// para evitar que clientes nuevos entren al producto sin QA visual previo.
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

    await prisma.$executeRawUnsafe(
      `ALTER TYPE "OnboardingStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_REVIEW'`
    );

    return NextResponse.json({
      ok: true,
      message: "READY_FOR_REVIEW agregado al enum OnboardingStatus (o ya existía).",
    });
  } catch (err: any) {
    console.error("[migrate-onboarding-ready-for-review] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
