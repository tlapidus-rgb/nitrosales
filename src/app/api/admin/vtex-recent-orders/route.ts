// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/vtex-recent-orders?orgId=X&from=YYYY-MM-DD&to=YYYY-MM-DD&key=Y
// ══════════════════════════════════════════════════════════════
// Pegale a la API de VTEX directo (con las credenciales de la org)
// y compara las ordenes que VTEX tiene listadas vs las que tenemos
// en nuestra DB.
//
// Sirve para distinguir 2 escenarios cuando una org "no tiene
// ordenes VTEX nuevas":
//   A) VTEX tampoco tiene ordenes → cliente realmente no vendio
//   B) VTEX SI tiene ordenes pero NitroSales no las sincronizo →
//      problema de ingest (webhook + cron rotos)
//
// Default: ultimos 3 dias.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getVtexConfig } from "@/lib/vtex-credentials";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
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

    // Pegale a VTEX para listar ordenes en el rango
    // VTEX endpoint: /api/oms/pvt/orders?f_creationDate=creationDate:[X TO Y]
    const vtexUrl =
      `${vtexConfig.baseUrl}/api/oms/pvt/orders` +
      `?f_creationDate=creationDate:[${fromISO} TO ${toISO}]` +
      `&per_page=100&page=1&orderBy=creationDate,desc`;

    const vtexRes = await fetch(vtexUrl, {
      headers: vtexConfig.headers,
      signal: AbortSignal.timeout(20000),
    });

    if (!vtexRes.ok) {
      const errBody = await vtexRes.text().catch(() => "");
      return NextResponse.json({
        error: "VTEX API request failed",
        status: vtexRes.status,
        body: errBody.slice(0, 500),
      }, { status: 502 });
    }

    const vtexData: any = await vtexRes.json();
    const vtexOrders: any[] = vtexData.list || [];
    const vtexTotal = vtexData.paging?.total ?? vtexOrders.length;

    // Para cada orden de VTEX, chequear si esta en nuestra DB
    const externalIds = vtexOrders.map((o) => o.orderId).filter(Boolean);
    const dbOrders = externalIds.length > 0
      ? await prisma.order.findMany({
          where: {
            organizationId: orgId,
            externalId: { in: externalIds },
          },
          select: { externalId: true },
        })
      : [];
    const dbExternalIds = new Set(dbOrders.map((o) => o.externalId));

    // Lista de ordenes VTEX con flag "esta en DB?"
    const detail = vtexOrders.map((o) => ({
      orderId: o.orderId,
      creationDate: o.creationDate,
      status: o.status,
      totalValue: (o.totalValue ?? 0) / 100,
      affiliateId: o.affiliateId || null,
      origin: o.origin || null,
      inDb: dbExternalIds.has(o.orderId),
    }));

    const inDbCount = detail.filter((d) => d.inDb).length;
    const missingFromDb = detail.filter((d) => !d.inDb).map((d) => d.orderId);

    // Diagnostico
    let diagnosis: string;
    if (vtexOrders.length === 0) {
      diagnosis = "VTEX no devolvio ordenes en el rango → Escenario A: el cliente realmente no vendio (o el rango es muy chico). NitroSales esta OK, simplemente no hay trafico que sincronizar.";
    } else if (missingFromDb.length === 0) {
      diagnosis = "Todas las ordenes de VTEX estan en DB → ingest funcionando bien.";
    } else if (missingFromDb.length === vtexOrders.length) {
      diagnosis = "VTEX tiene ordenes pero NINGUNA esta en DB → Escenario B: el ingest esta roto (webhook + cron). Investigar urgente.";
    } else {
      diagnosis = `VTEX tiene ${vtexOrders.length} ordenes, ${inDbCount} estan en DB, ${missingFromDb.length} faltan → ingest parcial. Revisar las que faltan.`;
    }

    return NextResponse.json({
      ok: true,
      orgId,
      vtexAccount: vtexConfig.creds.accountName,
      from: fromISO,
      to: toISO,
      vtexCountInRange: vtexOrders.length,
      vtexTotalReportedByApi: vtexTotal,
      dbCountForSameOrders: inDbCount,
      missingFromDbCount: missingFromDb.length,
      missingFromDb,
      diagnosis,
      orders: detail,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      stack: err.stack?.slice(0, 500),
    }, { status: 500 });
  }
}
