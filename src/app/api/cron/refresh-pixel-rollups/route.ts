// @ts-nocheck
// ══════════════════════════════════════════════════════════════════════════
// GET /api/cron/refresh-pixel-rollups
// ══════════════════════════════════════════════════════════════════════════
// Mantiene los rollups HLL del pixel AL DÍA. Las 7 tablas rollup
// (pixel_daily_aggregates/_device/_type/_page/_product/_source) las llena el
// backfill manual (`/api/admin/setup-pixel-rollups?phase=backfill`), pero NADIE
// las refrescaba: quedaban congeladas en la fecha del último backfill manual y
// /pixel/analytics mostraba 0 en los días nuevos (detectado 2026-06-14: 13 y
// 14-jun en 0; ver BP-ROLLUP-REFRESH). Este cron reconstruye los últimos N días
// cada 2 horas para que el rollup nunca se atrase.
//
// ── Diseño ──────────────────────────────────────────────────────────────────
//  • REUTILIZA la lógica validada: hace self-fetch a
//    `POST /api/admin/setup-pixel-rollups?phase=backfill&from&to` (cero
//    duplicación de SQL; mismo upsert <2% error ya testeado). Mismo patrón de
//    self-fetch que /api/cron/warm-cache.
//  • IDEMPOTENTE: el backfill upsertea con ON CONFLICT DO UPDATE → correr esto
//    N veces re-escribe los mismos valores, nunca duplica ni rompe.
//  • CUBRE GAPS: reconstruye los últimos `DAYS_BACK` días (default 3), así si el
//    cron falló unas horas/un día, el siguiente run tapa el hueco solo.
//  • RESUMIBLE: sigue el `nextCursor` del backfill hasta done:true (3 días
//    entran en 1 sola llamada — ~110s medido en prod —, pero el loop cubre el
//    caso de que el presupuesto de 250s del setup corte antes).
//
// Schedule: cada 2 h (vercel.json: `0 */2 * * *`).
// Auth: header `user-agent: vercel-cron` (Vercel) o `?key=<ADMIN_API_KEY>`
//       (igual que el resto de los crons; vercel.json manda la key literal).
//
// ⚠️ LIMITACIÓN CONOCIDA (first-source): el rollup `pixel_daily_source`
// (atribución por canal) JOINea contra `pixel_visitor_first_source`, que es
// first-touch INMUTABLE y se reconstruye en `phase=first-source` (scan de
// historia completa, pesado). Este cron NO refresca first-source. Resultado:
// visitantes BRAND-NEW de los últimos días que NUNCA aparecieron antes pueden
// faltar del breakdown `bySource` hasta el próximo first-source. Los demás
// rollups (aggregates/device/type/page/product) SÍ los cuentan. Para cerrar ese
// gap, agendar un refresh de first-source MENOS frecuente (ej: 1×/día) — ver
// BACKLOG_PENDIENTES.md → BP-ROLLUP-REFRESH (follow-up). No se mete acá para no
// cargar un scan de historia completa en un cron de 2 h.
// ══════════════════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { runRollupBackfill } from "@/lib/pixel/rollup-backfill";

export const dynamic = "force-dynamic";
// 800s (Vercel Pro/Fluid, igual que el cron hermano refresh-pixel-first-source).
// Antes 300s: al crecer pixel_events, la ventana de 3 días (×orgs ×7 statements HLL,
// 2 con JOIN a first-source) dejó de entrar en un pase → 504 (FUNCTION_INVOCATION_TIMEOUT).
export const maxDuration = 800;

// Presupuesto COMPARTIDO de la invocación (todas las llamadas al backfill suman
// contra este tope, con margen bajo maxDuration). BUG PREVIO: el loop llamaba a
// runRollupBackfill hasta MAX_CALLS veces y CADA llamada reseteaba su propio budget
// interno de 250s → 6×250s podía superar largo el maxDuration → 504. Ahora cada
// llamada recibe el tiempo RESTANTE como budget, garantizando que la función retorne
// antes del wall.
const INVOCATION_BUDGET_MS = 720_000; // 12 min de 13.3 disponibles (margen de cierre)
const MIN_SLICE_MS = 60_000; // no arrancar otra llamada si queda menos que esto

// Reconstruye HOY + los (DAYS_BACK-1) días previos (AR-date). 3 = cubre huecos
// de hasta 3 días con un solo run (tolerante a fallos del cron).
const DAYS_BACK = 3;
// AUTO-REPARABLE (2026-06-21, BP-ROLLUP-CRON): si el cron de Vercel se saltea
// ejecuciones por varios días (pasó del 16 al 21-jun: 5 días sin refresh, los
// gráficos en 0), `DAYS_BACK=3` NO tapa el hueco solo. Por eso, si el rollup
// quedó atrás del rango default, arrancamos `from` desde el último día presente
// (`MAX(day)`) y backfilleamos hasta hoy, con TOPE de seguridad de MAX_GAP_DAYS
// días para no escanear historia infinita en un run. El loop de cursor +
// runs sucesivos cada 2h cierran gaps grandes en pocas corridas.
const MAX_GAP_DAYS = 14;
// Tope de llamadas al backfill por run (3 días << este tope; evita loop infinito).
const MAX_CALLS = 6;

