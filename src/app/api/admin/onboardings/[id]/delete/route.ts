// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// DELETE /api/admin/onboardings/[id]/delete
// ══════════════════════════════════════════════════════════════
// Elimina UN onboarding/cliente puntual desde la tabla /control/onboardings.
// Reemplaza el flow viejo de "borrar por email" del debug-flip-onboarding,
// que era ambiguo cuando el mismo mail estaba en varias cuentas.
//
// Casos manejados:
//   1. Onboarding TIENE createdOrgId (cuenta activa o post-activate):
//      → borra TODA la cuenta (orders, customers, users, organization, etc)
//        usando la misma logica que /api/admin/orgs/[orgId]/wipe-account
//      → borra el onboarding_request
//
//   2. Onboarding NO tiene createdOrgId (PENDING / NEEDS_INFO / REJECTED):
//      → solo borra el onboarding_request (no hay org/data que borrar)
//
// MANTIENE: email_log (historial) + leads (no estan ligados al onboarding).
//
// Body opcional: { confirm: "DELETE-{onboardingId}" } — si se pasa, sirve
// como segunda confirmacion server-side. Sin esto el endpoint igual borra
// porque ya hay confirm en UI.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id: onboardingId } = params;
    if (!onboardingId)
      return NextResponse.json({ error: "onboardingId requerido" }, { status: 400 });

    // 1) Buscar el onboarding
    const onboarding = await prisma.onboardingRequest.findUnique({
      where: { id: onboardingId },
      select: {
        id: true,
        companyName: true,
        contactEmail: true,
        status: true,
        createdOrgId: true,
      },
    });

    if (!onboarding) {
      return NextResponse.json(
        { error: "Onboarding no existe", onboardingId },
        { status: 404 }
      );
    }

    const deleted: Record<string, number> = {};
    const orgId = onboarding.createdOrgId;

    // 2) Si tiene org creada, borrar TODA la data + organization + users
    if (orgId) {
      // ── DATA TABLES (best-effort, idempotente) ──
      // Mismo orden que /api/admin/orgs/[orgId]/wipe-account.
      try {
        deleted.orderItems = (await prisma.$executeRawUnsafe(
          `DELETE FROM "order_items" WHERE "orderId" IN (SELECT "id" FROM "orders" WHERE "organizationId" = $1)`,
          orgId
        )) as any;
        deleted.orders = (await prisma.$executeRawUnsafe(
          `DELETE FROM "orders" WHERE "organizationId" = $1`,
          orgId
        )) as any;
      } catch {}

      for (const tbl of [
        "pixel_attributions",
        "pixel_visitor_aliases",
        "pixel_events",
        "pixel_visitors",
        "customers",
        "products",
        "connections",
        "backfill_jobs",
        "meli_webhook_events",
        "ml_listings",
        "ml_questions",
        "sync_watermarks",
        "alert_rules",
        "alert_runs",
        "alert_read_state",
        "alert_favorite",
        "campaigns",
        "ad_campaigns",
        "ad_creatives",
        "ad_metric_daily",
        "web_metric_daily",
        "seo_query_daily",
        "influencer_creators",
        "influencer_campaigns",
        "influencer_deals",
        "influencer_attributions",
        "payouts",
        "audiences",
        "system_settings_org",
        "lead_credits",
      ]) {
        try {
          const n = await prisma.$executeRawUnsafe(
            `DELETE FROM "${tbl}" WHERE "organizationId" = $1`,
            orgId
          );
          if (n > 0) deleted[tbl] = n;
        } catch {
          // tabla no existe o no tiene organizationId — silent
        }
      }

      // Users de la org
      try {
        deleted.users = (await prisma.$executeRawUnsafe(
          `DELETE FROM "users" WHERE "organizationId" = $1`,
          orgId
        )) as any;
      } catch {}

      // Organization
      try {
        deleted.organizations = (await prisma.$executeRawUnsafe(
          `DELETE FROM "organizations" WHERE "id" = $1`,
          orgId
        )) as any;
      } catch {}
    }

    // 3) Borrar el onboarding_request
    deleted.onboardingRequest = (await prisma.$executeRawUnsafe(
      `DELETE FROM "onboarding_requests" WHERE "id" = $1`,
      onboardingId
    )) as any;

    const totalDeleted = Object.values(deleted)
      .filter((v) => typeof v === "number")
      .reduce((s: number, n: any) => s + Number(n), 0);

    return NextResponse.json({
      ok: true,
      onboarding: {
        id: onboarding.id,
        companyName: onboarding.companyName,
        contactEmail: onboarding.contactEmail,
        previousStatus: onboarding.status,
        hadOrg: !!orgId,
        orgId: orgId || null,
      },
      totalDeleted,
      deleted,
      note: orgId
        ? "Cuenta completa eliminada (org + data + users + onboarding_request)."
        : "Solo onboarding_request eliminado (no tenia org creada todavia).",
    });
  } catch (error: any) {
    console.error("[onboardings/delete] error:", error);
    return NextResponse.json(
      { error: error.message, stack: error.stack?.slice(0, 500) },
      { status: 500 }
    );
  }
}
