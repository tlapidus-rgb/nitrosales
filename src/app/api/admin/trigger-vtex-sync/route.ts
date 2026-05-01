// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/trigger-vtex-sync?orgId=X&from=YYYY-MM-DD&to=YYYY-MM-DD&key=Y
// ══════════════════════════════════════════════════════════════
// Dispara el sync de VTEX manualmente para una org especifica.
// Lista las ordenes que VTEX tiene en el rango y para cada una
// invoca al webhook handler propio (reusa toda la logica existente:
// upsert order + customer + items + atribucion).
//
// Devuelve un resumen detallado por orden:
//   - VTEX orderId, status, totalValue
//   - resultado del webhook (200 / 401 / 500 / etc)
//   - error message si falla
//   - estaba en DB antes (true/false)
//
// Sirve para:
//   1) Re-sincronizar una org cuando el cron rompio
//   2) Diagnosticar que esta fallando del lado del webhook
//
// Default: ultimos 3 dias. Max 50 ordenes por invocacion.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getVtexConfig } from "@/lib/vtex-credentials";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const maxOrders = Math.min(50, Number(url.searchParams.get("max") ?? 30));

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    // Default: ultimos 3 dias
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const fromDate = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : defaultFrom;
    const toDate = toParam ? new Date(`${toParam}T23:59:59.999Z`) : now;
    const fromISO = fromDate.toISOString();
    const toISO = toDate.toISOString();

    // VTEX credentials
    let vtexConfig: any;
    try {
      vtexConfig = await getVtexConfig(orgId);
    } catch (e: any) {
      return NextResponse.json({
        error: "No hay credenciales VTEX para esta org",
        detail: e.message,
      }, { status: 404 });
    }

    // Listar ordenes en el rango
    const vtexUrl =
      `${vtexConfig.baseUrl}/api/oms/pvt/orders` +
      `?f_creationDate=creationDate:[${fromISO} TO ${toISO}]` +
      `&per_page=${maxOrders}&page=1&orderBy=creationDate,desc`;

    const vtexRes = await fetch(vtexUrl, {
      headers: vtexConfig.headers,
      signal: AbortSignal.timeout(20000),
    });

    if (!vtexRes.ok) {
      const errBody = await vtexRes.text().catch(() => "");
      return NextResponse.json({
        error: "VTEX list orders request failed",
        status: vtexRes.status,
        body: errBody.slice(0, 500),
      }, { status: 502 });
    }

    const vtexData: any = await vtexRes.json();
    const vtexOrders: any[] = (vtexData.list || []).slice(0, maxOrders);

    // URL del webhook propio (multi-env safe)
    const protocol = req.nextUrl.protocol;
    const host = req.headers.get("host") || "app.nitrosales.ai";
    const nextAuthSecret = process.env.NEXTAUTH_SECRET;
    if (!nextAuthSecret) {
      return NextResponse.json({
        error: "NEXTAUTH_SECRET no configurado",
      }, { status: 500 });
    }
    const webhookUrl = `${protocol}//${host}/api/webhooks/vtex/orders?key=${encodeURIComponent(nextAuthSecret)}&org=${orgId}`;

    const results: any[] = [];
    for (const o of vtexOrders) {
      const orderId = o.orderId;
      if (!orderId) continue;

      // Estaba en DB antes?
      const existing = await prisma.order.findFirst({
        where: { organizationId: orgId, externalId: orderId },
        select: { id: true },
      });
      const wasInDb = !!existing;

      // Disparar webhook interno con body simulado
      const startedAt = Date.now();
      let webhookStatus: number | null = null;
      let webhookBody: any = null;
      let webhookError: string | null = null;

      try {
        const whRes = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            OrderId: orderId,
            State: o.status || "ready-for-handling",
            LastState: o.status || "ready-for-handling",
            Domain: "Marketplace",
            LastChangeDate: new Date().toISOString(),
            CurrentChangeDate: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(25000),
        });
        webhookStatus = whRes.status;
        const text = await whRes.text().catch(() => "");
        try {
          webhookBody = JSON.parse(text);
        } catch {
          webhookBody = text.slice(0, 200);
        }
      } catch (e: any) {
        webhookError = e.message;
      }

      // Esta en DB ahora?
      const after = await prisma.order.findFirst({
        where: { organizationId: orgId, externalId: orderId },
        select: { id: true, status: true, totalValue: true },
      });
      const nowInDb = !!after;

      results.push({
        orderId,
        creationDate: o.creationDate,
        vtexStatus: o.status,
        vtexValue: (o.totalValue ?? 0) / 100,
        wasInDb,
        nowInDb,
        elapsedMs: Date.now() - startedAt,
        webhookStatus,
        webhookBody,
        webhookError,
      });
    }

    // Resumen
    const totalProcessed = results.length;
    const insertedNow = results.filter((r) => !r.wasInDb && r.nowInDb).length;
    const alreadyExisted = results.filter((r) => r.wasInDb).length;
    const failedToInsert = results.filter((r) => !r.wasInDb && !r.nowInDb).length;
    const successRate = totalProcessed > 0 ? Math.round((insertedNow + alreadyExisted) / totalProcessed * 100) : 0;

    let summary: string;
    if (totalProcessed === 0) {
      summary = "VTEX no devolvio ordenes en el rango.";
    } else if (insertedNow === totalProcessed - alreadyExisted) {
      summary = `OK: ${insertedNow} ordenes nuevas insertadas, ${alreadyExisted} ya existian. Ingest funciona.`;
    } else if (failedToInsert > 0) {
      summary = `PROBLEMA: ${failedToInsert} ordenes fallaron al insertar. Revisar webhookStatus + webhookBody en cada caso.`;
    } else {
      summary = `Procesadas ${totalProcessed}: ${insertedNow} insertadas, ${alreadyExisted} ya existian.`;
    }

    return NextResponse.json({
      ok: true,
      orgId,
      vtexAccount: vtexConfig.creds.accountName,
      from: fromISO,
      to: toISO,
      totalProcessed,
      insertedNow,
      alreadyExisted,
      failedToInsert,
      successRate: `${successRate}%`,
      summary,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      stack: err.stack?.slice(0, 500),
    }, { status: 500 });
  }
}
