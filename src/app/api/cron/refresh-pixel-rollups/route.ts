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
import {
  runRollupBackfill,
  ROLLUP_TABLES,
  isRollupTable,
  addDays,
  type RollupTable,
} from "@/lib/pixel/rollup-backfill";
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
// FIX 2026-08 (BP-ROLLUP-TIMEOUT): el override `maxDuration = 800` NO se estaba
// aplicando en prod — el default del proyecto en Vercel es 300s, y la observability
// mostraba 100% timeout (504 FUNCTION_INVOCATION_TIMEOUT) en TODAS las corridas del
// cron: budgeteaba 660s pero Vercel la mataba a los 300s SIN commitear → tablas
// (pixel_daily_source, pixel_daily_funnel_by_source) nunca se refrescaban → alertas.
// Bajado a 240s para RETORNAR LIMPIO bajo el cap real de 300s (margen ~60s p/
// coherencia + response). Un día tarda ~80-100s, así que cada corrida procesa 1-2
// días y COMMITEA; el cron (:20,:50) encadena y tapa el hueco en pocas horas.
// FIX 2026-08-18 (BP-ROLLUP-TABLE-ROTATION): Vercel NO da >300s a la función pese a
// Fluid Compute + Default Max Duration=800 + vercel.json + Node 22 (probado todo, la
// función SIEMPRE muere a ~340s = cap 300s). Un día = 7 tablas × orgs (~500s org
// grande) no entra → moría en el funnel → cursor clavado → nada se refrescaba
// (incidente del 18-ago). SOLUCIÓN: procesar UNA tabla por invocación (ROLLUP_TABLES,
// rota por tiempo abajo) — una tabla-día entra holgada en 300s (funnel ~170s el más
// caro). El cron corre cada 30min (vercel.json) → las 7 tablas ciclan en ~3.5h, por
// debajo del umbral de frescura de 5h. Budget 250s (bajo el cap real de 300s, con
// margen para coherencia + response).
const INVOCATION_BUDGET_MS = 250_000;
// No arrancar otra tanda si no queda al menos esto. Subido de 60s: los días
// recientes tardan ~80-100s cada uno (más tráfico), así que arrancar una tanda
// con 60s de margen garantizaba pasarse.
const MIN_SLICE_MS = 200_000;
// Presupuesto reservado para el auto-chequeo de coherencia del final. Si no
// queda, se saltea: es diagnóstico, y perder el diagnóstico es infinitamente
// mejor que perder el cursor de reanudación.
const COHERENCE_RESERVE_MS = 90_000;

// Reconstruye HOY + los (DAYS_BACK-1) días previos (AR-date) para las tablas FRESCAS.
// Bajado 3→1 (rotación 1-tabla/run, 2026-08-18): reprocesar 3 días × 7 tablas a
// 1-tabla/run haría el ciclo ~5h (al filo del umbral de frescura). Con 1 (sólo hoy),
// el ciclo baja a ~3.5h. Los HUECOS igual se tapan: el gap-aware arranca desde el
// MAX(day) de CADA tabla (abajo), no de DAYS_BACK. Trade-off: se reprocesan menos días
// pasados por eventos que llegan tarde — aceptable frente a mantener la frescura.
const DAYS_BACK = 1;
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

