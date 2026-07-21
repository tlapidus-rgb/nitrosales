// @ts-nocheck
// ══════════════════════════════════════════════════════════════════════════
// /api/admin/setup-pixel-rollups  — Setup + backfill de los rollups HLL del pixel
// ══════════════════════════════════════════════════════════════════════════
// Destraba el BLOCKER #1 del deploy: las 7 tablas rollup + extensión `hll` que
// hacen que /api/metrics/pixel escale (72s→2s) viven SOLO en la DB del branch.
// Prod no las tiene → /pixel/analytics saldría en $0. Este endpoint las crea y
// las rellena DIRECTO en prod, portando los scripts `scripts/p2*.cjs` validados.
//
// ── Contrato de diseño ──────────────────────────────────────────────────────
//  • IDEMPOTENTE: todo es `CREATE … IF NOT EXISTS` + upsert `ON CONFLICT DO
//    UPDATE`. Correrlo dos veces NO rompe nada (re-escribe los mismos valores).
//    NO hay TRUNCATE (a diferencia de los scripts) para no destruir data si una
//    corrida se interrumpe a la mitad.
//  • NO BLOQUEA LA DB: cada chunk es un INSERT…SELECT de UN día sobre
//    pixel_events. Postgres es MVCC → leer pixel_events NO bloquea los writes
//    del pixel en tiempo real. El único lock es sobre las filas del rollup que
//    se upsertean (tablas nuevas, sin lectores aún). No hace falta CONCURRENTLY.
//  • RESUMIBLE (serverless-safe): cada POST procesa hasta `TIME_BUDGET_MS` y
//    devuelve un cursor. El caller repite hasta `done:true`. Así nunca choca
//    contra el maxDuration de la función.
//
// ── Fases (POST = muta, GET = solo lectura) ─────────────────────────────────
//   POST ?phase=schema        → CREATE EXTENSION hll + las 7 tablas. Rápido.
//   POST ?phase=first-source  → rebuild de la dimensión pixel_visitor_first_source
//                               (first-touch por visitante). Resumible por org.
//   POST ?phase=backfill      → rollups diarios (aggregates/device/type/page/
//                               product/source). Resumible por día (cursor=fecha).
//   GET  ?phase=status        → counts por tabla + cobertura (min/max día). RO.
//
// Orden obligatorio: schema → first-source → backfill (el rollup `source` hace
// JOIN contra la dimensión first-source).
//
// Auth: ?key=<ADMIN_API_KEY> (fail-closed, igual que el resto de /admin/*).
// Precisión HLL (NO mezclar entre días de la misma tabla):
//   aggregates/device/page/product = log2m 14, regwidth 5  (~0.8% err)
//   type/source                    = log2m 16, regwidth 5  (~0.4% err)
// ══════════════════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  FIRST_SOURCE_MARKETING_CASE_FILTERED,
  WEBHOOK_SESSION_FILTER,
} from "@/lib/pixel/first-source-sql";
// El backfill (constantes HLL + backfillDay + runner) vive en un lib COMPARTIDO
// para que el cron lo llame DIRECTO, sin self-fetch HTTP (que daba 401 por
// Deployment Protection cuando lo disparaba Vercel cron). Fuente única.
import {
  runRollupBackfill,
  globalRange,
  TIME_BUDGET_MS,
} from "@/lib/pixel/rollup-backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Excluye eventos sintéticos de webhook (sessionId 'webhook-*'); NULL cuenta.
// (Usado por firstSourceForOrg. Las constantes HLL del backfill viven en
// @/lib/pixel/rollup-backfill.)
const WH = WEBHOOK_SESSION_FILTER;

// Atribución first-touch por evento — ver first-source-sql.ts (fuente única).
const SRC = FIRST_SOURCE_MARKETING_CASE_FILTERED;

