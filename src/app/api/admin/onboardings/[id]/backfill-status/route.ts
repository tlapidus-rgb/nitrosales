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

    const mapped = jobs.map((j: any) => ({
      id: j.id,
      platform: j.platform,
      status: j.status,
      monthsRequested: Number(j.monthsRequested),
      processedCount: Number(j.processedCount || 0),
      totalEstimate: j.totalEstimate ? Number(j.totalEstimate) : null,
      progressPct: Number(j.progressPct || 0),
      lastError: j.lastError,
      startedAt: j.startedAt ? new Date(j.startedAt).toISOString() : null,
      completedAt: j.completedAt ? new Date(j.completedAt).toISOString() : null,
      lastChunkAt: j.lastChunkAt ? new Date(j.lastChunkAt).toISOString() : null,
      createdAt: new Date(j.createdAt).toISOString(),
    }));

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
