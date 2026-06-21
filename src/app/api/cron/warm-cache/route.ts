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

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — warm de N orgs puede tardar

const WARM_CACHE_KEY = ADMIN_API_KEY;

// ── BP-ROLLUP-CRON (2026-06-21): alerta de rollup stale ──────────────────────
// El cron `refresh-pixel-rollups` (cada 2h) puede dejar de dispararse en Vercel
// sin aviso (pasó del 16 al 21-jun: 5 días con los gráficos del pixel en 0 y
// nadie se enteró hasta que se quejó el cliente). warm-cache corre cada 5 min →
// es buen lugar para detectarlo. Si el último refresh del rollup tiene más de
// STALE_HOURS horas, log + email (con cooldown para no spamear cada 5 min).
const STALE_HOURS = 5;
const ALERT_COOLDOWN_H = 6;
const ROLLUP_ALERT_TO = "tlapidus@99media.com.ar";

// Cooldown en memoria (módulo). No depende de ninguna tabla. En serverless,
// Vercel reusa instancias calientes para crons frecuentes, así que en la
// práctica evita el spam cada 5 min. Si rotan instancias podría mandar algún
// mail extra dentro de la ventana — aceptable para una alerta de respaldo rara.
let lastRollupAlertSent = 0;

async function maybeAlertRollupStale(hours: number, lastRefresh: string | null) {
  if (Date.now() - lastRollupAlertSent < ALERT_COOLDOWN_H * 3600_000) return; // cooldown
  lastRollupAlertSent = Date.now(); // marcar ANTES del await (evita doble envío en carrera)
  try {
    await sendEmail({
      to: ROLLUP_ALERT_TO,
      subject: `⚠️ NitroSales: rollups del pixel sin refrescar hace ${hours}h`,
      html: `<p>El rollup <code>pixel_daily_aggregates</code> no se refresca hace <b>${hours}h</b> (último refresh: ${lastRefresh || "?"}).</p>
<p>Causa probable: el cron <code>refresh-pixel-rollups</code> dejó de dispararse en Vercel. Mientras tanto, los gráficos de <code>/pixel/analytics</code> (eventos por día, dispositivos, top páginas) muestran 0 en los días sin refresh.</p>
<p>Acción: revisar <b>Vercel → Cron Jobs → refresh-pixel-rollups</b>. El cron ahora es auto-reparable: en cuanto vuelva a correr, tapa el hueco solo.</p>`,
      context: "rollup-stale-alert",
    });
  } catch (e: any) {
    console.error("[warm-cache] alert rollup stale falló:", e?.message);
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
    const isVercelCron = req.headers.get("user-agent")?.includes("vercel-cron");
    if (!isVercelCron && key !== WARM_CACHE_KEY) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const baseUrl = `${url.protocol}//${url.host}`;
    const ranges = getRanges();

    // Listar orgs ACTIVAS — las que tienen al menos 1 evento pixel
    // en los ultimos 30 dias (cliente real, no test).
    const activeOrgs = await prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(`
      SELECT DISTINCT o.id, o.name
      FROM organizations o
      JOIN pixel_events pe ON pe."organizationId" = o.id
      WHERE pe.timestamp > NOW() - INTERVAL '30 days'
    `);

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
    // Presupuesto de tiempo para no chocar contra maxDuration.
    const startedAt = Date.now();
    const TIME_BUDGET_MS = 270_000;
    let budgetHit = false;
    outer: for (const org of activeOrgs) {
      for (const range of ranges) {
        for (const endpoint of endpoints) {
          if (Date.now() - startedAt > TIME_BUDGET_MS) { budgetHit = true; break outer; }
          const start = Date.now();
          const target = `${baseUrl}${endpoint}?orgId=${encodeURIComponent(
            org.id
          )}&key=${WARM_CACHE_KEY}&from=${range.from}&to=${range.to}`;
          try {
            const r = await fetch(target, { method: "GET", cache: "no-store" });
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

    // ── Chequeo de rollup stale (detección del cron de rollups caído) ──
    let rollupStale: {
      stale: boolean;
      hoursStale: number | null;
      lastRefresh: string | null;
    } = { stale: false, hoursStale: null, lastRefresh: null };
    try {
      const rs = await prisma.$queryRawUnsafe<
        Array<{ last: Date | null; hours: number | null }>
      >(
        `SELECT MAX(refreshed_at) AS last,
                EXTRACT(EPOCH FROM (NOW() - MAX(refreshed_at)))/3600 AS hours
         FROM pixel_daily_aggregates`
      );
      const hours =
        rs?.[0]?.hours != null ? Math.round(Number(rs[0].hours) * 10) / 10 : null;
      const last = rs?.[0]?.last ? new Date(rs[0].last).toISOString() : null;
      rollupStale = {
        stale: hours != null && hours > STALE_HOURS,
        hoursStale: hours,
        lastRefresh: last,
      };
      if (rollupStale.stale) {
        console.error(
          `[warm-cache] ⚠️ ROLLUP STALE: pixel_daily_aggregates sin refrescar hace ${hours}h (último: ${last}). El cron refresh-pixel-rollups no está corriendo.`
        );
        await maybeAlertRollupStale(hours as number, last);
      }
    } catch (e: any) {
      console.error("[warm-cache] check rollup stale falló:", e?.message);
    }

    return NextResponse.json({
      ok: true,
      rollupStale,
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
