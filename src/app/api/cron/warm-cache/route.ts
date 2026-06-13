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

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — warm de N orgs puede tardar

const WARM_CACHE_KEY = ADMIN_API_KEY;

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

    return NextResponse.json({
      ok: true,
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
