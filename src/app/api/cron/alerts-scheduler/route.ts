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
// ✅ EL AGUJERO DE LA COLA YA SE ARREGLO (2026-09-13, `engine.ts:140`).
//
// Este comentario decia que NO se arreglaba aca y describia el bug como
// abierto: `evaluateRule` hacia `if (!result.triggered) return null` ANTES de
// actualizar `nextFireAt`, asi que una regla de schedule que no dispara nunca
// avanzaba su proxima fecha — quedaba `dueNow` para siempre y, por el ORDER
// BY, se quedaba a la cabeza de la cola tapando a las de atras.
//
// **Esa misma branch lo arreglo**: `engine.ts:140-151` reprograma
// `nextFireAt` a `+REINTENTO_SIN_DISPARO_MS` cuando la regla no dispara, con
// su propio test (`engine-cola.test.ts`, 10 casos). Las referencias de linea
// que citaba este parrafo —`engine.ts:118 vs :155`— ya no apuntan a nada.
//
// Se deja escrito porque un comentario que describe como abierto un bug
// cerrado manda a alguien a arreglar lo que ya esta hecho, o peor: a creer
// que las alertas de schedule estan rotas y no usarlas.
//
// ⚠️ Lo que SI sigue abierto: si `primitive.evaluate()` TIRA, el catch
// devuelve `null` sin pasar por el bloque de reprogramacion. Una regla cuya
// primitive falla siempre (query rota, org sin conexion) sigue quedandose a la
// cabeza de la cola. Es el mismo starvation por el camino que quedo sin
// cubrir, y `engine-cola.test.ts` no tiene ningun caso donde `evaluate` tire.
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

    const completo = errors === 0 && !budgetHit;
    // A normal budget cutoff leaves pending work but is not a failed run.
    await registrarLatido("alerts-scheduler", errors === 0,
      errors === 0 ? undefined : `${errors} reglas fallidas; ${pending.length - evaluadas} pendientes`);
    return NextResponse.json({
      ok: errors === 0,
      completo,
      estado: errors > 0 ? "fallo-parcial" : budgetHit ? "pendiente" : "completo",
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
