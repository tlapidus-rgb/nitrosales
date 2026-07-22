// ══════════════════════════════════════════════════════════════════════════
// rollup-backfill.ts — Lógica del backfill de rollups HLL del pixel (COMPARTIDA)
// ══════════════════════════════════════════════════════════════════════════
// Extraído de /api/admin/setup-pixel-rollups (fase backfill) para que el cron
// `refresh-pixel-rollups` lo llame DIRECTO (import + función), sin self-fetch
// HTTP. Antes el cron hacía `fetch(${url.host}/api/admin/setup-pixel-rollups)`,
// que cuando Vercel cron lo disparaba apuntaba a la URL del deployment
// (protegida por Deployment Protection) → 401. Llamando la función directo no
// hay HTTP, ni URL, ni auth, ni protección → el bug desaparece.
//
// El endpoint admin `setup-pixel-rollups` ahora también usa `runRollupBackfill`
// (fuente única; mismo upsert idempotente <2% error ya validado en prod).
//
// El SQL HLL es COPIA TEXTUAL del original (NO modificar la precisión ni los
// brackets de fecha sin re-validar vs COUNT(DISTINCT)).
// ══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import { WEBHOOK_SESSION_FILTER } from "@/lib/pixel/first-source-sql";

// ── Presupuesto de tiempo por invocación ────────────────────────────────────
// Paramos antes del maxDuration de Vercel y devolvemos cursor para que el caller
// repita.
//
// ⚠️ POR QUÉ 700s Y NO 250s (bug medido el 2026-07-22):
//   El presupuesto se chequea ANTES de arrancar un día, pero `backfillDay` no
//   tiene tope: recorre las 7 tablas de rollup × todas las orgs. Con budget 250s
//   y maxDuration 300s el margen era de 50s, y un día pesado tarda mucho más.
//   El 5 de mayo (pico de Hot Sale) no entraba NI SOLO en 300s: la función moría
//   con 504 FUNCTION_INVOCATION_TIMEOUT y body vacío, así que el caller no se
//   enteraba de por qué ni por dónde seguir. Tres reintentos, tres 504.
//
//   El fix tiene dos mitades y ninguna sirve sola:
//     1. Subir el techo: la ruta pasa a maxDuration 800 (lo que ya usan sync y
//        cron; `app/api/admin/**` simplemente no estaba en vercel.json).
//     2. No arrancar un día que no vamos a poder terminar (ver DAY_RESERVE_MS).
//        Sin esto, subir el techo sólo mueve el día en que vuelve a explotar.
export const TIME_BUDGET_MS = 700_000;

// Cuánto tiempo hay que tener libre para animarse a arrancar OTRO día. Se
// calibra solo: arranca en este piso y sube al día más lento visto en la
// invocación. Un día que tarda más que el presupuesto entero igual va a fallar,
// pero eso ahora devuelve un JSON con `failedDay` en vez de un 504 mudo.
const DAY_RESERVE_FLOOR_MS = 180_000;

/**
 * ¿Alcanza el tiempo que queda para arrancar OTRO día?
 *
 * Pura y exportada porque es la regla que falló: el chequeo viejo era
 * `elapsed > budget`, que autoriza arrancar un día en el segundo 699 de 700.
 * `backfillDay` no tiene tope, así que ese día se pasa del maxDuration y Vercel
 * devuelve un 504 con body vacío — sin cursor, sin días hechos, sin nada.
 *
 * No se puede testear `runRollupBackfill` entera (PGlite no trae `hll`), así que
 * la decisión vive acá para poder verificarla. Ver rollup-backfill-budget.test.ts.
 */
export function canStartAnotherDay(
  elapsedMs: number,
  reserveMs: number,
  budgetMs: number
): boolean {
  return elapsedMs + reserveMs <= budgetMs;
}

