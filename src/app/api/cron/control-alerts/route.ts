// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/cron/control-alerts
// ══════════════════════════════════════════════════════════════
// Corre los health checks del Centro de Control y envía email a Tomy
// si hay problemas. Se invoca desde Vercel Cron (ver vercel.json) con
// ?key=... para autenticarse, o manualmente con isInternalUser().
//
// Frecuencia recomendada: 1x cada 6h (4 veces al día). Ejecutar más seguido
// solo si queremos detección cuasi-real-time.
//
// Modo: por defecto solo envía si hay issues. `?force=1` envía siempre
// (útil para testear el template).
// ══════════════════════════════════════════════════════════════

import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import {
  checkConnectionIssues,
  checkStuckOnboardings,
  checkInactiveClients,
  checkJobsDeBackfillAtascados,
} from "@/lib/control/checks";
import { buildAlertEmailHtml } from "@/lib/control/email-template";
import { sendEmail } from "@/lib/email/send";
import { isInternalUser } from "@/lib/feature-flags";
import { destinatariosDeAlertas } from "@/lib/alertas/destinatarios";

export const dynamic = "force-dynamic";
// E-11: 300 y no 60. El limite viejo era el que mataba este cron cuando
// checkInactiveClients hacia dos queries por organizacion (ya no las hace, ver
// lib/control/checks.ts). Vercel cobra por tiempo ejecutado, no por el tope, asi
// que subirlo es red de seguridad gratis.
export const maxDuration = 300;

const CRON_KEY = ADMIN_API_KEY;
// E-19.3: la casilla se resuelve en un solo lugar y acepta varias.
// Sin ALERTAS_EMAILS ni ADMIN_EMAIL seteadas, es exactamente la de antes.

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const force = url.searchParams.get("force") === "1";
    const preview = url.searchParams.get("preview") === "1";

    // Auth: cron key o isInternalUser
    const hasKey = key === CRON_KEY;
    const internal = hasKey ? true : await isInternalUser();
    if (!internal) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Corre checks en paralelo
    const [connectionIssues, stuckOnboardings, inactiveClients, jobsAtascados] = await Promise.all([
      checkConnectionIssues(),
      checkStuckOnboardings(),
      checkInactiveClients(),
      // E-11 bis: el unico aviso de que el control de admision del backfill esta
      // frenando un alta. El runner devuelve HTTP 200 con admitido:false, asi
      // que sin esto nadie se entera nunca.
      checkJobsDeBackfillAtascados(),
    ]);

    const errorCount = connectionIssues.filter((i) => i.level === "error").length;
    const warnCount = connectionIssues.filter((i) => i.level === "warn").length;
    const totalIssues =
      errorCount + warnCount + stuckOnboardings.length + inactiveClients.length +
      jobsAtascados.length;

    const appUrl = process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
    const { subject, html } = buildAlertEmailHtml({
      connectionIssues,
      stuckOnboardings,
      inactiveClients,
      jobsAtascados,
      appUrl,
    });

    // Preview mode: devolver HTML para ver en el browser
    if (preview) {
      return new NextResponse(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Si no hay issues y no es force, skip el email
    if (totalIssues === 0 && !force) {
      return NextResponse.json({
        ok: true,
        sent: false,
        reason: "no-issues",
        totalIssues: 0,
      });
    }

    // Envía el email
    const result = await sendEmail({
      to: destinatariosDeAlertas(),
      subject,
      html,
    });

    return NextResponse.json({
      ok: true,
      sent: result.ok,
      emailId: result.id,
      error: result.error,
      counts: {
        connectionErrors: errorCount,
        connectionWarns: warnCount,
        stuckOnboardings: stuckOnboardings.length,
        inactiveClients: inactiveClients.length,
        total: totalIssues,
      },
    });
  } catch (error: any) {
    console.error("[cron/control-alerts] error:", error);
    return NextResponse.json(
      { error: error.message || "Error" },
      { status: 500 }
    );
  }
}
