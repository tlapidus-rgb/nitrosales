// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/onboardings/[id]/reset-wipe
// ══════════════════════════════════════════════════════════════
// Reset COMPLETO: borra toda la data del cliente (orders, items,
// customers, products, attribuciones, etc) + los backfill_jobs +
// vuelve el onboarding a NEEDS_INFO.
//
// MANTIENE: connections (credenciales), org, user, onboarding_request.
// El cliente queda como cuando recién terminó el wizard pero sin data.
//
// Uso: cuando la data quedó realmente corrupta o el cliente conectó
// la cuenta equivocada y querés empezar de cero limpio.
//
// Para reset SUAVE (solo borrar jobs, mantener data) usar el endpoint
// existente /api/admin/onboardings/[id]/reset-backfill.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const obRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "id", "status", "createdOrgId", "companyName" FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
      id,
    );
    const ob = obRows[0];
    if (!ob) {
      return NextResponse.json({ error: "Onboarding no encontrado" }, { status: 404 });
    }

    const orgId = ob.createdOrgId;
    if (!orgId) {
      return NextResponse.json({ error: "Onboarding sin org creada todavía" }, { status: 400 });
    }

    const deleted: Record<string, number> = {};

    // 1. Borrar backfill_jobs
    deleted.backfill_jobs = Number(
      await prisma.$executeRawUnsafe(
        `DELETE FROM "backfill_jobs" WHERE "onboardingRequestId" = $1`,
        id,
      ),
    );

    // 2. Borrar atribuciones (FK a orders)
    try {
      deleted.pixel_attributions = Number(
        await prisma.$executeRawUnsafe(
          `DELETE FROM "pixel_attributions" WHERE "organizationId" = $1`,
          orgId,
        ),
      );
    } catch {}
    try {
      deleted.influencer_attributions = Number(
        await prisma.$executeRawUnsafe(
          `DELETE FROM "influencer_attributions" WHERE "organizationId" = $1`,
          orgId,
        ),
      );
    } catch {}

    // 3. Borrar order_items (FK a orders y products)
    deleted.order_items = Number(
      await prisma.$executeRawUnsafe(
        `DELETE FROM "order_items" WHERE "orderId" IN (SELECT "id" FROM "orders" WHERE "organizationId" = $1)`,
        orgId,
      ),
    );

    // 4. Borrar orders
    deleted.orders = Number(
      await prisma.$executeRawUnsafe(
        `DELETE FROM "orders" WHERE "organizationId" = $1`,
        orgId,
      ),
    );

    // 5. Borrar customers
    deleted.customers = Number(
      await prisma.$executeRawUnsafe(
        `DELETE FROM "customers" WHERE "organizationId" = $1`,
        orgId,
      ),
    );

    // 6. Borrar products
    deleted.products = Number(
      await prisma.$executeRawUnsafe(
        `DELETE FROM "products" WHERE "organizationId" = $1`,
        orgId,
      ),
    );

    // 7. Borrar campaigns + ad metrics (si hay)
    try {
      deleted.ad_metric_daily = Number(
        await prisma.$executeRawUnsafe(
          `DELETE FROM "ad_metric_daily" WHERE "campaignId" IN (SELECT "id" FROM "ad_campaigns" WHERE "organizationId" = $1)`,
          orgId,
        ),
      );
    } catch {}
    try {
      deleted.ad_creatives = Number(
        await prisma.$executeRawUnsafe(
          `DELETE FROM "ad_creatives" WHERE "organizationId" = $1`,
          orgId,
        ),
      );
    } catch {}
    try {
      deleted.ad_campaigns = Number(
        await prisma.$executeRawUnsafe(
          `DELETE FROM "ad_campaigns" WHERE "organizationId" = $1`,
          orgId,
        ),
      );
    } catch {}

    // 8. Borrar pixel events (data que cargó el snippet del cliente)
    try {
      deleted.pixel_events = Number(
        await prisma.$executeRawUnsafe(
          `DELETE FROM "pixel_events" WHERE "organizationId" = $1`,
          orgId,
        ),
      );
    } catch {}
    try {
      deleted.pixel_visitors = Number(
        await prisma.$executeRawUnsafe(
          `DELETE FROM "pixel_visitors" WHERE "organizationId" = $1`,
          orgId,
        ),
      );
    } catch {}

    // 9. Otras tablas de data (best-effort, no fallar si no existen)
    for (const tbl of [
      "ml_listings", "ml_questions", "meli_webhook_events",
      "sync_watermarks", "web_metric_daily", "seo_query_daily",
    ]) {
      try {
        const n = Number(
          await prisma.$executeRawUnsafe(
            `DELETE FROM "${tbl}" WHERE "organizationId" = $1`,
            orgId,
          ),
        );
        if (n > 0) deleted[tbl] = n;
      } catch {}
    }

    // 10. Volver onboarding a NEEDS_INFO (lista para que admin re-aprobe backfill)
    await prisma.$executeRawUnsafe(
      `UPDATE "onboarding_requests"
       SET "status" = 'NEEDS_INFO'::"OnboardingStatus",
           "progressStage" = 'awaiting_admin_review',
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      id,
    );

    const totalDeleted = Object.values(deleted).reduce((s: number, n) => s + Number(n || 0), 0);

    return NextResponse.json({
      ok: true,
      onboarding: {
        id: ob.id,
        companyName: ob.companyName,
        previousStatus: ob.status,
        newStatus: "NEEDS_INFO",
      },
      totalDeleted,
      deleted,
      preserved: ["connections", "organization", "users", "onboarding_request"],
      nextStep: "Aprobar backfill desde /control/onboardings para arrancar limpio.",
    });
  } catch (err: any) {
    console.error("[reset-wipe] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
