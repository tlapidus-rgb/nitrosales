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

import { registrarLatido } from "@/lib/cron/latido";
import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { loadAllPendingSchedules, evaluateRule } from "@/lib/alerts/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// E-11 — este cron NO tenia presupuesto de tiempo: evaluaba TODAS las reglas
// pendientes de TODAS las organizaciones en una sola invocacion. A ~5s por
// regla, con 60 reglas pendientes se pasa del maxDuration, Vercel lo mata y no
// devuelve nada: ni las que evaluo, ni las que faltan, ni el error. Y un 5XX en
// un cron no dispara ninguna alerta de Vercel.
//
// NO lleva cursor, a proposito. La cola ya se ordena por `nextFireAt ASC NULLS
// FIRST` y una regla que dispara avanza su `nextFireAt` y sale de la lista: las
// que quedan sin evaluar siguen siendo las mas atrasadas y entran primero en la
// proxima corrida. El orden ES el cursor.
//
// ⚠️ PERO HAY UN AGUJERO EN ESA PREMISA, y no se arregla aca porque cambia
// semantica de alertas: `evaluateRule` hace `if (!result.triggered) return null`
// ANTES de actualizar `nextFireAt` (engine.ts:118 vs :155). O sea que una regla
// de schedule que NO dispara nunca avanza su proxima fecha: queda `dueNow` para
// siempre, se re-evalua en cada corrida y —por el ORDER BY— se queda a la
// cabeza de la cola tapando a las de atras. Con varios clientes, un punado de
// reglas que nunca disparan alcanza para que las demas no se evaluen nunca.
// Arreglarlo significa decidir si una regla diaria que no dispara a las 09:00
// se re-chequea a las 09:15 (hoy) o recien al dia siguiente. Es una decision de
// producto. Ver PLAN_EXPANSION.md, E-11.
const TIME_BUDGET_MS = 250_000;

const CRON_KEY = ADMIN_API_KEY;

export async function GET(req: NextRequest) {
  // Auth: aceptamos tanto la query key (Vercel cron pasa esto) como el
  // header Vercel-Cron-Signature en el futuro si activamos firma.
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  // Auth: SÓLO por key (Vercel Cron la manda en la URL de vercel.json). El
  // bypass por `user-agent: vercel-cron` se quitó (auditoría 2026-07-22): el
  // user-agent lo pone quien llama, así que cualquiera con `curl -A vercel-cron`
  // pasaba sin key — y este cron manda mails a los clientes.
  if (key !== CRON_KEY) {
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
    let budgetHit = false;
    let evaluadas = 0;
    for (const rule of pending) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) { budgetHit = true; break; }
      evaluadas++;
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

    await registrarLatido("alerts-scheduler", true);
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      // `rulesEvaluated` es cuantas estaban pendientes; `evaluadas` cuantas se
      // llegaron a mirar. Si difieren, el presupuesto corto y las que faltan
      // entran primero en la proxima corrida (van ordenadas por atraso).
      evaluadas,
      budgetHit,
      rulesEvaluated,
      alertsFired,
      errors,
      results,
    });
  } catch (error: any) {
    await registrarLatido("alerts-scheduler", false, String((error as any)?.message ?? "error"));
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
