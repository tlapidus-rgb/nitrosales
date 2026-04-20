// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/onboardings
// ══════════════════════════════════════════════════════════════
// Lista todas las solicitudes de onboarding para el panel admin.
// Gateado por isInternalUser.
// Query params: ?status=PENDING|IN_PROGRESS|ACTIVE|NEEDS_INFO|REJECTED
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status");

    const whereClause = statusFilter
      ? `WHERE "status" = '${statusFilter.replace(/[^A-Z_]/g, "")}'::"OnboardingStatus"`
      : "";

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        status: string;
        companyName: string;
        proposedSlug: string;
        storeUrl: string;
        contactName: string;
        contactEmail: string;
        contactPhone: string | null;
        hasVtex: boolean;
        hasMl: boolean;
        hasMeta: boolean;
        hasGoogleAds: boolean;
        progressStage: string;
        createdAt: Date;
        updatedAt: Date;
        activatedAt: Date | null;
      }>
    >(
      `SELECT
         "id", "status", "companyName", "proposedSlug", "storeUrl",
         "contactName", "contactEmail", "contactPhone",
         ("vtexAccountName" IS NOT NULL) AS "hasVtex",
         ("mlUsername" IS NOT NULL) AS "hasMl",
         ("metaAdAccountId" IS NOT NULL) AS "hasMeta",
         ("googleAdsCustomerId" IS NOT NULL) AS "hasGoogleAds",
         "progressStage", "createdAt", "updatedAt", "activatedAt"
       FROM "onboarding_requests"
       ${whereClause}
       ORDER BY
         CASE "status"
           WHEN 'PENDING' THEN 1
           WHEN 'IN_PROGRESS' THEN 2
           WHEN 'NEEDS_INFO' THEN 3
           WHEN 'ACTIVE' THEN 4
           WHEN 'REJECTED' THEN 5
         END,
         "createdAt" DESC
       LIMIT 200`
    );

    // Counts by status
    const counts = await prisma.$queryRawUnsafe<
      Array<{ status: string; count: bigint }>
    >(
      `SELECT "status", COUNT(*)::bigint as count FROM "onboarding_requests" GROUP BY "status"`
    );

    const statusCounts: Record<string, number> = {};
    counts.forEach((c) => {
      statusCounts[c.status] = Number(c.count);
    });

    return NextResponse.json({
      ok: true,
      requests: rows.map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
        activatedAt: r.activatedAt ? new Date(r.activatedAt).toISOString() : null,
      })),
      statusCounts,
    });
  } catch (error: any) {
    console.error("[admin/onboardings GET] error:", error);
    return NextResponse.json(
      { error: "Error al listar solicitudes" },
      { status: 500 }
    );
  }
}