// ── DDL de las 7 tablas (idempotente) ───────────────────────────────────────
const DDL: string[] = [
  // 1) Agregado principal por org/día.
  `CREATE TABLE IF NOT EXISTS pixel_daily_aggregates (
    "organizationId" text NOT NULL,
    day date NOT NULL,
    total_events bigint NOT NULL DEFAULT 0,
    page_views bigint NOT NULL DEFAULT 0,
    events_with_clickid bigint NOT NULL DEFAULT 0,
    visitors_hll hll,
    sessions_hll hll,
    pv_visitors_hll hll,
    product_visitors_hll hll,
    cart_visitors_hll hll,
    checkout_visitors_hll hll,
    purchase_visitors_hll hll,
    identify_visitors_hll hll,
    refreshed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("organizationId", day)
  )`,
  // 2) Por dispositivo.
  `CREATE TABLE IF NOT EXISTS pixel_daily_device (
    "organizationId" text NOT NULL, day date NOT NULL, device text NOT NULL,
    visitors_hll hll, refreshed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("organizationId", day, device))`,
  // 3) Por tipo de evento.
  `CREATE TABLE IF NOT EXISTS pixel_daily_type (
    "organizationId" text NOT NULL, day date NOT NULL, type text NOT NULL,
    event_count bigint NOT NULL DEFAULT 0, visitors_hll hll, refreshed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("organizationId", day, type))`,
  // 4) Por URL de página.
  `CREATE TABLE IF NOT EXISTS pixel_daily_page (
    "organizationId" text NOT NULL, day date NOT NULL, url text NOT NULL,
    page_views bigint NOT NULL DEFAULT 0, visitors_hll hll, refreshed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("organizationId", day, url))`,
  // 5) Por producto.
  `CREATE TABLE IF NOT EXISTS pixel_daily_product (
    "organizationId" text NOT NULL, day date NOT NULL, product_id text NOT NULL,
    viewers_hll hll, refreshed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("organizationId", day, product_id))`,
  // 6) Dimensión first-touch source por visitante (inmutable).
  `CREATE TABLE IF NOT EXISTS pixel_visitor_first_source (
    "organizationId" text NOT NULL, "visitorId" text NOT NULL, first_source text NOT NULL,
    PRIMARY KEY ("organizationId", "visitorId"))`,
  // 7) Visitas-PV por first-source/día (depende de la dimensión #6).
  `CREATE TABLE IF NOT EXISTS pixel_daily_source (
    "organizationId" text NOT NULL, day date NOT NULL, first_source text NOT NULL,
    pv_visitors_hll hll, refreshed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("organizationId", day, first_source))`,
  // 8) Funnel por first-source/día (pasos PV/VP/ATC/checkout, HLL 14,5). Depende
  //    de la dimensión #6. Lo consume /api/metrics/pixel/funnel?channel=... rápido.
  `CREATE TABLE IF NOT EXISTS pixel_daily_funnel_by_source (
    "organizationId" text NOT NULL, day date NOT NULL, first_source text NOT NULL,
    pv_hll hll, vp_hll hll, atc_hll hll, co_hll hll,
    refreshed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("organizationId", day, first_source))`,
];


