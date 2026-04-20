// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/cron/alerts-scheduler — Fase 8g-4
// ═══════════════════════════════════════════════════════════════════
// Vercel cron que corre cada 15 minutos.
// Dispara las reglas type=schedule cuyo nextFireAt llegó.
//
// Para cada rule pendiente:
//   1. Llama primitive.evaluate()
//   2. Si triggered: actualiza lastFiredAt + nextFireAt + manda email
//      (toda esa logica vive en engine.evaluateRule)
//
// La key de seguridad evita que cualquiera dispare el cron desde fuera
// de Vercel. Mismo patrón que /api/sync, /api/cron/anomalies, etc.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { loadAllPendingSchedules, evaluateRule } from "@/lib/alerts/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  // Auth: aceptamos tanto la query key (Vercel cron pasa esto) como el
  // header Vercel-Cron-Signature en el futuro si activamos firma.
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const isVercelCron = req.headers.get("user-agent")?.includes("vercel-cron");

  if (key !== CRON_KEY && !isVercelCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  let rulesEvaluated = 0;
  let alertsFired = 0;
  let errors = 0;
  const results: Array<{ ruleId: string; name: string; fired: boolean; error?: string }> = [];

  try {
    const pending = await loadAllPendingSchedules();
    rulesEvaluated = pending.length;

    // Procesamos secuencialmente para no saturar la DB ni Resend
    // (15 min de margen para schedules es de sobra)
    for (const rule of pending) {
      try {
        const alert = await evaluateRule(rule);
        const fired = alert !== null;
        if (fired) alertsFired++;
        results.push({ ruleId: rule.id, name: rule.name, fired });
      } catch (e: any) {
        errors++;
        results.push({
          ruleId: rule.id,
          name: rule.name,
          fired: false,
          error: e?.message ?? String(e),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      rulesEvaluated,
      alertsFired,
      errors,
      results,
    });
  } catch (error: any) {
    console.error("[cron/alerts-scheduler] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: String(error?.message ?? error),
        durationMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