// ── Constantes SQL (espejo exacto de setup-pixel-rollups / scripts p2*) ──────
const P14 = "14, 5";
const P16 = "16, 5";
const ARDAY = `(timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;
const WH = WEBHOOK_SESSION_FILTER;
const HV14 = `hll_add_agg(hll_hash_text("visitorId"), ${P14})`;
const HV16 = `hll_add_agg(hll_hash_text("visitorId"), ${P16})`;
const CLICKID = `("clickIds" IS NOT NULL AND "clickIds"::text != '{}' AND "clickIds"::text != 'null')`;

// ── Helpers de fecha (UTC) ──────────────────────────────────────────────────
export const addDays = (s: string, n: number): string => {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const isYmd = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Rango global (AR-date) de pixel_events; null si no hay eventos.
export async function globalRange(): Promise<{ lo: string; hi: string } | null> {
  const r: any = await prisma.$queryRawUnsafe(
    `SELECT TO_CHAR((MIN(timestamp) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,'YYYY-MM-DD') lo,
            TO_CHAR((MAX(timestamp) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,'YYYY-MM-DD') hi
     FROM pixel_events WHERE timestamp BETWEEN '2023-01-01' AND NOW()`
  );
  const lo = r?.[0]?.lo, hi = r?.[0]?.hi;
  return isYmd(lo) && isYmd(hi) ? { lo, hi } : null;
}

// ── Backfill de UN día para UNA org (un statement por tabla) ─────────────────
// CLAVE DE PERFORMANCE: filtra `"organizationId"=$1` PRIMERO para usar el índice
// (organizationId, timestamp). Bracket UTC generoso (±1 día) + filtro AR-date exacto.
async function backfillDayOrg(d: string, org: string): Promise<number> {
  const dLo = d;
  const dHi = addDays(d, 1);
  const tsLo = addDays(dLo, -1) + "T00:00:00Z";
  const tsHi = addDays(dHi, 1) + "T00:00:00Z";
  const args = [org, tsLo, tsHi, dLo, dHi];
  const range = `"organizationId"=$1 AND timestamp >= $2::timestamptz AND timestamp < $3::timestamptz
    AND ${ARDAY} >= $4::date AND ${ARDAY} < $5::date AND ${WH}`;

  let touched = 0;

  // 1) aggregates (14,5)
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

  // 5) product (14,5) — VIEW_PRODUCT, con el id RESUELTO POR NOMBRE cuando falta.
  //
  // El 46% de los VIEW_PRODUCT de Arredo no traen `productId` pero sí
  // `productName` (770.538 de 1.731.186 en 30 días). Antes se descartaban, así
  // que el denominador del CR quedaba por debajo y todo el CR aparecía inflado.
  // Ahora se resuelven contra `pixel_product_name`, que solo contiene nombres
  // UNÍVOCOS (819 de 850 en Arredo → recupera 513.066 eventos, 66,6%).
  //
  // El LEFT JOIN es deliberado: si el nombre no está en la dim (ambiguo o nunca
  // visto con id), el COALESCE queda NULL y el WHERE lo descarta, igual que
  // antes. Nunca inventamos una atribución.
  // El id resuelto: el que trae el evento o, si falta, el del diccionario.
  // Subconsulta correlacionada en vez de JOIN para no tener que re-aliasar
  // `range`/`ARDAY`/`HV14`, que son copia textual validada contra COUNT(DISTINCT).
  // Es un lookup por PK (organizationId, product_name): barato.
  const RESOLVED_PID = `COALESCE(
    props->>'productId',
    (SELECT d.product_id FROM pixel_product_name d
      WHERE d."organizationId" = pixel_events."organizationId"
        AND d.product_name = props->>'productName')
  )`;

  touched += await prisma.$executeRawUnsafe(
    `INSERT INTO pixel_daily_product ("organizationId",day,product_id,viewers_hll,refreshed_at)
     SELECT "organizationId", ${ARDAY}, ${RESOLVED_PID}, ${HV14}, now()
     FROM pixel_events
     WHERE ${range} AND type='VIEW_PRODUCT' AND ${RESOLVED_PID} IS NOT NULL
     GROUP BY 1,2,3
     ON CONFLICT ("organizationId",day,product_id) DO UPDATE SET
       viewers_hll=EXCLUDED.viewers_hll, refreshed_at=now()`,
    ...args
  );

  // 6) source (16,5) — LEFT JOIN contra la dimensión first-source.
  //
  // ⚠️ ERA UN INNER JOIN, y eso hacía DESAPARECER visitantes (2026-07-21).
  // Un visitante sin fila en la dimensión no caía en un bucket "sin clasificar":
  // se caía de la tabla entera. Resultado: la suma de la columna "Visitantes" de
  // /pixel/analytics NUNCA podía cerrar contra el total, y nada en la UI lo
  // decía. El cliente lo reportó como "faltan visitas".
  //
  // Quiénes son: los ~13.000 marcados en pixel_visitor_no_source (todos sus
  // eventos clasifican a NULL — pasarelas de pago, vueltas de checkout) más los
  // que van entrando antes de que el cron diario los procese.
  //
  // Con LEFT JOIN + COALESCE caen en 'sin_clasificar' y el total cierra. Es más
  // honesto además: un visitante sin canal de marketing EXISTE, y esconderlo es
  // peor que mostrarlo en su propio bucket.
  touched += await prisma.$executeRawUnsafe(
    `INSERT INTO pixel_daily_source ("organizationId",day,first_source,pv_visitors_hll,refreshed_at)
     SELECT pe."organizationId", (pe.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
       COALESCE(d.first_source, 'sin_clasificar'),
       hll_add_agg(hll_hash_text(pe."visitorId"), ${P16}) FILTER (WHERE pe.type='PAGE_VIEW'), now()
     FROM pixel_events pe
     LEFT JOIN pixel_visitor_first_source d
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

  // 7) funnel by source (14,5) — pasos del funnel (PV/VP/ATC/checkout) por canal
  //    de primer toque. JOIN contra la dimensión first-source (igual que #6). Lo
  //    consume /api/metrics/pixel/funnel?channel=... en sub-segundo (antes escaneaba
  //    pixel_events crudo → >75s en rangos amplios). Misma precisión (14,5) que la
  //    tabla, para poder unir los HLL entre días.
  touched += await prisma.$executeRawUnsafe(
    `INSERT INTO pixel_daily_funnel_by_source ("organizationId",day,first_source,pv_hll,vp_hll,atc_hll,co_hll,refreshed_at)
     SELECT pe."organizationId", (pe.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
       COALESCE(d.first_source, 'sin_clasificar'),
       hll_add_agg(hll_hash_text(pe."visitorId"), ${P14}) FILTER (WHERE pe.type='PAGE_VIEW'),
       hll_add_agg(hll_hash_text(pe."visitorId"), ${P14}) FILTER (WHERE pe.type='VIEW_PRODUCT'),
       hll_add_agg(hll_hash_text(pe."visitorId"), ${P14}) FILTER (WHERE pe.type='ADD_TO_CART'),
       hll_add_agg(hll_hash_text(pe."visitorId"), ${P14}) FILTER (WHERE pe.type IN ('INITIATE_CHECKOUT','CHECKOUT_SHIPPING')),
       now()
     FROM pixel_events pe
     LEFT JOIN pixel_visitor_first_source d
       ON d."organizationId"=pe."organizationId" AND d."visitorId"=pe."visitorId"
     WHERE pe."organizationId"=$1
       AND pe.timestamp >= $2::timestamptz AND pe.timestamp < $3::timestamptz
       AND (pe.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date >= $4::date
       AND (pe.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <  $5::date
       AND (pe."sessionId" IS NULL OR pe."sessionId" NOT LIKE 'webhook-%')
     GROUP BY 1,2,3
     ON CONFLICT ("organizationId",day,first_source) DO UPDATE SET
       pv_hll=EXCLUDED.pv_hll, vp_hll=EXCLUDED.vp_hll, atc_hll=EXCLUDED.atc_hll, co_hll=EXCLUDED.co_hll, refreshed_at=now()`,
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

export interface BackfillRunResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

// ── Runner del backfill (resumible por día; cursor=fecha AR) ──────────────────
// Devuelve { httpStatus, body } para que el caller (endpoint admin o cron) arme
// la respuesta / decida el loop. Mismo contrato de respuesta que el endpoint
// original (window, daysProcessedThisCall, lastDayDone, days, done, nextCursor).
export async function runRollupBackfill(params: {
  from?: string | null;
  to?: string | null;
  cursor?: string | null;
  budgetMs?: number;
  /**
   * Acotar a UNA org. Válvula de escape para días que no entran ni con el
   * presupuesto completo: divide el trabajo del día por la cantidad de orgs.
   * Sin esto, un día pico es un callejón sin salida operativo.
   */
  org?: string | null;
}): Promise<BackfillRunResult> {
  const startedAt = Date.now();
  const budget = params.budgetMs ?? TIME_BUDGET_MS;

  // Guard: la dimensión first-source debe existir y estar poblada (el rollup
  // `source` la JOINea). Si está vacía, abortamos con instrucción clara.
  const fsCount: any = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int c FROM pixel_visitor_first_source`
  );
  if (!fsCount?.[0]?.c) {
    return {
      httpStatus: 409,
      body: {
        ok: false,
        phase: "backfill",
        error:
          "pixel_visitor_first_source está vacía. Corré POST ?phase=first-source hasta done:true antes del backfill.",
      },
    };
  }

  const range = await globalRange();
  if (!range) {
    return {
      httpStatus: 200,
      body: { ok: true, phase: "backfill", done: true, note: "Sin pixel_events para agregar." },
    };
  }
  const from = isYmd(params.from) ? params.from : range.lo;
  const to = isYmd(params.to) ? params.to : range.hi;
  let cursor = isYmd(params.cursor) ? params.cursor : from;
  if (cursor < from) cursor = from;

  // Lista de orgs desde `pixel_visitor_first_source` (PK lidera con organizationId
  // → DISTINCT por índice). El guard de arriba garantiza que está poblada.
  const orgsRes: any = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT "organizationId" org FROM pixel_visitor_first_source ORDER BY 1`
  );
  let orgs: string[] = orgsRes.map((o: any) => o.org);
  if (params.org) {
    orgs = orgs.filter((o) => o === params.org);
    if (orgs.length === 0) {
      return {
        httpStatus: 400,
        body: {
          ok: false,
          phase: "backfill",
          error: `La org "${params.org}" no tiene filas en pixel_visitor_first_source.`,
        },
      };
    }
  }

  const days: Array<{ day: string; touched: number; ms: number }> = [];
  let lastDone: string | null = null;
  // Se calibra sola con el día más lento visto. Ver DAY_RESERVE_FLOOR_MS.
  let dayReserveMs = DAY_RESERVE_FLOOR_MS;
  let stoppedForBudget = false;
  while (cursor <= to) {
    // ⚠️ La reserva es lo que evita el 504. Chequear sólo `elapsed > budget`
    // deja arrancar un día en el segundo 699 que después tarda 200s.
    if (!canStartAnotherDay(Date.now() - startedAt, dayReserveMs, budget)) {
      stoppedForBudget = true;
      break;
    }
    const t0 = Date.now();
    try {
      const touched = await backfillDay(cursor, orgs);
      const dayMs = Date.now() - t0;
      days.push({ day: cursor, touched, ms: dayMs });
      // El día más lento visto manda la reserva del próximo: los días de pico
      // (Hot Sale) tardan varias veces más que un día normal, y el promedio los
      // esconde justo cuando importan.
      if (dayMs > dayReserveMs) dayReserveMs = dayMs;
      lastDone = cursor;
      cursor = addDays(cursor, 1);
    } catch (e: any) {
      return {
        httpStatus: 500,
        body: {
          ok: false,
          phase: "backfill",
          window: { from, to },
          daysProcessedThisCall: days.length,
          lastDayDone: lastDone,
          failedDay: cursor,
          error: e.message,
          resume: `POST ?phase=backfill&from=${from}&to=${to}&cursor=${cursor}`,
          ms: Date.now() - startedAt,
        },
      };
    }
  }
  const done = cursor > to;
  const orgQs = params.org ? `&org=${params.org}` : "";
  return {
    httpStatus: 200,
    body: {
      ok: true,
      phase: "backfill",
      window: { from, to },
      org: params.org ?? null,
      daysProcessedThisCall: days.length,
      lastDayDone: lastDone,
      days,
      done,
      // Distingue "terminé el rango" de "corté por presupuesto". Sin esto, un
      // `done:false` no dice si hay que repetir o si algo se atascó.
      stoppedForBudget,
      // Cuánto hay que reservar para el próximo día, medido en esta corrida. Si
      // supera el presupuesto, el rango no avanza más sin acotar por `org`.
      slowestDayMs: days.length ? Math.max(...days.map((d) => d.ms)) : 0,
      nextCursor: done ? null : cursor,
      next: done
        ? "Listo. Verificá con GET ?phase=status"
        : `POST ?phase=backfill&from=${from}&to=${to}&cursor=${cursor}${orgQs}`,
      ms: Date.now() - startedAt,
    },
  };
}
