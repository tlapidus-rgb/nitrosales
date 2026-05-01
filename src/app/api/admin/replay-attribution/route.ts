// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/replay-attribution?orgId=X&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=N&key=K
// ══════════════════════════════════════════════════════════════
// Re-corre atribucion para ordenes web que estan en DB sin attribution
// row. Solo procesa ordenes posteriores a la fecha de instalacion del
// pixel (sino no hay data para atribuir).
//
// Filtros automaticos:
//   - Solo ordenes web (excluye MELI, FVG-, BPR-, channel='marketplace')
//   - Solo ordenes posteriores al primer evento del pixel para esa org
//   - Solo ordenes sin attribution row con model='LAST_CLICK'
//   - Status NOT IN ('CANCELLED', 'PENDING') AND totalValue > 0
//
// Estrategia de atribucion:
//   - Email match: pixel_visitor con email == customer.email
//
// La tabla customers no tiene columna phone, asi que phone-match no
// aplica aca. Las otras estrategias del webhook (checkout heuristic,
// IP+UA, recent activity) usan ventanas temporales que no aplican a
// data historica.
//
// Default: limit=100. Max=500 por invocacion.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { calculateAttribution } from "@/lib/pixel/attribution";

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
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    // 1) Detectar fecha de instalacion del pixel para esta org
    const pixelInstall = await prisma.pixelEvent.findFirst({
      where: { organizationId: orgId },
      orderBy: { timestamp: "asc" },
      select: { timestamp: true },
    });

    if (!pixelInstall) {
      return NextResponse.json({
        ok: false,
        error: "Esta org no tiene eventos de pixel registrados. No se puede correr replay-attribution sin pixel instalado.",
      }, { status: 400 });
    }

    const pixelInstalledAt = pixelInstall.timestamp;
    const now = new Date();

    // Si el user pidio un from anterior al pixel install, igual usamos pixel install
    const userFrom = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : pixelInstalledAt;
    const fromDate = userFrom < pixelInstalledAt ? pixelInstalledAt : userFrom;
    const toDate = toParam ? new Date(`${toParam}T23:59:59.999Z`) : now;

    // 2) Buscar ordenes web sin attribution row
    // Web: excluye marketplaces (FVG-, BPR-, source=MELI, channel=marketplace, trafficSource=Marketplace)
    const candidates = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         o."id" as order_id,
         o."externalId",
         o."orderDate",
         o."totalValue",
         o."customerId",
         c."email" as customer_email
       FROM "orders" o
       LEFT JOIN "customers" c ON c."id" = o."customerId"
       LEFT JOIN "pixel_attributions" pa ON pa."orderId" = o."id" AND pa."model"::text = 'LAST_CLICK'
       WHERE o."organizationId" = $1
         AND o."orderDate" >= $2
         AND o."orderDate" <= $3
         AND o."source" != 'MELI'
         AND (o."channel" IS NULL OR o."channel" != 'marketplace')
         AND (o."trafficSource" IS NULL OR o."trafficSource" != 'Marketplace')
         AND o."externalId" NOT LIKE 'FVG-%'
         AND o."externalId" NOT LIKE 'BPR-%'
         AND o."status" NOT IN ('CANCELLED', 'PENDING')
         AND o."totalValue" > 0
         AND pa."id" IS NULL
       ORDER BY o."orderDate" DESC
       LIMIT $4`,
      orgId,
      fromDate,
      toDate,
      limit,
    );

    const results: any[] = [];
    let attributed = 0;
    let noEmail = 0;
    let noVisitor = 0;
    let alreadyAttributed = 0;
    let errors = 0;

    for (const o of candidates) {
      const externalId = o.externalId;
      const orderDbId = o.order_id;
      const email = (o.customer_email || "").toLowerCase().trim() || null;

      // Email match
      let visitor: any = null;
      let matchedBy: string | null = null;

      if (email) {
        visitor = await prisma.pixelVisitor.findFirst({
          where: { organizationId: orgId, email },
          select: { id: true, visitorId: true, email: true },
        });
        if (visitor) matchedBy = "email-match";
      }

      if (!visitor) {
        if (!email) {
          noEmail++;
          results.push({ externalId, orderDate: o.orderDate, status: "skipped", reason: "no-customer-email" });
        } else {
          noVisitor++;
          results.push({ externalId, orderDate: o.orderDate, status: "skipped", reason: "no-pixel-visitor-matching", customerEmail: email });
        }
        continue;
      }

      // Correr atribucion
      try {
        await calculateAttribution(orderDbId, visitor.id, orgId);

        // Verificar que se creo el attribution row
        const attr = await prisma.pixelAttribution.findFirst({
          where: { orderId: orderDbId, model: "LAST_CLICK" as any },
          select: { id: true, attributedValue: true, touchpointCount: true },
        });

        if (attr) {
          attributed++;
          results.push({
            externalId,
            orderDate: o.orderDate,
            status: "attributed",
            matchedBy,
            visitor: visitor.visitorId,
            attributedValue: Number(attr.attributedValue),
            touchpointCount: attr.touchpointCount,
          });
        } else {
          // calculateAttribution corrio pero no creo row (ej: events.length === 0)
          alreadyAttributed++;
          results.push({
            externalId,
            orderDate: o.orderDate,
            status: "skipped",
            reason: "calculateAttribution-did-not-create-row",
            matchedBy,
            visitor: visitor.visitorId,
          });
        }
      } catch (e: any) {
        errors++;
        results.push({
          externalId,
          orderDate: o.orderDate,
          status: "error",
          error: e.message?.slice(0, 200),
          matchedBy,
          visitor: visitor.visitorId,
        });
      }
    }

    const totalProcessed = candidates.length;
    let summary: string;
    if (totalProcessed === 0) {
      summary = "No hay ordenes web post-pixel sin atribuir en el rango. Todo lo atribuible ya esta atribuido.";
    } else {
      summary =
        `Procesadas ${totalProcessed} ordenes. ` +
        `Atribuidas: ${attributed}. ` +
        `Sin visitor matching: ${noVisitor}. ` +
        `Sin email/phone del customer: ${noEmail}. ` +
        `Errores: ${errors}.`;
    }

    return NextResponse.json({
      ok: true,
      orgId,
      pixelInstalledAt: pixelInstalledAt.toISOString(),
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      limit,
      totalProcessed,
      attributed,
      noVisitor,
      noEmail,
      errors,
      hint: totalProcessed === limit
        ? `Llegaste al limite de ${limit}. Volve a correr el endpoint para procesar las que faltan (este endpoint es idempotente, ya atribuidas son skip automaticamente).`
        : null,
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
