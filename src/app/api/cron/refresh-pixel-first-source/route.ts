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
//  • IDEMPOTENTE: el upsert es ON CONFLICT DO UPDATE first_source=EXCLUDED;
//    first-touch es determinístico (ORDER BY timestamp ASC) → re-correr
//    re-escribe el mismo valor. Seguro de correr N veces.
//  • RESUMIBLE: la fase first-source es resumible POR ORG (devuelve nextOrgCursor
//    mientras done:false). El loop sigue el cursor hasta done:true.
//
// Schedule: 1×/día (vercel.json: `0 6 * * *` = 6am UTC = 3am ART).
// Auth: header `user-agent: vercel-cron` (Vercel) o `?key=<ADMIN_API_KEY>`.
//
// ⚠️ Deuda compartida: el self-fetch manda la key en la URL (queda en logs) —
// mismo patrón que el resto de los crons; se cierra con CRON_SECRET (BP-M1).
// ══════════════════════════════════════════════════════════════════════════

import { ADMIN_API_KEY, isValidAdminKey } from "@/lib/admin-key";
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
  const setupBase =
    `${baseUrl}/api/admin/setup-pixel-rollups?phase=first-source` +
    `&key=${encodeURIComponent(ADMIN_API_KEY)}`;

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
      json = await r.json();
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
    if (json?.done === true) {
      done = true;
      break;
    }
    // No terminó pero no avanza el cursor → cortar para no loopear.
    const next = json?.nextOrgCursor;
    if (next === null || next === undefined || next === orgCursor) break;
    orgCursor = next;
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
