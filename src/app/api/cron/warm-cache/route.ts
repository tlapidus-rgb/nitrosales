// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/cron/warm-cache
// ══════════════════════════════════════════════════════════════
// Pre-calienta el cache SWR de los endpoints pesados (/api/metrics/pixel
// y /api/metrics/products) para todas las orgs activas con los rangos
// más usados. Asi cuando el cliente abre el dashboard, siempre
// encuentra cache fresh — nunca paga el costo completo de las queries.
//
// Trigger: Vercel Cron (configurado en vercel.json) cada 5 min para
// mantener el cache dentro del fresh window de api-cache (5 min).
// Tambien se puede ejecutar manualmente:
//   curl https://nitrosales.vercel.app/api/cron/warm-cache?key=...
//
// ⚠️ ANTI-THUNDERING-HERD (2026-06-12): warmea SECUENCIALMENTE (1 fetch a la
// vez). El SWR fue revertido una vez porque el warm-cron viejo hacia
// `Promise.all(orgs.map(...))` = N orgs en paralelo × queries pesadas →
// saturaba la DB (pool 24). Ahora es estrictamente secuencial: org → rango →
// endpoint, uno por uno, con presupuesto de tiempo. Toca cada key; el SWR se
// encarga de refrescar las stale en background.
//
// ⚠️ LIMITACIÓN SERVERLESS: el cache de api-cache es in-memory POR INSTANCIA.
// El self-fetch calienta la instancia que atienda el request (no siempre la del
// cron). Para tráfico bajo Vercel reusa pocas instancias calientes, así que en
// la práctica ayuda. Solución multi-instancia completa = cache compartido (KV).
// ══════════════════════════════════════════════════════════════

import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/send";
import {
  checkPipelineFreshness,
  formatStaleSummary,
  type FreshnessRow,
} from "@/lib/pipeline/freshness";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — warm de N orgs puede tardar

const WARM_CACHE_KEY = ADMIN_API_KEY;

// ── BP-ROLLUP-CRON (2026-06-21): alerta de rollup stale ──────────────────────
// El cron `refresh-pixel-rollups` (cada 2h) puede dejar de dispararse en Vercel
// sin aviso (pasó del 16 al 21-jun: 5 días con los gráficos del pixel en 0 y
// nadie se enteró hasta que se quejó el cliente). warm-cache corre cada 5 min →
// es buen lugar para detectarlo. Si el último refresh del rollup tiene más de
// los umbrales por tabla, log + email (con cooldown para no spamear cada 5 min).
// Los umbrales viven en src/lib/pipeline/freshness.ts, uno por tabla.
const ALERT_COOLDOWN_H = 6;
const ROLLUP_ALERT_TO = "tlapidus@99media.com.ar";

// Cooldown en memoria (módulo). No depende de ninguna tabla. En serverless,
// Vercel reusa instancias calientes para crons frecuentes, así que en la
// práctica evita el spam cada 5 min. Si rotan instancias podría mandar algún
// mail extra dentro de la ventana — aceptable para una alerta de respaldo rara.
let lastRollupAlertSent = 0;

/**
 * Alerta de tablas del pipeline sin refrescar.
 *
 * Antes miraba UNA tabla (`pixel_daily_aggregates`), y se construyó después de
 * que ese rollup estuviera caído 5 días en junio. La lección no se había
 * transferido a las 6 tablas Silver/Gold que hoy respaldan el header de revenue
 * (auditoría 2026-07-21, A2): no tenían ningún monitoreo.
 *
 * El caso que esto tiene que atrapar no es "el cron explota" —eso queda en los
 * logs— sino "el cron deja de existir". `refresh-pixel-first-source` estuvo
 * CINCO SEMANAS fuera de vercel.json y la brecha creció todos los días sin que
 * nada avisara.
 */
async function maybeAlertPipelineStale(stale: FreshnessRow[]) {
  if (stale.length === 0) return;
  if (Date.now() - lastRollupAlertSent < ALERT_COOLDOWN_H * 3600_000) return; // cooldown
  lastRollupAlertSent = Date.now(); // marcar ANTES del await (evita doble envío en carrera)
  const lines = stale
    .map(
      (r) =>
        `<li><code>${r.table}</code>: sin refrescar hace <b>${r.hoursStale}h</b> (último: ${
          r.lastRefresh || "?"
        }) — lo refresca <code>${r.refreshedBy}</code></li>`
    )
    .join("");
  const crons = Array.from(new Set(stale.map((r) => r.refreshedBy)));
  try {
    await sendEmail({
      to: ROLLUP_ALERT_TO,
      subject: `⚠️ NitroSales: ${stale.length} tabla(s) del pipeline sin refrescar`,
      html: `<p>Estas tablas dejaron de actualizarse:</p><ul>${lines}</ul>
<p>Causa más probable: uno de estos crons dejó de dispararse en Vercel — ${crons
        .map((c) => `<code>${c}</code>`)
        .join(", ")}. Ojo que un cron REMOVIDO de <code>vercel.json</code> no falla ni deja logs: simplemente no pasa nada, y los números se quedan viejos en silencio.</p>
<p>Acción: revisar <b>Vercel → Cron Jobs</b> y confirmar que sigan agendados. Los rollups son idempotentes: en cuanto vuelvan a correr, tapan el hueco solos.</p>`,
      context: "pipeline-stale-alert",
    });
  } catch (e: any) {
    console.error("[warm-cache] alert pipeline stale falló:", e?.message);
  }
}

