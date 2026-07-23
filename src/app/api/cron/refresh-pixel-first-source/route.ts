// @ts-nocheck
// ══════════════════════════════════════════════════════════════════════════
// GET /api/cron/refresh-pixel-first-source
// ══════════════════════════════════════════════════════════════════════════
// Reconstruye la dimensión `pixel_visitor_first_source` (first-touch por
// visitante) 1×/día. Complementa a /api/cron/refresh-pixel-rollups (cada 2h):
//   • refresh-pixel-rollups → rollups diarios (aggregates/device/type/page/
//     product/source) de los últimos 3 días. NO refresca first-source.
//   • refresh-pixel-first-source (ESTE) → first-source de TODA la historia,
//     1×/día, para que los visitantes BRAND-NEW entren al breakdown `bySource`.
//
// Por qué separados: first-source hace un scan de historia completa por org
// (DISTINCT ON visitorId), pesado → no se puede correr cada 2h. El rollup
// `pixel_daily_source` JOINea contra esta dimensión, así que correr first-source
// 1×/día (3am ART = 6am UTC, tráfico bajo) y los rollups después mantiene el
// breakdown por canal al día sin cargar un scan completo cada 2h.
//
// ── Diseño (idéntico patrón a refresh-pixel-rollups) ────────────────────────
//  • REUTILIZA la lógica validada: self-fetch a
//    `POST /api/admin/setup-pixel-rollups?phase=first-source` (cero duplicación;
//    mismo DISTINCT ON ya testeado). Mismo patrón de self-fetch que warm-cache.
//  • INCREMENTAL (2026-07-21): calcula sólo los visitantes que FALTAN en la
//    dimensión y tuvieron actividad en la ventana (`?days`, default 3). El
//    first-touch es inmutable, así que recalcular a los que ya tienen fila era
//    trabajo puro. El primer touch de cada faltante se busca sobre su historia
//    completa (no sobre la ventana), apoyado en @@index([visitorId, timestamp]).
//  • IDEMPOTENTE: ON CONFLICT DO NOTHING. Sólo se insertan faltantes, así que un
//    conflicto es una carrera y la fila existente ya es correcta.
//  • RESUMIBLE EN DOS EJES: por org (nextOrgCursor) y DENTRO de una org
//    (`maxVisitors` por llamada + `pending:true`). El loop sigue hasta done:true.
//
// ⚠️ HISTORIA (por qué esto es así): este cron estuvo DESAGENDADO desde el
// 2026-06-14 (cab6bda4) hasta el 2026-07-21 porque la versión vieja reconstruía
// toda la historia desde 2023 en cada corrida y pasaba los 300s. En ese hueco de
// 5 semanas la dimensión quedó congelada y `metrics/pixel` —que la JOINea en la
// query #23— perdió del breakdown por canal a TODO visitante nuevo. Si volvés a
// desagendarlo, ese agujero vuelve y NO avisa.
//
// ⚠️ Cambiar la lógica de clasificación (FIRST_SOURCE_MARKETING_CASE) NO se
// propaga: el incremental no pisa filas. Después de tocarla hay que correr a
// mano `POST /api/admin/setup-pixel-rollups?phase=first-source&full=1`.
//
// Schedule: cada 6h (vercel.json: `0 */6 * * *`) con `&days=90`.
//
// ⚠️ POR QUÉ days=90 Y NO 3 (2026-07-22): con days=3 el cron sólo miraba a los
// visitantes activos en 3 días. El que se escapaba de esa ventana sin evaluar
// NO lo agarraba nadie nunca más y se acumulaba en silencio — así el bucket
// "sin clasificar" creció hasta ~21.000 sin que nada avisara. Con days=90 cada
// corrida reevalúa a TODO el que sigue sin canal en la ventana de reporte, así
// que nadie se amontona: lo máximo que espera un visitante es una corrida (~6h).
// No es más caro: el costo lo manda la CANTIDAD de faltantes (topada por
// maxVisitors), no el ancho de la ventana. Una vez limpio el backlog, quedan
// pocos por corrida.
// Auth: header `user-agent: vercel-cron` (Vercel) o `?key=<ADMIN_API_KEY>`.
//
// ⚠️ Deuda compartida: el self-fetch manda la key en la URL (queda en logs) —
// mismo patrón que el resto de los crons; se cierra con CRON_SECRET (BP-M1).
// ══════════════════════════════════════════════════════════════════════════

