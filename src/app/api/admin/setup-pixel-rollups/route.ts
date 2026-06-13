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

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Presupuesto de tiempo por invocación: paramos antes del maxDuration de Vercel
// y devolvemos cursor para que el caller repita. 250s deja margen de cierre.
const TIME_BUDGET_MS = 250_000;

// ── Constantes SQL (espejo exacto de scripts/p2*.cjs ya validados <2%) ──────
const P14 = "14, 5";
const P16 = "16, 5";
const ARDAY = `(timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;
// Excluye eventos sintéticos de webhook (sessionId 'webhook-*'); NULL cuenta.
const WH = `("sessionId" IS NULL OR "sessionId" NOT LIKE 'webhook-%')`;
const HV14 = `hll_add_agg(hll_hash_text("visitorId"), ${P14})`;
const HV16 = `hll_add_agg(hll_hash_text("visitorId"), ${P16})`;
// Evento que trae un click-id de ads (para events_with_clickid).
const CLICKID = `("clickIds" IS NOT NULL AND "clickIds"::text != '{}' AND "clickIds"::text != 'null')`;

// Atribución de first-touch source por evento (idéntico a p2b-backfill.cjs).
const SRC = `CASE
  WHEN ("clickIds"->>'fbclid') IS NOT NULL AND ("clickIds"->>'fbclid') != '' THEN 'meta'
  WHEN ("clickIds"->>'gclid') IS NOT NULL AND ("clickIds"->>'gclid') != '' THEN 'google'
  WHEN ("clickIds"->>'ttclid') IS NOT NULL AND ("clickIds"->>'ttclid') != '' THEN 'tiktok'
  WHEN ("clickIds"->>'msclkid') IS NOT NULL AND ("clickIds"->>'msclkid') != '' THEN 'microsoft'
  WHEN ("clickIds"->>'li_fat_id') IS NOT NULL AND ("clickIds"->>'li_fat_id') != '' THEN 'linkedin'
  WHEN LOWER("utmParams"->>'source') IN ('adwords','google_ads','google-ads','googleads') THEN 'google'
  WHEN LOWER("utmParams"->>'source') IN ('meta_ads','meta-ads','metaads','fb_ads','fb-ads','fbads','facebook_ads','facebook-ads') THEN 'meta'
  WHEN LOWER("utmParams"->>'source') IN ('ig','instagram_ads','instagram-ads') THEN 'instagram'
  WHEN ("utmParams"->>'source') IS NOT NULL AND ("utmParams"->>'source') != '' THEN LOWER("utmParams"->>'source')
  WHEN referrer ~* 'l\\.instagram\\.com|instagram\\.com' THEN 'instagram'
  WHEN referrer ~* 'facebook\\.com|fb\\.com|m\\.facebook\\.com' THEN 'facebook'
  WHEN referrer ~* 'tiktok\\.com' THEN 'tiktok'
  WHEN referrer ~* 'twitter\\.com|x\\.com|t\\.co' THEN 'twitter'
  WHEN referrer ~* 'youtube\\.com|youtu\\.be' THEN 'youtube'
  WHEN referrer ~* 'linkedin\\.com|lnkd\\.in' THEN 'linkedin'
  WHEN referrer ~* 'pinterest\\.com' THEN 'pinterest'
  WHEN referrer ~* 'whatsapp\\.com|wa\\.me' THEN 'whatsapp'
  WHEN referrer ~* 't\\.me|telegram\\.org' THEN 'telegram'
  WHEN referrer ~* 'mail\\.google\\.com|gmail\\.com|outlook\\.com|yahoo\\.com/mail' THEN 'email'
  WHEN referrer ~* 'google\\.[a-z]{2,3}' THEN 'google_organic'
  WHEN referrer ~* 'bing\\.com' THEN 'bing_organic'
  WHEN referrer ~* 'yahoo\\.com' THEN 'yahoo_organic'
  WHEN referrer = '' OR referrer IS NULL THEN 'direct' ELSE 'referral' END`;

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
];

// ── Helpers de fecha (UTC) ──────────────────────────────────────────────────
const addDays = (s: string, n: number): string => {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isYmd = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Rango global (AR-date) de pixel_events; null si no hay eventos.
// Toma MIN/MAX sobre el `timestamp` CRUDO (los extremos salen del índice btree, instantáneo)
// y recién ahí convierte a fecha AR. Hacer MIN/MAX sobre la expresión funcional
// `(timestamp AT TIME ZONE ...)::date` forzaría un seq-scan de los 19M (lento).
async function globalRange(): Promise<{ lo: string; hi: string } | null> {
  const r: any = await prisma.$queryRawUnsafe(
    `SELECT TO_CHAR((MIN(timestamp) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,'YYYY-MM-DD') lo,
            TO_CHAR((MAX(timestamp) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,'YYYY-MM-DD') hi
     FROM pixel_events WHERE timestamp BETWEEN '2023-01-01' AND NOW()`
  );
  const lo = r?.[0]?.lo, hi = r?.[0]?.hi;
  return isYmd(lo) && isYmd(hi) ? { lo, hi } : null;
}

// ── Backfill de UN día para UNA org (un statement por tabla) ─────────────────
// Procesa el día `d` (AR-date) acotado a `org`. El bracket UTC es generoso (±1 día)
// y el filtro AR-date recorta el borde exacto, igual que los scripts.
// CLAVE DE PERFORMANCE: filtra `"organizationId"=$1` PRIMERO para que use el índice
// `(organizationId, timestamp)`. Procesar todas las orgs juntas (sin este filtro)
// fuerza un seq-scan de los 19M de `pixel_events` por statement (~minutos/día) y
// rompe el maxDuration de Vercel. Por eso se itera por org, igual que los scripts.
// Params: $1=org, $2=tsLo, $3=tsHi, $4=dLo, $5=dHi. Devuelve filas tocadas.
async function backfillDayOrg(d: string, org: string): Promise<number> {
  const dLo = d;
  const dHi = addDays(d, 1);
  // Bracket UTC GENEROSO (±1 día) sobre el rango AR-date [dLo, dHi): igual que los
  // scripts (tsLo=dLo-1, tsHi=dHi+1). La generosidad es OBLIGATORIA: AR = UTC-3, así
  // que los eventos de la NOCHE AR del día `d` caen en UTC [d+1 00:00Z, d+1 03:00Z].
  // Con tsHi=dHi (sin +1) se perdían esas ~3h finales (undercount ~14%). El filtro
  // AR-date exacto (>=dLo, <dHi) recorta el borde; el bracket solo acota el index scan.
  const tsLo = addDays(dLo, -1) + "T00:00:00Z";
  const tsHi = addDays(dHi, 1) + "T00:00:00Z";
  const args = [org, tsLo, tsHi, dLo, dHi];
  // Predicado de rango compartido (param $1..$5), acotado a la org (usa el índice).
  const range = `"organizationId"=$1 AND timestamp >= $2::timestamptz AND timestamp < $3::timestamptz
    AND ${ARDAY} >= $4::date AND ${ARDAY} < $5::date AND ${WH}`;

  let touched = 0;

  // 1) aggregates (precisión 14,5)
  touched += await prisma.$executeRawUnsafe(
    `INSERT INTO pixel_daily_aggregates
       ("organizationId",day,total_events,page_views,events_with_clickid,
        visitors_hll,sessions_hll,pv_visitors_hll,product_visitors_hll,
        cart_visitors_hll,checkout_visitors_hll,purchase_visitors_hll,identify_visitors_hll,refreshed_at)
     SELECT "organizationId", ${ARDAY},
       COUNT(*)::bigint,
       COUNT(*) FILTER (WHERE type='PAGE_VIEW')::bigint,
       COUNT(*) FILTER (WHERE ${CLICKID})::bigint,
       hll_add_agg(hll_hash_text("visitorId"), ${P14}),
       hll_add_agg(hll_hash_text("sessionId"), ${P14}),
       ${HV14} FILTER (WHERE type='PAGE_VIEW'),
       ${HV14} FILTER (WHERE type='VIEW_PRODUCT'),
       ${HV14} FILTER (WHERE type='ADD_TO_CART'),
       ${HV14} FILTER (WHERE type IN ('INITIATE_CHECKOUT','CHECKOUT_SHIPPING')),
       ${HV14} FILTER (WHERE type='PURCHASE'),
       ${HV14} FILTER (WHERE type='IDENTIFY'),
       now()
     FROM pixel_events WHERE ${range}
     GROUP BY 1,2
     ON CONFLICT ("organizationId", day) DO UPDATE SET
       total_events=EXCLUDED.total_events, page_views=EXCLUDED.page_views,
       events_with_clickid=EXCLUDED.events_with_clickid,
       visitors_hll=EXCLUDED.visitors_hll, sessions_hll=EXCLUDED.sessions_hll,
       pv_visitors_hll=EXCLUDED.pv_visitors_hll, product_visitors_hll=EXCLUDED.product_visitors_hll,
       cart_visitors_hll=EXCLUDED.cart_visitors_hll, checkout_visitors_hll=EXCLUDED.checkout_visitors_hll,
       purchase_visitors_hll=EXCLUDED.purchase_visitors_hll, identify_visitors_hll=EXCLUDED.identify_visitors_hll,
       refreshed_at=now()`,
    ...args
  );

  // 2) device (14,5)
  touched += await prisma.$executeRawUnsafe(
    `INSERT INTO pixel_daily_device ("organizationId",day,device,visitors_hll,refreshed_at)
     SELECT "organizationId", ${ARDAY}, COALESCE("deviceType",'unknown'), ${HV14}, now()
     FROM pixel_events WHERE ${range}
     GROUP BY 1,2,3
     ON CONFLICT ("organizationId",day,device) DO UPDATE SET
       visitors_hll=EXCLUDED.visitors_hll, refreshed_at=now()`,
    ...args
  );

  // 3) type (16,5)
  touched += await prisma.$executeRawUnsafe(
    `INSERT INTO pixel_daily_type ("organizationId",day,type,event_count,visitors_hll,refreshed_at)
     SELECT "organizationId", ${ARDAY}, type, COUNT(*)::bigint, ${HV16}, now()
     FROM pixel_events WHERE ${range}
     GROUP BY 1,2,3
     ON CONFLICT ("organizationId",day,type) DO UPDATE SET
       event_count=EXCLUDED.event_count, visitors_hll=EXCLUDED.visitors_hll, refreshed_at=now()`,
    ...args
  );

  // 4) page (14,5) — solo PAGE_VIEW, sin checkout, URL sin querystring
  touched += await prisma.$executeRawUnsafe(
    `INSERT INTO pixel_daily_page ("organizationId",day,url,page_views,visitors_hll,refreshed_at)
     SELECT "organizationId", ${ARDAY}, SPLIT_PART("pageUrl",'?',1), COUNT(*)::bigint, ${HV14}, now()
     FROM pixel_events
     WHERE ${range} AND type='PAGE_VIEW' AND "pageUrl" IS NOT NULL AND "pageUrl" NOT LIKE '%/checkout%'
     GROUP BY 1,2,3
     ON CONFLICT ("organizationId",day,url) DO UPDATE SET
       page_views=EXCLUDED.page_views, visitors_hll=EXCLUDED.visitors_hll, refreshed_at=now()`,
    ...args
  );

  // 5) product (14,5) — solo VIEW_PRODUCT con productId
  touched += await prisma.$executeRawUnsafe(
    `INSERT INTO pixel_daily_product ("organizationId",day,product_id,viewers_hll,refreshed_at)
     SELECT "organizationId", ${ARDAY}, props->>'productId', ${HV14}, now()
     FROM pixel_events
     WHERE ${range} AND type='VIEW_PRODUCT' AND props->>'productId' IS NOT NULL
     GROUP BY 1,2,3
     ON CONFLICT ("organizationId",day,product_id) DO UPDATE SET
       viewers_hll=EXCLUDED.viewers_hll, refreshed_at=now()`,
    ...args
  );

  // 6) source (16,5) — JOIN contra la dimensión first-source (debe existir)
  touched += await prisma.$executeRawUnsafe(
    `INSERT INTO pixel_daily_source ("organizationId",day,first_source,pv_visitors_hll,refreshed_at)
     SELECT pe."organizationId", (pe.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, d.first_source,
       hll_add_agg(hll_hash_text(pe."visitorId"), ${P16}) FILTER (WHERE pe.type='PAGE_VIEW'), now()
     FROM pixel_events pe
     JOIN pixel_visitor_first_source d
       ON d."organizationId"=pe."organizationId" AND d."visitorId"=pe."visitorId"
     WHERE pe."organizationId"=$1
       AND pe.timestamp >= $2::timestamptz AND pe.timestamp < $3::timestamptz
       AND (pe.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date >= $4::date
       AND (pe.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <  $5::date
       AND (pe."sessionId" IS NULL OR pe."sessionId" NOT LIKE 'webhook-%')
     GROUP BY 1,2,3
     ON CONFLICT ("organizationId",day,first_source) DO UPDATE SET
       pv_visitors_hll=EXCLUDED.pv_visitors_hll, refreshed_at=now()`,
    ...args
  );

  return touched;
}

// ── Backfill de UN día para TODAS las orgs (itera por org → usa el índice) ────
async function backfillDay(d: string, orgs: string[]): Promise<number> {
  let touched = 0;
  for (const org of orgs) {
    touched += await backfillDayOrg(d, org);
  }
  return touched;
}

// ── first-source de UNA org (full history, DISTINCT ON first touch) ──────────
async function firstSourceForOrg(org: string): Promise<number> {
  return await prisma.$executeRawUnsafe(
    `INSERT INTO pixel_visitor_first_source ("organizationId","visitorId",first_source)
     SELECT DISTINCT ON ("visitorId") "organizationId","visitorId", ${SRC}
     FROM pixel_events
     WHERE "organizationId"=$1 AND timestamp BETWEEN '2023-01-01' AND NOW() AND ${WH}
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
      const processed: Array<{ org: string; visitors: number; ms: number }> = [];
      let i = start;
      for (; i < orgs.length; i++) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) break;
        const t0 = Date.now();
        try {
          const n = await firstSourceForOrg(orgs[i]);
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
              resume: `POST ?phase=first-source&orgCursor=${i}`,
              ms: Date.now() - startedAt,
            },
            { status: 500 }
          );
        }
      }
      const done = i >= orgs.length;
      return NextResponse.json({
        ok: true,
        phase,
        totalOrgs: orgs.length,
        processedThisCall: processed.length,
        processed,
        done,
        nextOrgCursor: done ? null : i,
        next: done
          ? "POST ?phase=backfill"
          : `POST ?phase=first-source&orgCursor=${i}`,
        ms: Date.now() - startedAt,
      });
    }

    // ── FASE backfill (resumible por día; cursor=fecha AR) ───────────────
    if (phase === "backfill") {
      // Guard: la dimensión first-source debe existir y estar poblada (el rollup
      // `source` la JOINea). Si está vacía, abortamos con instrucción clara.
      const fsCount: any = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int c FROM pixel_visitor_first_source`
      );
      if (!fsCount?.[0]?.c) {
        return NextResponse.json(
          {
            ok: false,
            phase,
            error:
              "pixel_visitor_first_source está vacía. Corré POST ?phase=first-source hasta done:true antes del backfill.",
          },
          { status: 409 }
        );
      }

      const range = await globalRange();
      if (!range) {
        return NextResponse.json({ ok: true, phase, done: true, note: "Sin pixel_events para agregar." });
      }
      const from = isYmd(url.searchParams.get("from")) ? url.searchParams.get("from")! : range.lo;
      const to = isYmd(url.searchParams.get("to")) ? url.searchParams.get("to")! : range.hi;
      const cursorParam = url.searchParams.get("cursor");
      let cursor = isYmd(cursorParam) ? cursorParam! : from;
      if (cursor < from) cursor = from;

      // Lista de orgs (una vez). El backfill itera por org → usa el índice
      // (organizationId, timestamp) en vez de seq-scanear los 19M por statement.
      // La sacamos de `pixel_visitor_first_source` (PK lidera con organizationId →
      // DISTINCT por índice, rápido) en vez de `pixel_events` (19M, seq-scan). El guard
      // de arriba ya garantiza que esa dimensión está poblada (toda org con eventos
      // reales no-webhook tiene first_source).
      const orgsRes: any = await prisma.$queryRawUnsafe(
        `SELECT DISTINCT "organizationId" org FROM pixel_visitor_first_source ORDER BY 1`
      );
      const orgs: string[] = orgsRes.map((o: any) => o.org);

      const days: Array<{ day: string; touched: number; ms: number }> = [];
      let lastDone: string | null = null;
      while (cursor <= to) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) break;
        const t0 = Date.now();
        try {
          const touched = await backfillDay(cursor, orgs);
          days.push({ day: cursor, touched, ms: Date.now() - t0 });
          lastDone = cursor;
          cursor = addDays(cursor, 1);
        } catch (e: any) {
          // El día que falló queda como cursor de reanudación. Los días previos
          // ya están commiteados (cada INSERT auto-commitea) y son idempotentes.
          return NextResponse.json(
            {
              ok: false,
              phase,
              window: { from, to },
              daysProcessedThisCall: days.length,
              lastDayDone: lastDone,
              failedDay: cursor,
              error: e.message,
              resume: `POST ?phase=backfill&from=${from}&to=${to}&cursor=${cursor}`,
              ms: Date.now() - startedAt,
            },
            { status: 500 }
          );
        }
      }
      const done = cursor > to;
      return NextResponse.json({
        ok: true,
        phase,
        window: { from, to },
        daysProcessedThisCall: days.length,
        lastDayDone: lastDone,
        days,
        done,
        nextCursor: done ? null : cursor,
        next: done
          ? "Listo. Verificá con GET ?phase=status"
          : `POST ?phase=backfill&from=${from}&to=${to}&cursor=${cursor}`,
        ms: Date.now() - startedAt,
      });
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