// ── first-source INCREMENTAL de UNA org ──────────────────────────────────────
// POR QUÉ EXISTE (auditoría 2026-07-21):
//   `firstSourceForOrg` reconstruye TODA la historia desde 2023 en cada corrida.
//   Por eso el cron se desagendó el 2026-06-14 (cab6bda4: "no escala, el
//   DISTINCT ON de historia completa supera 300s") y nunca volvió → la dimensión
//   quedó congelada 5 semanas y `metrics/pixel` (que la JOINea en la query #23)
//   perdió del breakdown por canal a TODO visitante nuevo desde entonces.
//
// LA CLAVE: el first-touch de un visitante es INMUTABLE — ya pasó. Entonces no
// hace falta recalcular a los que ya tienen fila: alcanza con calcular los que
// FALTAN. El trabajo pasa a ser proporcional a los visitantes nuevos, no a la
// historia entera.
//
// CORRECTITUD: para cada visitante faltante se busca su primer touch sobre su
// historia COMPLETA (no sobre la ventana). Si solo miráramos la ventana, un
// visitante viejo sin fila —por ejemplo por un hueco del cron— se llevaría un
// touch tardío como si fuera el primero. El índice @@index([visitorId, timestamp])
// hace que esa búsqueda por visitante sea barata.
//
// ⚠️ LOS CANDIDATOS SALEN DE `pixel_visitors`, NO DE `pixel_events` (fix
// 2026-07-21, segunda iteración). La primera versión elegía los faltantes con un
// `SELECT DISTINCT "visitorId" FROM pixel_events WHERE timestamp > now()-Nd`:
// con una ventana de 45 días eso es un scan con DISTINCT sobre una tabla de ~19M
// filas y timeouteaba a los 300s — el MISMO modo de fallar que desagendó el cron
// en junio, apenas más chico. `pixel_visitors` tiene UNA fila por visitante y el
// índice (organizationId, lastSeenAt), así que la selección es un index scan y
// el trabajo pesado queda acotado a los N visitantes del batch.
// Nota de tipos: `pixel_events."visitorId"` referencia `pixel_visitors.id` (el
// cuid), no el UUID de la cookie.
//
// RESUMIBLE DENTRO DE UNA ORG: `maxVisitors` acota cuántos faltantes procesa una
// llamada. Como al insertarlos dejan de faltar, repetir la llamada avanza sola
// hasta que devuelva 0. Es la pieza que el cursor por-org no daba (una org
// grande no se podía partir).
//
// ON CONFLICT DO NOTHING (no DO UPDATE): sólo insertamos faltantes, así que un
// conflicto es una carrera entre corridas y la fila que ya está es correcta.
// ⚠️ Corolario: cambiar la lógica de clasificación (FIRST_SOURCE_MARKETING_CASE)
// NO se propaga a las filas existentes. Para eso está `?full=1`, que conserva el
// comportamiento viejo (historia completa + DO UPDATE). El lote de canales va a
// necesitar correr `full=1` después de cambiar las reglas.
async function firstSourceIncrementalForOrg(
  org: string,
  windowDays: number,
  maxVisitors: number
): Promise<number> {
  return await prisma.$executeRawUnsafe(
    `INSERT INTO pixel_visitor_first_source ("organizationId","visitorId",first_source)
     SELECT DISTINCT ON (e2."visitorId") e2."organizationId", e2."visitorId", e2.marketing_source
     FROM (
       SELECT "organizationId","visitorId", timestamp,
         (${SRC}) AS marketing_source
       FROM pixel_events
       WHERE "organizationId"=$1 AND ${WH}
         AND "visitorId" IN (
           SELECT pv.id
           FROM pixel_visitors pv
           WHERE pv."organizationId"=$1
             AND pv."lastSeenAt" > NOW() - make_interval(days => $2::int)
             AND NOT EXISTS (
               SELECT 1 FROM pixel_visitor_first_source d
               WHERE d."organizationId"=$1 AND d."visitorId"=pv.id
             )
           LIMIT $3::int
         )
     ) e2
     WHERE e2.marketing_source IS NOT NULL
     ORDER BY e2."visitorId", e2.timestamp ASC
     ON CONFLICT ("organizationId","visitorId") DO NOTHING`,
    org,
    windowDays,
    maxVisitors
  );
}

/**
 * ¿Quedan visitantes sin resolver en esta org?
 *
 * POR QUÉ EXISTE (bug encontrado el 2026-07-21 corriendo el backfill): antes
 * `pending` se calculaba como `filasInsertadas >= maxVisitors`. Pero `maxVisitors`
 * limita CANDIDATOS, no inserciones: un candidato cuyo primer touch clasifica a
 * NULL no genera fila. Como insertadas ≤ candidatos, la comparación casi nunca
 * daba true → el loop reportaba `done` tras UNA pasada y dejaba el resto sin
 * procesar. Sintomático: terminó en 32s "ok" con 667.917 visitantes pendientes.
 *
 * Ahora la señal es directa: ¿queda alguno? El EXISTS corta en la primera fila y
 * usa los mismos índices que la selección de candidatos, así que es barato.
 *
 * El caso "quedan candidatos pero ninguno genera fila" (visitantes que sólo
 * tienen eventos de pasarela/checkout) lo corta la regla de progreso del cron:
 * si una llamada inserta 0, para. Sin eso, esos visitantes serían candidatos
 * para siempre y el loop no terminaría nunca.
 */
async function hasPendingFirstSource(org: string, windowDays: number): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ more: boolean }>>(
    `SELECT EXISTS (
       SELECT 1
       FROM pixel_visitors pv
       WHERE pv."organizationId"=$1
         AND pv."lastSeenAt" > NOW() - make_interval(days => $2::int)
         AND NOT EXISTS (
           SELECT 1 FROM pixel_visitor_first_source d
           WHERE d."organizationId"=$1 AND d."visitorId"=pv.id
         )
     ) AS more`,
    org,
    windowDays
  );
  return rows[0]?.more === true;
}

