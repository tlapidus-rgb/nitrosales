// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/onboardings/[id]/backfill-status
// ══════════════════════════════════════════════════════════════
// Progreso del backfill de un onboarding: lista de jobs + % por
// plataforma + ETA estimado.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { getJobsByOnboarding } from "@/lib/backfill/job-manager";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const jobs = await getJobsByOnboarding(id);

    // Conteo real de orders unicas en DB por plataforma — mas honesto que
    // el processedCount que infla con reprocesos del runner.
    // NOTA: orders.source es String, no enum. Y ML guarda como "MELI",
    // mientras que el platform del job es "MERCADOLIBRE".
    const platformToSource: Record<string, string> = {
      VTEX: "VTEX",
      MERCADOLIBRE: "MELI",
    };
    const dbCounts: Record<string, number> = {};
    const orgId = jobs[0]?.organizationId;
    if (orgId) {
      const platforms = Array.from(new Set(jobs.map((j: any) => j.platform)));
      for (const p of platforms) {
        const sourceValue = platformToSource[p] || p;
        try {
          const rows = await prisma.$queryRawUnsafe<Array<any>>(
            `SELECT COUNT(*)::int as n FROM "orders" WHERE "organizationId" = $1 AND "source" = $2`,
            orgId,
            sourceValue,
          );
          dbCounts[p] = Number(rows[0]?.n || 0);
        } catch {
          dbCounts[p] = 0;
        }
      }
    }

    const now = Date.now();
    const mapped = jobs.map((j: any) => {
      const dbCount = dbCounts[j.platform] || 0;
      const lastChunkMs = j.lastChunkAt ? new Date(j.lastChunkAt).getTime() : null;
      const secondsSinceLastChunk = lastChunkMs ? Math.round((now - lastChunkMs) / 1000) : null;
      // % "honesto" basado en DB real / estimate
      const totalEst = j.totalEstimate ? Number(j.totalEstimate) : 0;
      const honestPct = j.status === "COMPLETED"
        ? 100
        : (totalEst > 0 ? Math.min(100, Math.round((dbCount / totalEst) * 100)) : Number(j.progressPct || 0));
      return {
        id: j.id,
        platform: j.platform,
        status: j.status,
        monthsRequested: Number(j.monthsRequested),
        processedCount: Number(j.processedCount || 0),
        dbCount,
        totalEstimate: j.totalEstimate ? Number(j.totalEstimate) : null,
        progressPct: honestPct,
        rawProgressPct: Number(j.progressPct || 0),
        lastError: j.lastError,
        startedAt: j.startedAt ? new Date(j.startedAt).toISOString() : null,
        completedAt: j.completedAt ? new Date(j.completedAt).toISOString() : null,
        lastChunkAt: j.lastChunkAt ? new Date(j.lastChunkAt).toISOString() : null,
        secondsSinceLastChunk,
        // Si es RUNNING y hace >3 min sin chunk, lo flageamos como sospechoso de frenado.
        looksStalled: j.status === "RUNNING" && secondsSinceLastChunk !== null && secondsSinceLastChunk > 180,
        createdAt: new Date(j.createdAt).toISOString(),
      };
    });

    const completed = mapped.filter((j) => j.status === "COMPLETED").length;
    const running = mapped.filter((j) => j.status === "RUNNING").length;
    const queued = mapped.filter((j) => j.status === "QUEUED").length;
    const failed = mapped.filter((j) => j.status === "FAILED").length;

    const overallPct = mapped.length > 0
      ? Math.round(mapped.reduce((a, j) => a + j.progressPct, 0) / mapped.length)
      : 0;

    return NextResponse.json({
      ok: true,
      jobs: mapped,
      summary: {
        total: mapped.length,
        completed,
        running,
        queued,
        failed,
        overallPct,
      },
    });
  } catch (error: any) {
    console.error("[backfill-status] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
