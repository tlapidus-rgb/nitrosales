// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/onboardings/[id]/approve-backfill
// ══════════════════════════════════════════════════════════════
// Segunda aprobación del flow: Tomy revisa que el wizard del cliente
// esté OK y dispara los backfill jobs.
//
// Estado: NEEDS_INFO → BACKFILLING.
// Crea backfill jobs para VTEX y MERCADOLIBRE (con sus respectivos
// rangos guardados en el onboarding_request).
// Manda email al cliente avisando que arrancó el backfill.
// ══════════════════════════════════════════════════════════════

import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { createBackfillJob } from "@/lib/backfill/job-manager";
import { sendEmail } from "@/lib/email/send";
import { backfillStartedEmailActive } from "@/lib/onboarding/emails";
import { waitUntil } from "@vercel/functions";
// El incidente del 2026-09-06: `NEXTAUTH_URL` está configurada en Vercel para
// TODOS los entornos con el valor de producción, así que un preview que se
// auto-invocaba salía a producción. `selfFetchBaseUrl` resuelve el origin real.
import { selfFetchBaseUrl } from "@/lib/self-fetch";

export const dynamic = "force-dynamic";

const BACKFILL_RUNNER_KEY = ADMIN_API_KEY;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    // S59: body opcional con { platforms: ["VTEX", "MERCADOLIBRE", ...] }
    // Si no viene → comportamiento actual (todas las plataformas con creds).
    // Si viene → solo crea jobs para las plataformas listadas.
    let selectedPlatforms: Set<string> | null = null;
    try {
      const text = await req.text();
      const body = text.trim() ? JSON.parse(text) : {};
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
      if (body.platforms !== undefined) {
        if (!Array.isArray(body.platforms) || body.platforms.length === 0 ||
            !body.platforms.every((p: unknown) => typeof p === "string" && p.trim())) throw new Error("Invalid selection");
        selectedPlatforms = new Set(body.platforms.map((p: string) => p.trim().toUpperCase()));
      }
    } catch {
      return NextResponse.json({ error: "Selección inválida. Indicá al menos una plataforma, o omití platforms para seleccionar todas." }, { status: 400 });
    }

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
      id
    );
    const ob = rows[0];
    if (!ob) {
      return NextResponse.json({ error: "Onboarding request no encontrado" }, { status: 404 });
    }
    if (!ob.createdOrgId) {
      return NextResponse.json({ error: "El onboarding aún no fue activado (sin org)" }, { status: 400 });
    }
    if (ob.status === "BACKFILLING") {
      return NextResponse.json({ error: "Backfill ya está corriendo" }, { status: 409 });
    }
    if (ob.status === "ACTIVE") {
      return NextResponse.json({ error: "Onboarding ya está completado" }, { status: 409 });
    }
    if (ob.status !== "NEEDS_INFO") {
      return NextResponse.json(
        { error: `El onboarding está en ${ob.status}, no se puede aprobar backfill (debe estar NEEDS_INFO)` },
        { status: 400 }
      );
    }

    // Verificar que haya al menos una connection PENDING con credenciales reales
    const connections = await prisma.connection.findMany({
      where: { organizationId: ob.createdOrgId },
      select: { id: true, platform: true, status: true, credentials: true },
    });
    if (connections.length === 0) {
      return NextResponse.json(
        { error: "No hay conexiones configuradas (el cliente no completó el wizard)" },
        { status: 400 }
      );
    }
    if (selectedPlatforms && [...selectedPlatforms].some(p => !connections.some(c => c.platform === p))) {
      return NextResponse.json({ error: "La selección incluye una plataforma sin conexión configurada." }, { status: 400 });
    }

    // Marcar connections como ACTIVE si están listas para sincronizar.
    // Para OAuth (ML/Google Ads): ACTIVE solo si ya hay tokens (accessToken/mlUserId).
    // Para el resto: ACTIVE directo.
    // ⚠️ SE DECIDE ANTES DE ESCRIBIR (R-28).
    //
    // El orden era: poner todas las conexiones en ACTIVE → crear los jobs →
    // si no se creó ninguno, cortar con 409. O sea que el 409 dejaba la
    // organización **enrolada en la rotación de siete crons**
    // (`vtex-sync-recent`, `attribution-reconcile`, `ml-sync`,
    // `ml-missed-feeds`, `sync/chain`, `sync/ean-backfill`,
    // `sync/cost-prices`, que filtran por `status: ACTIVE` sin mirar el
    // onboarding) con el alta SIN aprobar. Y reaprobar no lo revierte.
    //
    // Un alta que el admin no pudo aprobar empezaba a consumir la base igual.
    //
    // La condición de abajo es la misma que decide si se crean jobs, unas
    // líneas más abajo: hay algo que backfillear si existe una conexión de
    // VTEX o de MELI, incluida en la selección, y con meses > 0.
    const hayVtexParaBackfill =
      (!selectedPlatforms || selectedPlatforms.has("VTEX")) &&
      Number(ob.historyVtexMonths) > 0 &&
      connections.some((c) => c.platform === "VTEX" && !(c.credentials as any)?.needsSetup);
    const hayMlParaBackfill =
      (!selectedPlatforms || selectedPlatforms.has("MERCADOLIBRE")) &&
      Number(ob.historyMlMonths) > 0 &&
      connections.some(
        (c) => c.platform === "MERCADOLIBRE" && !(c.credentials as any)?.needsSetup && (c.credentials as any)?.accessToken && (c.credentials as any)?.mlUserId,
      );

    if (!hayVtexParaBackfill && !hayMlParaBackfill) {
      return NextResponse.json(
        {
          error: "No hay nada que backfillear.",
          detalle:
            "El cliente no tiene una conexión utilizable de VTEX ni de MercadoLibre, " +
            "o los meses de historia quedaron en 0. Revisá las credenciales y la " +
            "selección de plataformas antes de aprobar.",
          nota: "No se modificó ninguna conexión: la organización sigue como estaba.",
          onboardingId: ob.id,
        },
        { status: 409 },
      );
    }

    // Serialize approvals for the organization and commit connections, jobs
    // and onboarding together. A rejected/failed approval leaves no enrollment.
    const createdJobs = await prisma.$transaction(async tx => {
      const orgLock = await tx.$queryRawUnsafe('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', ob.createdOrgId);
      const locked = await tx.$queryRawUnsafe('SELECT status, "createdOrgId" FROM onboarding_requests WHERE id = $1 FOR UPDATE', ob.id);
      if (!orgLock.length || locked[0]?.status !== "NEEDS_INFO" || locked[0]?.createdOrgId !== ob.createdOrgId) throw Object.assign(new Error("El onboarding cambió durante la aprobación"), { status: 409 });
    for (const c of connections) {
      const creds = (c.credentials as any) || {};
      if (creds.needsSetup || (selectedPlatforms && !selectedPlatforms.has(c.platform))) continue;

      let newStatus: "ACTIVE" | "PENDING" = "ACTIVE";
      if (c.platform === "MERCADOLIBRE") {
        // Tiene tokens del OAuth callback? Entonces ACTIVE. Si no, queda PENDING.
        newStatus = creds.accessToken && creds.mlUserId ? "ACTIVE" : "PENDING";
      } else if (c.platform === "GOOGLE_ADS") {
        newStatus = creds.accessToken ? "ACTIVE" : "PENDING";
      }

      await tx.connection.update({
        where: { id: c.id },
        data: { status: newStatus as any, lastSyncError: null },
      });
    }

    // Crear backfill jobs (VTEX + ML, los que tengan months > 0)
    const createdJobs: string[] = [];

    const vtexConn = connections.find((c) => c.platform === "VTEX");
    const vtexMonths = Number(ob.historyVtexMonths) || 0;
    const includeVtex = !selectedPlatforms || selectedPlatforms.has("VTEX");
    if (vtexConn && hayVtexParaBackfill) {
      // Verificar que no haya un job activo
      const existing = await tx.$queryRawUnsafe<Array<any>>(
        `SELECT "id" FROM "backfill_jobs"
         WHERE "organizationId" = $1 AND "platform" = 'VTEX'
           AND "status" IN ('QUEUED', 'RUNNING') LIMIT 1`,
        ob.createdOrgId
      );
      if (existing.length === 0) {
        const jobId = await createBackfillJob({
          organizationId: ob.createdOrgId,
          platform: "VTEX",
          monthsRequested: vtexMonths,
          onboardingRequestId: ob.id,
        }, tx);
        createdJobs.push(`VTEX:${jobId}`);
      }
    }

    const mlConn = connections.find((c) => c.platform === "MERCADOLIBRE");
    const mlMonths = Number(ob.historyMlMonths) || 0;
    const includeMl = !selectedPlatforms || selectedPlatforms.has("MERCADOLIBRE");
    if (mlConn && hayMlParaBackfill) {
      const existing = await tx.$queryRawUnsafe<Array<any>>(
        `SELECT "id" FROM "backfill_jobs"
         WHERE "organizationId" = $1 AND "platform" = 'MERCADOLIBRE'
           AND "status" IN ('QUEUED', 'RUNNING') LIMIT 1`,
        ob.createdOrgId
      );
      if (existing.length === 0) {
        const jobId = await createBackfillJob({
          organizationId: ob.createdOrgId,
          platform: "MERCADOLIBRE",
          monthsRequested: mlMonths,
          onboardingRequestId: ob.id,
        }, tx);
        createdJobs.push(`ML:${jobId}`);
      }
    }

    // ⚠️ SIN JOBS NO HAY BACKFILL (revisión del 2026-09-07).
    // Antes esto marcaba BACKFILLING y mandaba el mail "ya arrancamos"
    // INCONDICIONALMENTE, aunque no se hubiera creado un solo job — pasa con un
    // cliente que no conectó ni VTEX ni ML, o al que se le pusieron los meses de
    // historia en 0.
    //
    // Del otro lado, `areAllJobsComplete` devuelve `total > 0 && pending === 0`,
    // así que con cero jobs da false; y además sólo se evalúa cuando un job
    // completa, cosa que nunca pasaba. Resultado: el cliente recibía el mail
    // "ya arrancamos", entraba, y veía "preparando tu data — 0%" PARA SIEMPRE.
    //
    // Ahora se corta acá y se le dice al admin qué falta, en vez de dejar al
    // cliente esperando algo que no existe.
    // Red de seguridad. El caso normal ya se atajó arriba, ANTES de escribir
    // nada; si se llega acá es porque `createBackfillJob` falló o porque
    // había un job vivo para las dos plataformas. Lanzar revierte también
    // las conexiones: ningún rechazo deja una aprobación parcial.
    if (createdJobs.length === 0) throw Object.assign(new Error("No se creó ningún job de backfill. Revisá los jobs activos de VTEX y MercadoLibre, la selección y los meses de historia. No se modificó ninguna conexión."), { status: 409 });

    // Status onboarding → BACKFILLING
    await tx.$executeRawUnsafe(
      `UPDATE "onboarding_requests"
       SET "status" = 'BACKFILLING'::"OnboardingStatus",
           "progressStage" = 'backfilling',
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      ob.id
    );

      return createdJobs;
    }, { isolationLevel: "ReadCommitted", timeout: 15000, maxWait: 5000 });
    const mlConn = connections.find(c => c.platform === "MERCADOLIBRE");
    const includeMl = !selectedPlatforms || selectedPlatforms.has("MERCADOLIBRE");

    // Email al cliente
    const tpl = await backfillStartedEmailActive({
      contactName: ob.contactName,
      companyName: ob.companyName,
    });
    // CRÍTICO: waitUntil para que Vercel no mate la función antes de que
    // el email llegue a Resend.
    waitUntil(
      sendEmail({
        to: ob.contactEmail,
        subject: tpl.subject,
        html: tpl.html,
        context: "backfill.started",
      }).catch((err) => console.error("[approve-backfill] client email failed:", err?.message))
    );

    // Trigger inmediato del runner: no esperar al proximo tick del cron (1 min).
    // Disparamos el runner en background para que arranque a procesar AHORA.
    // waitUntil mantiene la funcion alive despues de responder 200 al admin.
    //
    // E-08: este trigger puede volver 200 con admitido:false y NO arrancar nada
    // — si estamos fuera de BACKFILL_VENTANA, si ya hay otro backfill corriendo,
    // o si la base esta lenta. No es una falla: los jobs quedan en QUEUED y el
    // cron de cada minuto los toma cuando se pueda. Si estas debugueando "aprobe
    // y no arranco", mira el campo `motivo` de la respuesta del runner.
    const baseUrl = selfFetchBaseUrl(req.nextUrl.origin);
    if (createdJobs.length > 0) {
      const runnerUrl = `${baseUrl}/api/cron/backfill-runner?key=${encodeURIComponent(BACKFILL_RUNNER_KEY)}`;
      waitUntil(
        fetch(runnerUrl, { method: "GET" })
          .then((r) => console.log(`[approve-backfill] runner triggered: HTTP ${r.status}`))
          .catch((err) => console.error(`[approve-backfill] runner trigger failed: ${err.message}`))
      );
    }

    // Bootstrap de ML: listings + reputation + questions (multi-tenant safe).
    // Orders NO acá, las trae el backfill v2. Corre en paralelo al runner.
    // S59: solo si ML estaba en la seleccion (o si no hay seleccion = todas).
    if (mlConn && (mlConn.credentials as any)?.accessToken && includeMl) {
      const bootUrl =
        `${baseUrl}/api/sync/mercadolibre/bootstrap` +
        `?orgId=${encodeURIComponent(ob.createdOrgId)}&key=${encodeURIComponent(BACKFILL_RUNNER_KEY)}`;
      waitUntil(
        fetch(bootUrl, { method: "GET" })
          .then((r) => console.log(`[approve-backfill] ml-bootstrap triggered: HTTP ${r.status}`))
          .catch((err) => console.error(`[approve-backfill] ml-bootstrap failed: ${err.message}`))
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Backfill aprobado para ${ob.companyName}. Jobs creados: ${createdJobs.length}`,
      jobs: createdJobs,
      orgId: ob.createdOrgId,
      runnerTriggered: createdJobs.length > 0,
    });
  } catch (error: any) {
    console.error("[admin/onboardings/approve-backfill] error:", error);
    return NextResponse.json({ error: error.message }, { status: error.status === 409 ? 409 : 500 });
  }
}