// Fecha AR (UTC-3) a medianoche, con offset de días hacia atrás. Mismo criterio
// AR que /api/cron/warm-cache y que el ARDAY del backfill.
function arDate(offsetDays = 0): string {
  const arNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  arNow.setUTCHours(0, 0, 0, 0);
  arNow.setUTCDate(arNow.getUTCDate() - offsetDays);
  return arNow.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const isVercelCron = req.headers.get("user-agent")?.includes("vercel-cron");
  if (!isVercelCron && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const startedAt = Date.now();
  const to = arDate(0); // hoy AR
  const defaultFrom = arDate(DAYS_BACK - 1); // hoy - (N-1): comportamiento normal
  const floorFrom = arDate(MAX_GAP_DAYS - 1); // tope: nunca más de MAX_GAP_DAYS días

  // Gap-aware: si el rollup quedó atrás del rango default (Vercel se salteó
  // ejecuciones), arrancamos desde el último día presente para tapar el hueco.
  // Las date strings YYYY-MM-DD comparan lexicográfico = cronológico.
  // Usamos el MAX(day) GLOBAL: el cron procesa todas las orgs juntas cada run,
  // así que cuando se corta, todas quedan en el mismo día (gap uniforme).
  let lastRollupDay: string | null = null;
  try {
    const mr = await prisma.$queryRawUnsafe<Array<{ d: string | null }>>(
      `SELECT MAX(day)::text AS d FROM pixel_daily_aggregates`
    );
    lastRollupDay = mr?.[0]?.d || null;
  } catch {
    // Si falla la lectura, caemos al comportamiento default (no romper el cron).
  }
  let from = defaultFrom;
  if (lastRollupDay && lastRollupDay < defaultFrom) from = lastRollupDay;
  if (from < floorFrom) from = floorFrom; // tope de seguridad

  // Llamada DIRECTA al runner del backfill (import + función), SIN self-fetch
  // HTTP. Antes esto era `fetch(${url.host}/api/admin/setup-pixel-rollups)` que,
  // cuando Vercel cron lo disparaba, apuntaba a la URL del deployment (protegida
  // por Deployment Protection) → 401 en 112ms. Llamando la función directo no hay
  // HTTP, ni URL, ni auth, ni protección. (BP-ROLLUP-CRON / Fix 1.)
  const calls: Array<{
    cursor: string;
    ok: boolean;
    done: boolean;
    daysProcessed: number;
    ms: number;
  }> = [];
  let cursor = from;
  let done = false;
  let error: string | null = null;

  for (let i = 0; i < MAX_CALLS; i++) {
    // Presupuesto restante de la invocación → se lo pasamos al backfill para que
    // corte a tiempo y la función retorne SIEMPRE antes del maxDuration (no 504).
    const remainingMs = INVOCATION_BUDGET_MS - (Date.now() - startedAt);
    if (remainingMs < MIN_SLICE_MS) break;
    let body: any;
    try {
      const r = await runRollupBackfill({ from, to, cursor, budgetMs: remainingMs });
      body = r.body;
    } catch (e: any) {
      error = `backfill failed: ${e?.message?.slice(0, 200)}`;
      break;
    }
    calls.push({
      cursor,
      ok: body?.ok === true,
      done: body?.done === true,
      daysProcessed: body?.daysProcessedThisCall ?? 0,
      ms: body?.ms ?? 0,
    });
    if (body?.ok === false) {
      error = (body?.error || "backfill devolvió ok:false")?.toString().slice(0, 200);
      break;
    }
    if (body?.done === true) {
      done = true;
      break;
    }
    // No terminó pero tampoco trae cursor de avance → cortar para no loopear.
    if (!body?.nextCursor || body.nextCursor === cursor) break;
    cursor = body.nextCursor;
  }

  // Días procesados en TODA la invocación (suma de las llamadas al backfill).
  const daysProcessed = calls.reduce((n, c) => n + (c.daysProcessed || 0), 0);
  // Estado HTTP:
  //  • error real (SQL/excepción)            → 500 (alarma legítima).
  //  • NO terminó pero hizo progreso (>0 días) → 200: es el multi-run esperado por
  //    diseño ("runs sucesivos cada 2h cierran gaps grandes"). NO es un fallo →
  //    no dispara mails de Vercel. El próximo run continúa desde el gap.
  //  • NO terminó y CERO progreso              → 500: cron trabado, vale alarmar.
  const madeProgress = done || daysProcessed > 0;
  const httpStatus = error || !madeProgress ? 500 : 200;

  return NextResponse.json(
    {
      ok: done && !error,
      progress: !done && !error && daysProcessed > 0, // avanzó pero falta (esperado)
      window: { from, to },
      daysBack: DAYS_BACK,
      daysProcessed,
      lastRollupDay,
      gapDays:
        lastRollupDay && lastRollupDay < defaultFrom
          ? `gap detectado desde ${lastRollupDay}`
          : null,
      done,
      callsCount: calls.length,
      calls,
      error,
      totalMs: Date.now() - startedAt,
    },
    { status: httpStatus }
  );
}
