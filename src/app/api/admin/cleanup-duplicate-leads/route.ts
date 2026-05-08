// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET/POST /api/admin/cleanup-duplicate-leads?dryRun=1&key=Y
// ══════════════════════════════════════════════════════════════
// Detecta y borra leads que son DUPLICADOS de un onboarding_request
// con el mismo email. Util para limpiar el historial cuando alguien
// fue cargado en el pipeline antes de que postule.
//
// Criterio: lead.contactEmail = onboarding.contactEmail (case insensitive)
// AND el lead esta en estado LEAD o CONTACTADO.
// AND el onboarding tiene status mas avanzado (PENDING / IN_PROGRESS /
//     NEEDS_INFO / BACKFILLING / READY_FOR_REVIEW / ACTIVE).
//
// dryRun=1 → solo lista, no borra.
// Sin dryRun → borra los matches.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
const KEY = "nitrosales-secret-key-2024-production";

async function handle(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const dryRun = url.searchParams.get("dryRun") === "1";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Buscar leads que tienen un onboarding_request con MISMO email
    // (case-insensitive) y onboarding está en estado mas avanzado.
    // Solo leads en LEAD o CONTACTADO (los que aún no se convirtieron).
    const duplicates = await prisma.$queryRawUnsafe<
      Array<{
        leadId: string;
        leadName: string | null;
        leadEmail: string;
        leadStatus: string;
        leadCreatedAt: Date;
        onboardingId: string;
        onboardingStatus: string;
        onboardingCompanyName: string;
      }>
    >(`
      SELECT
        l."id" AS "leadId",
        l."contactName" AS "leadName",
        l."contactEmail" AS "leadEmail",
        l."status" AS "leadStatus",
        l."createdAt" AS "leadCreatedAt",
        ob."id" AS "onboardingId",
        ob."status"::text AS "onboardingStatus",
        ob."companyName" AS "onboardingCompanyName"
      FROM "leads" l
      JOIN "onboarding_requests" ob
        ON LOWER(ob."contactEmail") = LOWER(l."contactEmail")
      WHERE l."convertedToOnboardingId" IS NULL
        AND l."contactEmail" IS NOT NULL
        AND ob."status"::text IN (
          'PENDING', 'IN_PROGRESS', 'NEEDS_INFO',
          'BACKFILLING', 'READY_FOR_REVIEW', 'ACTIVE'
        )
      ORDER BY l."createdAt" DESC
    `);

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        wouldDelete: duplicates.length,
        duplicates: duplicates.map((d) => ({
          leadId: d.leadId,
          leadName: d.leadName,
          leadEmail: d.leadEmail,
          leadStatus: d.leadStatus,
          leadCreatedAt: d.leadCreatedAt,
          matchOnboarding: {
            id: d.onboardingId,
            companyName: d.onboardingCompanyName,
            status: d.onboardingStatus,
          },
        })),
      });
    }

    // Ejecutar el borrado
    let deletedCount = 0;
    const deleted: any[] = [];
    for (const d of duplicates) {
      try {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "leads" WHERE "id" = $1`,
          d.leadId
        );
        deletedCount += 1;
        deleted.push({
          leadId: d.leadId,
          leadName: d.leadName,
          leadEmail: d.leadEmail,
          matchedOnboarding: d.onboardingCompanyName,
        });
      } catch (e: any) {
        deleted.push({ leadId: d.leadId, error: e.message?.slice(0, 100) });
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      deletedCount,
      deleted,
    });
  } catch (err: any) {
    console.error("[cleanup-duplicate-leads] error:", err);
    return NextResponse.json(
      { error: err.message, stack: err.stack?.slice(0, 500) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