// ── first-source de UNA org (full history, DISTINCT ON first touch) ──────────
// Sólo para `?full=1`: reconstruye todo y PISA (DO UPDATE). Es lo que hay que
// correr cuando cambia la lógica de clasificación. Caro: no agendar.
async function firstSourceForOrg(org: string): Promise<number> {
  return await prisma.$executeRawUnsafe(
    `INSERT INTO pixel_visitor_first_source ("organizationId","visitorId",first_source)
     SELECT DISTINCT ON ("visitorId") "organizationId","visitorId", marketing_source
     FROM (
       SELECT "organizationId","visitorId", timestamp,
         (${SRC}) AS marketing_source
       FROM pixel_events
       WHERE "organizationId"=$1 AND timestamp BETWEEN '2023-01-01' AND NOW() AND ${WH}
     ) e
     WHERE marketing_source IS NOT NULL
     ORDER BY "visitorId", timestamp ASC
     ON CONFLICT ("organizationId","visitorId") DO UPDATE SET first_source=EXCLUDED.first_source`,
    org
  );
}

// ════════════════════════════════════════════════════════════════════════════
// POST — fases que mutan (schema / first-source / backfill)
// ════════════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (!isValidAdminKey(url.searchParams.get("key"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const phase = url.searchParams.get("phase") || "";
  const startedAt = Date.now();

  try {
    // ── FASE schema ──────────────────────────────────────────────────────
    if (phase === "schema") {
      await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS hll`);
      const ext: any = await prisma.$queryRawUnsafe(
        `SELECT extversion FROM pg_extension WHERE extname='hll'`
      );
      const tables: Array<{ table: string; ok: boolean; error?: string }> = [];
      for (const ddl of DDL) {
        const name = ddl.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] || "?";
        try {
          await prisma.$executeRawUnsafe(ddl);
          tables.push({ table: name, ok: true });
        } catch (e: any) {
          tables.push({ table: name, ok: false, error: e.message });
        }
      }
      return NextResponse.json({
        ok: tables.every((t) => t.ok),
        phase,
        hll_version: ext?.[0]?.extversion ?? null,
        tables,
        ms: Date.now() - startedAt,
        next: "POST ?phase=first-source",
      });
    }

    // ── FASE first-source (resumible por índice de org) ──────────────────
    if (phase === "first-source") {
      // Orgs desde `pixel_visitors` (1 fila/visitante, índice por organizationId)
      // en vez de `pixel_events` (19M, seq-scan ~minutos). Todo org con eventos
      // tiene visitors. Esto baja el overhead fijo por llamada de ~90s a ~1s, dejando
      // el maxDuration entero para el rebuild de la org más grande.
      const orgsRes: any = await prisma.$queryRawUnsafe(
        `SELECT DISTINCT "organizationId" org FROM pixel_visitors ORDER BY 1`
      );
      const orgs: string[] = orgsRes.map((o: any) => o.org);
      const start = Math.max(0, parseInt(url.searchParams.get("orgCursor") || "0", 10) || 0);
      // ── Modo (auditoría 2026-07-21) ───────────────────────────────────────
      //   default  → INCREMENTAL: sólo visitantes faltantes con actividad en la
      //              ventana. Barato y agendable.
      //   ?full=1  → historia completa + DO UPDATE. Caro. Correr a mano cuando
      //              cambie la lógica de clasificación.
      const fullRebuild = url.searchParams.get("full") === "1";
      const windowDays = Math.min(
        400,
        Math.max(1, parseInt(url.searchParams.get("days") || "3", 10) || 3)
      );
      // Default 10k (bajado de 50k tras el timeout del 2026-07-21 con days=45).
      // Es el tamaño del batch: cuántos visitantes faltantes resuelve UNA
      // llamada. Como al insertarlos dejan de faltar, un valor chico no pierde
      // trabajo, sólo requiere más pasadas. Mínimo 100 para poder achicar
      // cuando una org tiene visitantes con historial muy largo.
      const maxVisitors = Math.min(
        500_000,
        Math.max(100, parseInt(url.searchParams.get("maxVisitors") || "10000", 10) || 10_000)
      );
      const processed: Array<{ org: string; visitors: number; ms: number }> = [];
      let i = start;
      // `pending` queda en true si alguna org insertó justo el tope de visitantes:
      // significa que puede quedar cola y hay que volver a llamar.
      let pending = false;
      for (; i < orgs.length; i++) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) break;
        const t0 = Date.now();
        try {
          const n = fullRebuild
            ? await firstSourceForOrg(orgs[i])
            : await firstSourceIncrementalForOrg(orgs[i], windowDays, maxVisitors);
          // La señal de "queda cola" se pregunta a la base, NO se infiere de las
          // filas insertadas: `maxVisitors` limita candidatos y los candidatos
          // sin marketing_source no generan fila. Ver hasPendingFirstSource.
          if (!fullRebuild && (await hasPendingFirstSource(orgs[i], windowDays))) {
            pending = true;
          }
          processed.push({ org: orgs[i].slice(0, 8), visitors: n, ms: Date.now() - t0 });
        } catch (e: any) {
          // Devolvemos el cursor del org que falló para que se pueda reanudar
          // exactamente ahí (idempotente: el upsert re-escribe lo ya hecho).
          return NextResponse.json(
            {
              ok: false,
              phase,
              totalOrgs: orgs.length,
              processedThisCall: processed.length,
              processed,
              failedOrgCursor: i,
              error: e.message,
              resume: `POST ?phase=first-source&orgCursor=${i}${
                fullRebuild ? "&full=1" : `&days=${windowDays}&maxVisitors=${maxVisitors}`
              }`,
              ms: Date.now() - startedAt,
            },
            { status: 500 }
          );
        }
      }
      // `done` sólo si se recorrieron todas las orgs Y ninguna quedó con cola.
      // Sin la segunda condición, una org con más faltantes que `maxVisitors`
      // reportaría done:true dejando visitantes afuera — que es exactamente el
      // modo de fallar silencioso que este fix vino a cerrar.
      const sweptAllOrgs = i >= orgs.length;
      const done = sweptAllOrgs && !pending;
      const mode = fullRebuild ? "full" : "incremental";
      const qs = fullRebuild
        ? "&full=1"
        : `&days=${windowDays}&maxVisitors=${maxVisitors}`;
      return NextResponse.json({
        ok: true,
        phase,
        mode,
        windowDays: fullRebuild ? null : windowDays,
        totalOrgs: orgs.length,
        processedThisCall: processed.length,
        processed,
        done,
        // Hay cola pero ya se barrieron todas las orgs → volver a llamar desde 0.
        pending,
        nextOrgCursor: sweptAllOrgs ? (pending ? 0 : null) : i,
        next: done
          ? "POST ?phase=backfill"
          : `POST ?phase=first-source&orgCursor=${sweptAllOrgs ? 0 : i}${qs}`,
        ms: Date.now() - startedAt,
      });
    }

    // ── FASE backfill (resumible por día; cursor=fecha AR) ───────────────
    // Delega en el lib compartido @/lib/pixel/rollup-backfill (mismo que el cron
    // llama DIRECTO, sin self-fetch). Fuente única del SQL HLL.
    if (phase === "backfill") {
      const r = await runRollupBackfill({
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        cursor: url.searchParams.get("cursor"),
      });
      return NextResponse.json(r.body, { status: r.httpStatus });
    }

    return NextResponse.json(
      {
        error:
          "phase inválida. Usá POST ?phase=schema | first-source | backfill, o GET ?phase=status.",
      },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, phase, error: e.message, stack: e.stack?.slice(0, 500) },
      { status: 500 }
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GET — solo lectura (status). No muta nada (CSO: no navegable como acción).
// ════════════════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!isValidAdminKey(url.searchParams.get("key"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const tables = [
      "pixel_daily_aggregates",
      "pixel_daily_device",
      "pixel_daily_type",
      "pixel_daily_page",
      "pixel_daily_product",
      "pixel_daily_source",
      "pixel_visitor_first_source",
    ];
    const ext: any = await prisma.$queryRawUnsafe(
      `SELECT extversion FROM pg_extension WHERE extname='hll'`
    );
    const counts: Record<string, any> = {};
    for (const t of tables) {
      try {
        const exists: any = await prisma.$queryRawUnsafe(
          `SELECT to_regclass($1) IS NOT NULL ok`,
          t
        );
        if (!exists?.[0]?.ok) {
          counts[t] = { exists: false };
          continue;
        }
        const c: any = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int c FROM ${t}`);
        const row: any = { exists: true, rows: c?.[0]?.c ?? 0 };
        if (t !== "pixel_visitor_first_source") {
          const r: any = await prisma.$queryRawUnsafe(
            `SELECT TO_CHAR(MIN(day),'YYYY-MM-DD') lo, TO_CHAR(MAX(day),'YYYY-MM-DD') hi FROM ${t}`
          );
          row.dayRange = { from: r?.[0]?.lo ?? null, to: r?.[0]?.hi ?? null };
        }
        counts[t] = row;
      } catch (e: any) {
        counts[t] = { error: e.message };
      }
    }
    const range = await globalRange();
    return NextResponse.json({
      ok: true,
      hll_version: ext?.[0]?.extversion ?? null,
      pixel_events_ar_range: range,
      tables: counts,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
