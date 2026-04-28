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

import { NextRequest, NextResponse } from "next/server";
import {
  checkConnectionIssues,
  checkStuckOnboardings,
  checkInactiveClients,
} from "@/lib/control/checks";
import { buildAlertEmailHtml } from "@/lib/control/email-template";
import { sendEmail } from "@/lib/email/send";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_KEY = "nitrosales-secret-key-2024-production";
const ADMIN_EMAIL = "tlapidus@99media.com.ar";

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
    const [connectionIssues, stuckOnboardings, inactiveClients] = await Promise.all([
      checkConnectionIssues(),
      checkStuckOnboardings(),
      checkInactiveClients(),
    ]);

    const errorCount = connectionIssues.filter((i) => i.level === "error").length;
    const warnCount = connectionIssues.filter((i) => i.level === "warn").length;
    const totalIssues =
      errorCount + warnCount + stuckOnboardings.length + inactiveClients.length;

    const appUrl = process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
    const { subject, html } = buildAlertEmailHtml({
      connectionIssues,
      stuckOnboardings,
      inactiveClients,
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
      to: ADMIN_EMAIL,
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