import { ADMIN_API_KEY, isValidAdminKey } from "@/lib/admin-key";
import { buildUnresolvedByOrgSql } from "@/lib/pixel/first-source-batch";
import { decideNextCall } from "@/lib/pixel/first-source-progress";
import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// first-source escanea historia completa por org → puede necesitar varias
// llamadas de 250s al setup. 800 da margen (igual presupuesto que vercel.json
// declara para app/api/cron/**).
export const maxDuration = 800;

// Tope de llamadas al setup por run (resumible por org; tope evita loop infinito).
const MAX_CALLS = 30;

// Horizonte de REPORTE: hasta dónde mira la UI del cliente. La ventana del batch
// (`?days`, default 3) es de PROCESO y es mucho más corta a propósito. Que sean
// distintas es el punto: medir el resultado con la misma ventana con la que se
// elige el trabajo es cómo se llegó a reportar "9 pendientes" con ~33.000
// visitantes sin clasificar (2026-07-22).
const REPORTING_HORIZON_DAYS = 90;

// Presupuesto COMPARTIDO de la invocación, con margen bajo el maxDuration de 800s
// para la query de `pendingByOrg` y el cierre. Cada pasada al setup tarda ~200s
// con lotes de 10k, así que entran ~3 por request.
const INVOCATION_BUDGET_MS = 700_000;
// No arrancar otra pasada si no queda al menos esto: una pasada que se corta a
// la mitad por el wall no devuelve nada y pierde el trabajo de todo el request.
const MIN_SLICE_MS = 260_000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  // Auth: SÓLO por key. El bypass por `user-agent: vercel-cron` (spoofeable) se
  // quitó (auditoría 2026-07-22): Vercel Cron manda la key en vercel.json.
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const startedAt = Date.now();
  const baseUrl = `${url.protocol}//${url.host}`;
  // Ventana del incremental. Default 3 días: cubre un par de corridas perdidas
  // sin agrandar el trabajo (lo que manda el costo son los visitantes FALTANTES,
  // no el largo de la ventana). Overrideable para cerrar huecos grandes a mano:
  // `?days=45` recupera visitantes de un hueco de mes y medio.
  const windowDays = Math.min(
    400,
    Math.max(1, parseInt(url.searchParams.get("days") || "3", 10) || 3)
  );
  // Tamaño del batch por llamada. Se expone para poder achicarlo a mano cuando
  // una org tiene visitantes con historial largo y la llamada se pasa de tiempo
  // (pasó el 2026-07-21 con days=45 y batch de 50k).
  const maxVisitors = Math.min(
    500_000,
    Math.max(100, parseInt(url.searchParams.get("maxVisitors") || "10000", 10) || 10_000)
  );
  const setupBase =
    `${baseUrl}/api/admin/setup-pixel-rollups?phase=first-source` +
    `&key=${encodeURIComponent(ADMIN_API_KEY)}` +
    `&days=${windowDays}&maxVisitors=${maxVisitors}`;

  const calls: Array<{
    orgCursor: number;
    ok: boolean;
    done: boolean;
    processed: number;
    ms: number;
  }> = [];
  let orgCursor = 0;
  let done = false;
  let error: string | null = null;

  let budgetHit = false;
  for (let i = 0; i < MAX_CALLS; i++) {
    // Presupuesto de la invocación. BUG (2026-07-21): el loop iteraba hasta
    // MAX_CALLS=30 sin mirar el reloj. Mientras `pending` estaba roto y cortaba
    // en la primera pasada no se notaba; apenas se arregló, el loop siguió
    // iterando (~200s por pasada) y se comió el maxDuration → 504
    // FUNCTION_INVOCATION_TIMEOUT, sin devolver NADA: ni el trabajo hecho, ni
    // los pendientes, ni por dónde seguir.
    // Mismo patrón que el cron hermano refresh-pixel-rollups, que ya pasó por
    // esto (ver INVOCATION_BUDGET_MS ahí).
    const elapsed = Date.now() - startedAt;
    if (INVOCATION_BUDGET_MS - elapsed < MIN_SLICE_MS) {
      budgetHit = true;
      break;
    }
    const target = `${setupBase}&orgCursor=${orgCursor}`;
    let json: any;
    try {
      const r = await fetch(target, { method: "POST", cache: "no-store" });
      // Cuando la fase se pasa del maxDuration, Vercel responde su página de
      // error HTML y `r.json()` explota con "Unexpected token 'A'". Ese mensaje
      // no dice nada útil a quien está corriendo esto a mano, así que se lee el
      // body como texto primero y se traduce el caso.
      const raw = await r.text();
      try {
        json = JSON.parse(raw);
      } catch {
        const looksLikeTimeout =
          r.status === 504 || /an error occurred|timeout|FUNCTION_INVOCATION/i.test(raw);
        error = looksLikeTimeout
          ? `la fase first-source se pasó del tiempo (HTTP ${r.status}). Bajá el lote o la ventana: ` +
            `?days=<menos días>&maxVisitors=<menos visitantes>. Actual: days=${windowDays}, maxVisitors=${maxVisitors}.`
          : `respuesta no-JSON de la fase (HTTP ${r.status}): ${raw.slice(0, 120)}`;
        break;
      }
      // ⚠️ 403 MUDO (2026-07-22): un status no-2xx con body JSON —el caso típico
      // es `{"error":"Forbidden"}` de un 403— parseaba bien, pero `json.ok`
      // quedaba `undefined` (NO `false`). El guard de más abajo pregunta por
      // `=== false`, así que no disparaba; el loop caía en `cursor-stuck` y el
      // cron terminaba en HTTP 500 con `error: null`, indistinguible de una
      // parada legítima. Pasa JUSTO al rotar la ADMIN_API_KEY: el self-fetch
      // manda la key vieja y la fase la rechaza sin que nada lo diga.
      if (!r.ok) {
        const detail = json?.error ? String(json.error) : `HTTP ${r.status}`;
        error =
          r.status === 401 || r.status === 403
            ? `la fase rechazó la auth (HTTP ${r.status}: ${detail}). ` +
              `¿Se rotó la ADMIN_API_KEY sin actualizar vercel.json y redeployar?`
            : `la fase respondió HTTP ${r.status}: ${detail}`;
        break;
      }
    } catch (e: any) {
      error = `fetch failed: ${e?.message?.slice(0, 200)}`;
      break;
    }
    calls.push({
      orgCursor,
      ok: json?.ok === true,
      done: json?.done === true,
      processed: json?.processedThisCall ?? 0,
      ms: json?.ms ?? 0,
    });
    if (json?.ok === false) {
      error = (json?.error || "first-source devolvió ok:false")?.toString().slice(0, 200);
      break;
    }
    // La regla de corte vive en src/lib/pixel/first-source-progress.ts (testeada):
    // con `pending` el cursor NO avanza a propósito, así que el anti-loop no
    // puede ser "el cursor no se movió" sino el progreso real.
    const decision = decideNextCall(json, orgCursor);
    if (decision.action === "stop") {
      if (decision.reason === "done") done = true;
      break;
    }
    orgCursor = decision.nextCursor;
  }

  // Resumen final: cuántos visitantes quedan sin resolver, por org. Es la única
  // medida que no depende de que la lógica del loop esté bien — justamente lo
  // que falló dos veces. Si esto no baja entre corridas, algo anda mal aunque
  // `done` diga true.
  let pendingByOrg: Array<{ org: string; pending: number }> = [];
  let noSourceByOrg: Array<{ org: string; noSource: number }> = [];
  let unresolvedByOrg: Array<{ org: string; unresolved: number }> = [];
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ org: string; pending: number }>>(
      `SELECT pv."organizationId" AS org, COUNT(*)::int AS pending
       FROM pixel_visitors pv
       WHERE pv."lastSeenAt" > NOW() - make_interval(days => $1::int)
         AND NOT EXISTS (
           SELECT 1 FROM pixel_visitor_first_source d
           WHERE d."organizationId"=pv."organizationId" AND d."visitorId"=pv.id
         )
         -- Los ya evaluados sin canal NO son pendientes: están resueltos, solo
         -- que su resultado es "no tiene canal de marketing". Sin esta
         -- exclusión el número no bajaba nunca aunque el trabajo estuviera
         -- hecho, y el operador seguía corriendo el backfill al pedo (pasó,
         -- 2026-07-21: 13 pasadas de 8 minutos mirando un número clavado).
         AND NOT EXISTS (
           SELECT 1 FROM pixel_visitor_no_source n
           WHERE n."organizationId"=pv."organizationId" AND n."visitorId"=pv.id
         )
       GROUP BY 1
       ORDER BY 2 DESC`,
      windowDays
    );
    pendingByOrg = rows;
    const marked = await prisma.$queryRawUnsafe<Array<{ org: string; noSource: number }>>(
      `SELECT "organizationId" AS org, COUNT(*)::int AS "noSource"
       FROM pixel_visitor_no_source
       GROUP BY 1
       ORDER BY 2 DESC`
    );
    noSourceByOrg = marked;
    // Los que el cliente ve como 'sin_clasificar', en el horizonte de REPORTE.
    // Deliberadamente NO comparte la ventana del batch: si la compartiera,
    // volvería a ser ciego a los visitantes que se le escapan (ver el comentario
    // largo en buildUnresolvedByOrgSql). Cuando `pending` da 0 y esto da un
    // número grande, la diferencia son los que quedaron fuera de alcance y hay
    // que correr `?days=90` a mano para recuperarlos.
    unresolvedByOrg = await prisma.$queryRawUnsafe<
      Array<{ org: string; unresolved: number }>
    >(buildUnresolvedByOrgSql(), REPORTING_HORIZON_DAYS);
  } catch {
    /* diagnóstico, no crítico: si falla no invalida el trabajo hecho */
  }

  return NextResponse.json(
    {
      ok: done && !error,
      done,
      // true = cortó por tiempo, NO por haber terminado. Volvé a correr el mismo
      // link: es idempotente y arranca por los que faltan.
      budgetHit,
      // Commit que está sirviendo esta respuesta. Se agrega porque el backfill
      // del 2026-07-21 se corrió TRES veces contra código viejo sin que hubiera
      // forma de notarlo: la respuesta era plausible y el deploy todavía no
      // había salido. Con esto se compara de un vistazo contra el SHA esperado.
      // Vercel lo inyecta en build; en local queda "local".
      build: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 8),
      // Cuántos visitantes quedan sin EVALUAR, por org. Excluye a los marcados
      // como "sin canal": esos están resueltos, su resultado es que no tienen
      // canal de marketing. Es la métrica que dice si hay que volver a correr.
      pendingByOrg,
      // Cuántos se evaluaron y no tenían canal. Sirve para distinguir "no
      // procesé nada" de "procesé todo y no había canal que asignar".
      noSourceByOrg,
      // ⚠️ LA MÉTRICA QUE HAY QUE MIRAR. `pendingByOrg` sólo cuenta lo que el
      // batch todavía alcanza; esto cuenta lo que el CLIENTE ve como
      // 'sin_clasificar' en los últimos REPORTING_HORIZON_DAYS. Si este número
      // no baja mientras `pending` dice 0, hay visitantes fuera de la ventana:
      // correr `?days=90`. El 2026-07-22 esa diferencia eran ~33.000 visitantes
      // y el cron reportaba éxito.
      unresolvedByOrg,
      reportingHorizonDays: REPORTING_HORIZON_DAYS,
      callsCount: calls.length,
      calls,
      error,
      totalMs: Date.now() - startedAt,
    },
    { status: done && !error ? 200 : 500 }
  );
}