// Nombre real de la tabla en la DB por cada RollupTable — para el MAX(day) por tabla
// del gap-aware. Son constantes (no input), seguras de interpolar en SQL. OJO: funnel
// → pixel_daily_funnel_by_source (no "pixel_daily_funnel").
const ROLLUP_DB_TABLE: Record<RollupTable, string> = {
  aggregates: "pixel_daily_aggregates",
  device: "pixel_daily_device",
  type: "pixel_daily_type",
  page: "pixel_daily_page",
  product: "pixel_daily_product",
  source: "pixel_daily_source",
  funnel: "pixel_daily_funnel_by_source",
};

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

  // ── Una tabla por invocación: la MÁS ATRASADA ───────────────────────────────
  // La función capa a 300s (ver INVOCATION_BUDGET_MS), así que procesamos SÓLO una de
  // las 7 tablas de rollup por corrida. El cron corre cada 30min → ~3.5h para ciclar
  // las 7 (< umbral de frescura de 5h). Elegimos la más atrasada —MIN(MAX(day)), más
  // días detrás; desempate por MIN(MAX(refreshed_at)), menos recientemente tocada— en
  // vez de rotar por tiempo: es robusto a corridas salteadas por Vercel (el que más
  // atrás está SIEMPRE se elige next) y a la vez cicla las frescas por el desempate.
  // Cada tabla tiene su cursor propio (su MAX(day)), así que no se pisan.
  // Override manual `?table=` para admins (recompute a mano de una tabla puntual).
  const tableParam = url.searchParams.get("table");
  let table: RollupTable;
  let lastRollupDay: string | null = null;
  if (!isVercelCron && tableParam && isRollupTable(tableParam)) {
    table = tableParam;
    try {
      const mr = await prisma.$queryRawUnsafe<Array<{ d: string | null }>>(
        `SELECT MAX(day)::text AS d FROM ${ROLLUP_DB_TABLE[table]}`
      );
      lastRollupDay = mr?.[0]?.d || null;
    } catch { /* default: no romper el cron */ }
  } else {
    // Estado de las 7 tablas en paralelo (MAX(day) + MAX(refreshed_at), index-friendly).
    const status = await Promise.all(
      ROLLUP_TABLES.map(async (t) => {
        try {
          const r = await prisma.$queryRawUnsafe<Array<{ d: string | null; r: Date | null }>>(
            `SELECT MAX(day)::text AS d, MAX(refreshed_at) AS r FROM ${ROLLUP_DB_TABLE[t]}`
          );
          return { t, day: r?.[0]?.d || "0000-00-00", ref: r?.[0]?.r ? new Date(r[0].r).getTime() : 0 };
        } catch {
          return { t, day: "0000-00-00", ref: 0 };
        }
      })
    );
    // Más atrasada primero: MIN(day) asc, luego MIN(refreshed_at) asc.
    status.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.ref - b.ref));
    table = status[0].t;
    lastRollupDay = status[0].day === "0000-00-00" ? null : status[0].day;
  }
  let from = defaultFrom;
  // FIX 2026-08-19 (BP-ROLLUP-STUCK): arrancar en el PRIMER día FALTANTE (MAX(day)+1),
  // NO re-hacer el último día presente. BUG: con `from = lastRollupDay`, si la tabla
  // estaba 1 día atrás (MAX=ayer), cada corrida RE-PROCESABA ayer (source/funnel ~192s/
  // día casi agotan el budget de 250s) y NUNCA llegaba a hoy → MAX(day) no avanzaba →
  // la próxima corrida re-hacía ayer OTRA VEZ → tabla CLAVADA 1 día atrás → mails de
  // frescura recurrentes. Con MAX+1 cada pick AVANZA un día (llega a hoy en 1 corrida).
  if (lastRollupDay && lastRollupDay < defaultFrom) from = addDays(lastRollupDay, 1);
  if (from > to) from = to; // nunca pasar de hoy (MAX+1 podría igualar a `to`, ok)
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
      const r = await runRollupBackfill({ from, to, cursor, table, budgetMs: remainingMs });
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
    // El chequeo valida pixel_daily_source (visitors) vs crudo → sólo tiene sentido
    // cuando ESTA invocación procesó `source`. Para las otras 6 tablas se saltea
    // (comparar source stale daría falsos "incoherente").
    if (table !== "source") {
      coherenceSkipped = true;
      throw new Error("coherencia sólo aplica a la tabla source");
    }
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
      table, // tabla procesada en esta invocación (rotación 1-tabla/run)
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