// Rangos comunes que precalentamos para cada org.
// Formato: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
function getRanges() {
  const now = new Date();
  // Argentina TZ -3
  const arNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const today = new Date(arNow);
  today.setUTCHours(0, 0, 0, 0);

  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  return [
    // Hoy
    { label: "today", from: fmt(today), to: fmt(today) },
    // Ayer
    { label: "yesterday", from: fmt(yesterday), to: fmt(yesterday) },
    // Ultimos 7 dias
    { label: "7d", from: fmt(sevenDaysAgo), to: fmt(today) },
    // Ultimos 30 dias
    { label: "30d", from: fmt(thirtyDaysAgo), to: fmt(today) },
  ];
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    // Auth: SÓLO por key. El bypass por `user-agent: vercel-cron` (spoofeable) se
    // quitó (auditoría 2026-07-22): Vercel Cron manda la key en vercel.json.
    if (key !== WARM_CACHE_KEY) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const baseUrl = `${url.protocol}//${url.host}`;
    const ranges = getRanges();

    // Presupuesto de tiempo desde EL PRINCIPIO de la función (incluye la query de
    // activeOrgs). BUG PREVIO: startedAt se seteaba DESPUÉS de esa query; si tardaba
    // (scan de pixel_events), ese tiempo NO contaba y budget(250s) + query se pasaban
    // del maxDuration=300 → 504. Ahora todo el trabajo entra en el presupuesto.
    const startedAt = Date.now();

    // Listar orgs ACTIVAS — con al menos 1 evento pixel en los últimos 30 días.
    // EXISTS (no JOIN+DISTINCT): corta en la 1ra fila por org → mucho más barato
    // sobre pixel_events (evita el scan/dedup que arrastraba la función hacia el wall).
    // Se trae también el modelo de atribución por defecto de la org: desde el fix
    // de la cache key (auditoría 2026-07-21) `model` es PARTE de la key, y la UI
    // SIEMPRE manda `&model=` (pixel/page.tsx:466). Sin esto el warm calentaría
    // la key "orgdefault", que ningún usuario consulta → el cron correría igual
    // de caro y la primera carga del día seguiría pagando los ~17s completos.
    const activeOrgs = await prisma.$queryRawUnsafe<
      Array<{ id: string; name: string; attribution_model: string | null }>
    >(`
      SELECT o.id, o.name, o.settings->>'attributionModel' AS attribution_model
      FROM organizations o
      WHERE EXISTS (
        SELECT 1 FROM pixel_events pe
        WHERE pe."organizationId" = o.id
          AND pe.timestamp > NOW() - INTERVAL '30 days'
      )
    `);

    // Espejo de la resolución del endpoint y de la UI: settings → NITRO, y
    // CUSTOM se pide como NITRO (pixel/page.tsx:451). Si divergen, el warm
    // vuelve a calentar una key que nadie pide.
    const VALID_WARM_MODELS = ["LAST_CLICK", "FIRST_CLICK", "LINEAR", "NITRO"];
    const warmModelFor = (raw: string | null): string => {
      const m = (raw || "NITRO").toUpperCase();
      if (m === "CUSTOM") return "NITRO";
      return VALID_WARM_MODELS.includes(m) ? m : "NITRO";
    };

    const results: Array<{
      orgId: string;
      orgName: string;
      endpoint: string;
      range: string;
      ms: number;
      ok: boolean;
      error?: string;
    }> = [];

    // Endpoints PESADOS con SWR a precalentar. (orders/pnl/customers son <1s, no
    // necesitan warm; products es el más caro junto con pixel.)
    const endpoints = [
      "/api/metrics/pixel",
      "/api/metrics/products",
    ];

    // SECUENCIAL: org → rango → endpoint, un fetch a la vez (anti-herd).
    // Timeout POR fetch: un self-fetch colgado NO puede bloquear la función entera.
    // El chequeo de presupuesto es ENTRE fetches, no puede cortar uno en vuelo → por
    // eso cada fetch tiene su propio AbortSignal. 20s ≤ el GLOBAL_TIMEOUT del pixel.
    const PER_FETCH_TIMEOUT_MS = 20_000;
    // 220s (desde el inicio de la función) + 20s del último fetch = 240s < 300
    // (maxDuration), con margen de sobra para la query de activeOrgs y el cierre.
    const TIME_BUDGET_MS = 220_000;
    let budgetHit = false;
    outer: for (const org of activeOrgs) {
      for (const range of ranges) {
        for (const endpoint of endpoints) {
          if (Date.now() - startedAt > TIME_BUDGET_MS) { budgetHit = true; break outer; }
          const start = Date.now();
          // `model` solo aplica a /api/metrics/pixel (es parte de SU cache key).
          const modelParam =
            endpoint === "/api/metrics/pixel"
              ? `&model=${warmModelFor(org.attribution_model)}`
              : "";
          const target = `${baseUrl}${endpoint}?orgId=${encodeURIComponent(
            org.id
          )}&key=${WARM_CACHE_KEY}&from=${range.from}&to=${range.to}${modelParam}`;
          try {
            const r = await fetch(target, {
              method: "GET",
              cache: "no-store",
              // Corta el fetch si un endpoint se cuelga (ver PER_FETCH_TIMEOUT_MS).
              // El AbortError cae al catch de abajo → se registra como fail y sigue.
              signal: AbortSignal.timeout(PER_FETCH_TIMEOUT_MS),
              // Bypass de Vercel Deployment Protection (BP-ROLLUP-CRON / Fix 2b):
              // sin esto, cuando Vercel cron dispara warm-cache el self-fetch va a
              // la URL del deployment (protegida) y da 401. El secret lo provee
              // Vercel como System env var al activar "Protection Bypass for
              // Automation". En local (sin la env) no se manda header (no aplica).
              headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
                : undefined,
            });
            results.push({
              orgId: org.id,
              orgName: org.name,
              endpoint,
              range: range.label,
              ms: Date.now() - start,
              ok: r.ok,
              error: r.ok ? undefined : `status ${r.status}`,
            });
          } catch (e: any) {
            results.push({
              orgId: org.id,
              orgName: org.name,
              endpoint,
              range: range.label,
              ms: Date.now() - start,
              ok: false,
              error: e.message?.slice(0, 100),
            });
          }
        }
      }
    }

    const totalOk = results.filter((r) => r.ok).length;
    const totalFail = results.filter((r) => !r.ok).length;
    const totalMs = results.reduce((s, r) => s + r.ms, 0);
    const avgMs = results.length > 0 ? Math.round(totalMs / results.length) : 0;

    // ── Frescura de TODO el pipeline (Silver + Gold + rollups del pixel) ──
    // Antes sólo se miraba pixel_daily_aggregates. Ver src/lib/pipeline/freshness.ts.
    let freshness: FreshnessRow[] = [];
    let staleTables: FreshnessRow[] = [];
    try {
      freshness = await checkPipelineFreshness();
      staleTables = freshness.filter((r) => r.stale);
      if (staleTables.length > 0) {
        console.error(
          `[warm-cache] ⚠️ PIPELINE STALE:\n${formatStaleSummary(freshness)}`
        );
        // Solo intentar el mail si queda margen: sendEmail no tiene timeout y no
        // puede empujar la función sobre el maxDuration. Si no hay tiempo, se saltea
        // (el próximo run cada 5 min lo reintenta).
        if (Date.now() - startedAt < 260_000) {
          await maybeAlertPipelineStale(staleTables);
        }
      }
    } catch (e: any) {
      console.error("[warm-cache] check rollup stale falló:", e?.message);
    }

    return NextResponse.json({
      ok: true,
      // Frescura de TODO el pipeline. `stale` lista sólo las atrasadas para que
      // se lea de un vistazo; `freshness` trae la foto completa (incluidas las
      // que todavía no existen, marcadas `missing`).
      stale: staleTables.map((r) => ({
        table: r.table,
        hoursStale: r.hoursStale,
        refreshedBy: r.refreshedBy,
      })),
      freshness,
      orgsWarmed: activeOrgs.length,
      rangesWarmed: ranges.length,
      endpointsWarmed: endpoints.length,
      totalRequests: results.length,
      ok_count: totalOk,
      fail_count: totalFail,
      avgMs,
      budgetHit,
      totalMs: Date.now() - startedAt,
      results,
    });
  } catch (err: any) {
    console.error("[warm-cache] error:", err);
    return NextResponse.json(
      { error: err.message, stack: err.stack?.slice(0, 500) },
      { status: 500 }
    );
  }
}
