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

import { ADMIN_API_KEY, isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Reconstruye HOY + los (DAYS_BACK-1) días previos (AR-date). 3 = cubre huecos
// de hasta 3 días con un solo run (tolerante a fallos del cron).
const DAYS_BACK = 3;
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
  const baseUrl = `${url.protocol}//${url.host}`;
  const to = arDate(0); // hoy AR
  const from = arDate(DAYS_BACK - 1); // hoy - (N-1)

  const setupBase =
    `${baseUrl}/api/admin/setup-pixel-rollups?phase=backfill` +
    `&from=${from}&to=${to}&key=${encodeURIComponent(ADMIN_API_KEY)}`;

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
    const target = `${setupBase}&cursor=${cursor}`;
    let json: any;
    try {
      const r = await fetch(target, { method: "POST", cache: "no-store" });
      json = await r.json();
    } catch (e: any) {
      error = `fetch failed: ${e?.message?.slice(0, 200)}`;
      break;
    }
    calls.push({
      cursor,
      ok: json?.ok === true,
      done: json?.done === true,
      daysProcessed: json?.daysProcessedThisCall ?? 0,
      ms: json?.ms ?? 0,
    });
    if (json?.ok === false) {
      error = (json?.error || "backfill devolvió ok:false")?.toString().slice(0, 200);
      break;
    }
    if (json?.done === true) {
      done = true;
      break;
    }
    // No terminó pero tampoco trae cursor de avance → cortar para no loopear.
    if (!json?.nextCursor || json.nextCursor === cursor) break;
    cursor = json.nextCursor;
  }

  return NextResponse.json(
    {
      ok: done && !error,
      window: { from, to },
      daysBack: DAYS_BACK,
      done,
      callsCount: calls.length,
      calls,
      error,
      totalMs: Date.now() - startedAt,
    },
    { status: done && !error ? 200 : 500 }
  );
}
