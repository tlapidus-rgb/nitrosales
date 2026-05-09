// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/cron/warm-cache
// ══════════════════════════════════════════════════════════════
// Pre-calienta el cache de los endpoints pesados (/api/metrics/pixel
// y /api/metrics/orders) para todas las orgs activas con los rangos
// más usados. Asi cuando el cliente abre el dashboard, siempre
// encuentra cache fresh — nunca paga el costo completo de las queries.
//
// Trigger: Vercel Cron (configurado en vercel.json) cada 30 min.
// Tambien se puede ejecutar manualmente:
//   curl https://nitrosales.vercel.app/api/cron/warm-cache?key=...
//
// Volumen estimado: ~4 orgs activas × 4 rangos × 2 endpoints = 32
// requests cada 30min = ~1500 requests/dia. Vercel free tier soporta.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — warm de N orgs puede tardar

const WARM_CACHE_KEY = "nitrosales-secret-key-2024-production";

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

    // Endpoints a precalentar
    const endpoints = [
      "/api/metrics/pixel",
      "/api/metrics/orders",
    ];

    // Paralelizar por org (cada org tiene sus rangos secuenciales para
    // no saturar la DB con 4×2 queries simultaneas).
    await Promise.all(
      activeOrgs.map(async (org) => {
        for (const range of ranges) {
          for (const endpoint of endpoints) {
            const start = Date.now();
            const target = `${baseUrl}${endpoint}?orgId=${encodeURIComponent(
              org.id
            )}&key=${WARM_CACHE_KEY}&from=${range.from}&to=${range.to}`;
            try {
              const r = await fetch(target, {
                method: "GET",
                cache: "no-store",
                // Forzar cache miss para que ejecute las queries y guarde fresh
                headers: { "x-skip-cache": "1" },
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
      })
    );

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
