// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/onboardings/[id]/add-backfill-platform
// ══════════════════════════════════════════════════════════════
// Agrega una plataforma al backfill cuando ya se aprobó el inicial
// con plataformas selectivas. Por ejemplo, aprobamos solo VTEX al
// principio y después queremos correr ML también.
//
// Body: { platform: "VTEX" | "MERCADOLIBRE", monthsBack?: number }
// monthsBack es opcional — si no viene, usa el guardado en
// onboarding_request (historyVtexMonths o historyMlMonths).
//
// Funciona en cualquier estado (BACKFILLING, READY_FOR_REVIEW, ACTIVE)
// — útil para "rebackfillear" plataformas en clientes ya activos.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { createBackfillJob } from "@/lib/backfill/job-manager";
import { waitUntil } from "@vercel/functions";

export const dynamic = "force-dynamic";

const BACKFILL_RUNNER_KEY = "nitrosales-secret-key-2024-production";
const VALID_PLATFORMS = new Set(["VTEX", "MERCADOLIBRE"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const platform = String(body?.platform || "").toUpperCase();
    const monthsOverride = body?.monthsBack ? Number(body.monthsBack) : null;

    if (!VALID_PLATFORMS.has(platform)) {
      return NextResponse.json({ error: `platform debe ser ${[...VALID_PLATFORMS].join(" o ")}` }, { status: 400 });
    }

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
      id,
    );
    const ob = rows[0];
    if (!ob) return NextResponse.json({ error: "Onboarding no encontrado" }, { status: 404 });
    if (!ob.createdOrgId) return NextResponse.json({ error: "Onboarding sin org" }, { status: 400 });

    // Verificar que tenga connection con creds
    const conn = await prisma.connection.findFirst({
      where: { organizationId: ob.createdOrgId, platform: platform as any },
    });
    if (!conn) {
      return NextResponse.json({ error: `No hay conexión ${platform} configurada` }, { status: 400 });
    }

    const creds = (conn.credentials as any) || {};
    if (platform === "VTEX" && (!creds.accountName || !creds.appKey || !creds.appToken)) {
      return NextResponse.json({ error: "VTEX sin credenciales completas" }, { status: 400 });
    }
    if (platform === "MERCADOLIBRE" && (!creds.accessToken || !creds.mlUserId)) {
      return NextResponse.json({ error: "ML sin OAuth completo" }, { status: 400 });
    }

    // Verificar que no haya un job activo de esa plataforma
    const existing = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "id" FROM "backfill_jobs"
       WHERE "organizationId" = $1 AND "platform" = $2::"Platform"
         AND "status" IN ('QUEUED', 'RUNNING') LIMIT 1`,
      ob.createdOrgId,
      platform,
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: `Ya hay un backfill activo de ${platform}` }, { status: 409 });
    }

    const months = monthsOverride
      ?? Number(platform === "VTEX" ? ob.historyVtexMonths : ob.historyMlMonths)
      ?? 12;

    if (months <= 0) {
      return NextResponse.json({ error: "monthsBack debe ser > 0" }, { status: 400 });
    }

    // Crear el job
    const jobId = await createBackfillJob({
      organizationId: ob.createdOrgId,
      platform: platform as any,
      monthsRequested: months,
      onboardingRequestId: ob.id,
    });

    // Trigger el runner
    const baseUrl = process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
    const runnerUrl = `${baseUrl}/api/cron/backfill-runner?key=${encodeURIComponent(BACKFILL_RUNNER_KEY)}`;
    waitUntil(
      fetch(runnerUrl, { method: "GET" })
        .then((r) => console.log(`[add-backfill-platform] runner triggered: HTTP ${r.status}`))
        .catch((err) => console.error(`[add-backfill-platform] runner trigger failed: ${err.message}`)),
    );

    return NextResponse.json({
      ok: true,
      message: `Backfill de ${platform} agregado para ${ob.companyName}.`,
      jobId,
      monthsBack: months,
    });
  } catch (err: any) {
    console.error("[add-backfill-platform] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
