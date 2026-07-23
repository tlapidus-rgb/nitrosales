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
import {
  buildRollupSideSql,
  buildRawSideSql,
  compareCoherence,
  formatCoherenceSummary,
  type CoherenceRow,
} from "@/lib/pipeline/coherence";

/**
 * Último día efectivamente reconstruido en esta invocación. El cursor apunta al
 * SIGUIENTE día pendiente, así que el reconstruido es el anterior; si no avanzó,
 * se cae a `to`. Se chequea un día que acabamos de escribir, no uno cualquiera.
 */
function lastDayReconstructed(
  calls: Array<{ cursor: string; daysProcessed: number }>,
  cursor: string,
  to: string
): string {
  if (calls.length === 0 || calls.every((c) => !c.daysProcessed)) return to;
  const d = new Date(`${cursor}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const prev = d.toISOString().slice(0, 10);
  return prev >= calls[0].cursor ? prev : to;
}

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
// 660s de 800 disponibles. Bajado de 720s el 2026-07-21: el chequeo de coherencia
// que se agregó al final (escanea pixel_events de un día) se comía el margen y la
// función daba 504 SIN DEVOLVER NADA — o sea sin cursor para reanudar, que es el
// peor resultado posible en un proceso resumible.
const INVOCATION_BUDGET_MS = 660_000;
// No arrancar otra tanda si no queda al menos esto. Subido de 60s: los días
// recientes tardan ~80-100s cada uno (más tráfico), así que arrancar una tanda
// con 60s de margen garantizaba pasarse.
const MIN_SLICE_MS = 120_000;
// Presupuesto reservado para el auto-chequeo de coherencia del final. Si no
// queda, se saltea: es diagnóstico, y perder el diagnóstico es infinitamente
// mejor que perder el cursor de reanudación.
const COHERENCE_RESERVE_MS = 90_000;

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
  // Auth: SÓLO por key. El bypass por `user-agent: vercel-cron` (spoofeable) se
  // quitó (auditoría 2026-07-22): Vercel Cron manda la key en vercel.json.
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Origen de la invocación — header CONFIABLE: Vercel lo agrega en los crons y
  // lo strippea de requests externas, así que NO es spoofeable como el
  // user-agent. NO se usa para auth (eso es la key); sólo decide si se aceptan
  // los overrides manuales `?from=`/`?cursor=` (recálculo de historia a mano):
  // en una invocación de Vercel se ignoran y se usa el rango default.
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";

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

  // Override manual del rango (?from=YYYY-MM-DD), solo con ADMIN key — el cron
  // de Vercel nunca lo manda. Existe para RE-CALCULAR historia a mano cuando
  // cambia la lógica del rollup y hay que propagarla hacia atrás: pasó al
  // resolver el productId por nombre (2026-07-18), que recupera el 46% de
  // eventos sin id pero solo desde la corrida siguiente.
  // Tope de 180 días para no escanear historia infinita de un saque; es
  // resumible, así que rangos largos se completan en varias llamadas.
  const fromParam = url.searchParams.get("from");
  const manualRange = !isVercelCron && fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam);
  if (manualRange) {
    const hardFloor = arDate(180);
    from = fromParam < hardFloor ? hardFloor : fromParam;
  }

  // ── Reanudación entre invocaciones (fix 2026-07-21) ────────────────────────
  // El backfill es resumible por día y avanza el cursor DENTRO de una invocación,
  // pero `cursor` arrancaba SIEMPRE en `from`. Si el rango no entraba en el
  // presupuesto (720s), volver a abrir el mismo link rehacía los mismos primeros
  // días y NUNCA llegaba a los recientes — por muchas veces que se corriera.
  // Se descubrió reconstruyendo 40 días para TeVe Compras: el rollup mejoraba un
  // poco y se clavaba.
  //
  // Ahora `?cursor=YYYY-MM-DD` continúa donde quedó. La respuesta devuelve el
  // `resume` listo para pegar, así no hay que deducirlo del array `calls`.
  // Es la misma clase de bug que el `pending` del cron de first-source: una
  // operación resumible cuyo mecanismo de reanudación no se estaba usando.
  const cursorParam = url.searchParams.get("cursor");
  const manualCursor =
    !isVercelCron && cursorParam && /^\d{4}-\d{2}-\d{2}$/.test(cursorParam)
      ? cursorParam
      : null;

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
  // Arranca en el cursor explícito si vino (y cae dentro del rango); si no, en `from`.
  let cursor = manualCursor && manualCursor >= from && manualCursor <= to ? manualCursor : from;
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

  // ── Auto-chequeo: ¿lo que acabo de reconstruir dice lo mismo que el crudo? ──
  // Se agrega acá y no en warm-cache porque este es el proceso que ESCRIBE el
  // rollup: verificar lo propio inmediatamente después es más barato y más
  // directo que descubrirlo dos semanas más tarde por un cliente.
  //
  // Nace del bug del 2026-07-21: `pixel_daily_source` tenía 10.315 visitantes
  // donde el crudo tenía 104.454 (TeVe Compras). Las alertas de frescura NO lo
  // agarraban porque `refreshed_at` estaba al día — el cron corría puntual y
  // escribía basura. Tabla fresca, contenido viejo.
  //
  // Se mide UN día (el último reconstruido): si el pipeline está roto se ve en
  // cualquiera, y así la query queda acotada.
  let coherence: CoherenceRow[] = [];
  let coherenceSkipped = false;
  try {
    // Sólo si sobra tiempo. El 2026-07-21 este chequeo hizo dar 504 a la función
    // al correr después de un loop que ya había agotado su presupuesto.
    if (Date.now() - startedAt > INVOCATION_BUDGET_MS - COHERENCE_RESERVE_MS) {
      coherenceSkipped = true;
      throw new Error("sin presupuesto para el chequeo de coherencia");
    }
    const checkDay = lastDayReconstructed(calls, cursor, to);
    const [rollupSide, rawSide] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ org: string; visitors: number }>>(
        buildRollupSideSql(),
        checkDay
      ),
      prisma.$queryRawUnsafe<Array<{ org: string; visitors: number }>>(
        buildRawSideSql(),
        checkDay
      ),
    ]);
    coherence = compareCoherence(checkDay, rollupSide, rawSide);
    const bad = coherence.filter((c) => c.incoherent);
    if (bad.length > 0) {
      console.error(
        `[refresh-pixel-rollups] ⚠️ ROLLUP INCOHERENTE:\n${formatCoherenceSummary(coherence)}`
      );
    }
  } catch {
    /* diagnóstico: si falla no invalida el rebuild que sí se hizo */
  }
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
      startedAtCursor: manualCursor || from,
      // Dónde quedó. Si no está `done`, hay que volver a llamar CON esto: sin el
      // cursor la próxima invocación reempieza en `from` y rehace lo mismo.
      nextCursor: done || error ? null : cursor,
      resume:
        done || error
          ? null
          : `GET /api/cron/refresh-pixel-rollups?key=<ADMIN_API_KEY>&from=${from}&cursor=${cursor}`,
      daysBack: DAYS_BACK,
      daysProcessed,
      // Auto-chequeo del día recién reconstruido: rollup vs crudo. `incoherent`
      // en true = el rollup se escribió mal (no que esté viejo — para eso están
      // las alertas de frescura). Ver src/lib/pipeline/coherence.ts.
      coherence,
      // true = no había presupuesto y se salteó. NO significa que esté todo bien:
      // significa que no se miró.
      coherenceSkipped,
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
