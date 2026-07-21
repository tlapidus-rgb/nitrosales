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
// Schedule: 1×/día (vercel.json: `0 6 * * *` = 6am UTC = 3am ART).
// Auth: header `user-agent: vercel-cron` (Vercel) o `?key=<ADMIN_API_KEY>`.
//
// ⚠️ Deuda compartida: el self-fetch manda la key en la URL (queda en logs) —
// mismo patrón que el resto de los crons; se cierra con CRON_SECRET (BP-M1).
// ══════════════════════════════════════════════════════════════════════════

import { ADMIN_API_KEY, isValidAdminKey } from "@/lib/admin-key";
import { decideNextCall } from "@/lib/pixel/first-source-progress";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// first-source escanea historia completa por org → puede necesitar varias
// llamadas de 250s al setup. 800 da margen (igual presupuesto que vercel.json
// declara para app/api/cron/**).
export const maxDuration = 800;

// Tope de llamadas al setup por run (resumible por org; tope evita loop infinito).
const MAX_CALLS = 30;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const isVercelCron = req.headers.get("user-agent")?.includes("vercel-cron");
  if (!isVercelCron && !isValidAdminKey(key)) {
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

  for (let i = 0; i < MAX_CALLS; i++) {
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

  return NextResponse.json(
    {
      ok: done && !error,
      done,
      callsCount: calls.length,
      calls,
      error,
      totalMs: Date.now() - startedAt,
    },
    { status: done && !error ? 200 : 500 }
  );
}
