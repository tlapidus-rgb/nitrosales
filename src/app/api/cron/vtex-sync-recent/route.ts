// ══════════════════════════════════════════════════════════════
// VTEX Cron Sync Recent — Safety Net (S60 EXT-2)
// ══════════════════════════════════════════════════════════════
// Cada 30 min recorre todas las orgs con VTEX activo y trae las
// ordenes de las ULTIMAS 3 HORAS via trigger-vtex-sync.
//
// PROPOSITO: red de seguridad para webhook intermitente. Si VTEX no
// nos avisa de algun cambio de estado, este cron lo recupera dentro
// de los 30 min (en lugar de los 24 hs del cron diario /api/sync).
//
// Multi-tenant: itera todas las VTEX connections ACTIVE.
// Idempotente: trigger-vtex-sync ya skipea ordenes que existen en DB.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — Vercel Pro

const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    // Auth — acepta key query param (cron) o NEXTAUTH_SECRET
    const url = new URL(req.url);
    const reqKey = url.searchParams.get("key");
    if (reqKey !== KEY && reqKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Encontrar orgs con VTEX activo
    const conns = await prisma.connection.findMany({
      where: { platform: "VTEX" as any, status: "ACTIVE" as any },
      select: { organizationId: true, organization: { select: { name: true } } },
    });

    if (conns.length === 0) {
      return NextResponse.json({ ok: true, message: "No active VTEX connections", orgs: 0 });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
    // Trigger-vtex-sync usa "from"/"to" como YYYY-MM-DD. Para cubrir 3 hs,
    // usamos hoy y ayer (rango chico, idempotente).
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fromDate = yesterday.toISOString().slice(0, 10);
    const toDate = now.toISOString().slice(0, 10);

    // Procesar todas las orgs en paralelo (max 5 a la vez)
    const concurrencyLimit = 5;
    const results: any[] = [];
    for (let i = 0; i < conns.length; i += concurrencyLimit) {
      const chunk = conns.slice(i, i + concurrencyLimit);
      const chunkResults = await Promise.all(
        chunk.map(async (c) => {
          const orgId = c.organizationId;
          const orgName = c.organization?.name || "(unknown)";
          try {
            const triggerUrl =
              `${baseUrl}/api/admin/trigger-vtex-sync` +
              `?orgId=${encodeURIComponent(orgId)}` +
              `&from=${fromDate}&to=${toDate}` +
              `&max=30` +
              `&key=${encodeURIComponent(KEY)}`;
            const res = await fetch(triggerUrl, {
              signal: AbortSignal.timeout(50000),
            });
            const data: any = await res.json().catch(() => ({}));
            return {
              orgId,
              orgName,
              ok: !!data.ok,
              processed: data.totalProcessed ?? 0,
              insertedNow: data.insertedNow ?? 0,
              alreadyExisted: data.alreadyExisted ?? 0,
              failedToInsert: data.failedToInsert ?? 0,
              summary: data.summary || data.error || "no-data",
            };
          } catch (e: any) {
            return {
              orgId,
              orgName,
              ok: false,
              error: e.message?.slice(0, 200),
            };
          }
        })
      );
      results.push(...chunkResults);
    }

    const totalInserted = results.reduce((s, r) => s + (r.insertedNow || 0), 0);
    const totalProcessed = results.reduce((s, r) => s + (r.processed || 0), 0);
    const totalFailed = results.reduce((s, r) => s + (r.failedToInsert || 0), 0);

    return NextResponse.json({
      ok: true,
      orgs: conns.length,
      from: fromDate,
      to: toDate,
      totalProcessed,
      totalInserted,
      totalFailed,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
