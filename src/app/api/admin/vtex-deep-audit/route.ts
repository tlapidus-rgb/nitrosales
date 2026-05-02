// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/vtex-deep-audit?orgId=X&from=YYYY-MM-DD&to=YYYY-MM-DD&key=Y
// ══════════════════════════════════════════════════════════════
// Audita PROFUNDAMENTE las ordenes web de una org en un rango:
//  - Llama VTEX API paginando hasta traer TODAS las ordenes en el rango
//  - Cuenta cuantas estan en NitroSales DB (orders table)
//  - Reporta el gap (faltantes) con ejemplos
//
// Diferencia con /vtex-recent-orders: ese trae solo las primeras 100 +
// muestra; este trae TODAS y compara totales reales.
//
// Util para diagnosticar webhook intermitente: si VTEX dice 500 ordenes
// y DB tiene 487, hay 13 perdidas.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getVtexConfig } from "@/lib/vtex-credentials";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    const now = new Date();
    const fromDate = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : new Date(now.getTime() - 7 * 86400000);
    const toDate = toParam ? new Date(`${toParam}T23:59:59.999Z`) : now;
    const fromISO = fromDate.toISOString();
    const toISO = toDate.toISOString();

    // VTEX credentials
    let vtexConfig: any;
    try {
      vtexConfig = await getVtexConfig(orgId);
    } catch (e: any) {
      return NextResponse.json({ error: "No VTEX credentials", detail: e.message }, { status: 404 });
    }

    // Pagina VTEX hasta traer TODAS las ordenes
    const allVtexOrders: any[] = [];
    let page = 1;
    const perPage = 100;
    let totalReported: number | null = null;

    while (true) {
      const vtexUrl =
        `${vtexConfig.baseUrl}/api/oms/pvt/orders` +
        `?f_creationDate=creationDate:[${fromISO} TO ${toISO}]` +
        `&per_page=${perPage}&page=${page}&orderBy=creationDate,desc`;

      const res = await fetch(vtexUrl, {
        headers: vtexConfig.headers,
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        return NextResponse.json({
          error: "VTEX API failed mid-pagination",
          page,
          status: res.status,
          body: errBody.slice(0, 300),
          partialOrdersFetched: allVtexOrders.length,
        }, { status: 502 });
      }

      const data: any = await res.json();
      const list: any[] = data.list || [];
      if (totalReported === null) totalReported = data.paging?.total ?? list.length;
      allVtexOrders.push(...list);

      // Stop si trajimos todo o la pagina vino vacia
      if (list.length < perPage || allVtexOrders.length >= (totalReported || 0)) break;

      page++;
      // Safety guard — no mas de 30 paginas (3000 ordenes)
      if (page > 30) break;
    }

    // Filtrar marketplaces (solo contar web propia + FVG/BPR para split)
    const webOrders = allVtexOrders.filter(
      (o) => !o.orderId.startsWith("FVG-") && !o.orderId.startsWith("BPR-")
    );
    const fvgOrders = allVtexOrders.filter((o) => o.orderId.startsWith("FVG-"));
    const bprOrders = allVtexOrders.filter((o) => o.orderId.startsWith("BPR-"));

    // Chequear cuales estan en DB (todas, web + marketplaces)
    const allExtIds = allVtexOrders.map((o) => o.orderId).filter(Boolean);
    const dbOrders = allExtIds.length > 0
      ? await prisma.order.findMany({
          where: {
            organizationId: orgId,
            externalId: { in: allExtIds },
          },
          select: { externalId: true },
        })
      : [];
    const dbExtIdsSet = new Set(dbOrders.map((o) => o.externalId));

    // Calcular missing
    const missingAll = allVtexOrders.filter((o) => !dbExtIdsSet.has(o.orderId));
    const missingWeb = missingAll.filter(
      (o) => !o.orderId.startsWith("FVG-") && !o.orderId.startsWith("BPR-")
    );
    const missingFvg = missingAll.filter((o) => o.orderId.startsWith("FVG-"));
    const missingBpr = missingAll.filter((o) => o.orderId.startsWith("BPR-"));

    // Top 10 mas recientes de los missing (web)
    const missingWebSamples = missingWeb.slice(0, 10).map((o) => ({
      orderId: o.orderId,
      creationDate: o.creationDate,
      status: o.status,
      totalValue: (o.totalValue ?? 0) / 100,
    }));

    return NextResponse.json({
      ok: true,
      orgId,
      vtexAccount: vtexConfig.creds.accountName,
      from: fromISO,
      to: toISO,
      totals: {
        vtexReported: totalReported,
        vtexFetched: allVtexOrders.length,
        vtexWeb: webOrders.length,
        vtexFvg: fvgOrders.length,
        vtexBpr: bprOrders.length,
        dbHas: dbExtIdsSet.size,
        missingTotal: missingAll.length,
        missingWeb: missingWeb.length,
        missingFvg: missingFvg.length,
        missingBpr: missingBpr.length,
      },
      coverage: {
        all: allVtexOrders.length > 0
          ? `${Math.round((dbExtIdsSet.size / allVtexOrders.length) * 1000) / 10}%`
          : "N/A",
        webOnly: webOrders.length > 0
          ? `${Math.round(((webOrders.length - missingWeb.length) / webOrders.length) * 1000) / 10}%`
          : "N/A",
      },
      missingWebSamples,
      diagnosis: missingAll.length === 0
        ? "PERFECTO: 100% de las ordenes de VTEX estan en DB. Webhook + cron funcionando OK."
        : missingWeb.length === 0
          ? `OK web: las ${missingAll.length} faltantes son todas marketplace (FVG/BPR). El pixel no aplica para esas.`
          : `GAP detectado: ${missingWeb.length} ordenes WEB faltan en DB. Webhook esta perdiendo eventos.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
