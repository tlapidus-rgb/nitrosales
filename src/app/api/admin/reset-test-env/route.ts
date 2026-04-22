// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/reset-test-env
// ══════════════════════════════════════════════════════════════
// Borra TODO lo asociado a un email de test: lead, onboarding_request,
// user, organization, connections, orders, customers, products,
// backfill_jobs, webhook_events, sync_watermarks, etc.
//
// Body:
//   { email: "tomylapidus@..." }
//
// Devuelve reporte de qué eliminó por categoría.
//
// SAFETY: Solo admins. Solo borra si encuentra al menos 1 entidad con
// ese email. Si no encuentra nada, devuelve ok con 0 borrados.
//
// Orden de borrado (para evitar FK constraints):
//   1. Datos que dependen de org (orders, customers, products, etc)
//   2. Connections
//   3. Backfill jobs
//   4. Webhook events ML
//   5. Sync watermarks
//   6. Email templates? NO (son globales, no por org)
//   7. User
//   8. Organization
//   9. Onboarding request
//   10. Lead
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Pasá 'email' en el body" }, { status: 400 });
    }

    const deleted: Record<string, number> = {};

    // 1. Buscar el user por email
    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, organizationId: true },
    }).catch(() => null);

    const orgId: string | null = user?.organizationId || null;

    // 2. Si existe org, borrar TODO lo asociado
    if (orgId) {
      // Orders, items, attributions
      deleted.orderItems = (await prisma.$executeRawUnsafe(
        `DELETE FROM "order_items" WHERE "orderId" IN (SELECT "id" FROM "orders" WHERE "organizationId" = $1)`,
        orgId
      )) as any;
      deleted.orders = (await prisma.$executeRawUnsafe(
        `DELETE FROM "orders" WHERE "organizationId" = $1`, orgId
      )) as any;

      // Customers
      deleted.customers = (await prisma.$executeRawUnsafe(
        `DELETE FROM "customers" WHERE "organizationId" = $1`, orgId
      )) as any;

      // Products
      deleted.products = (await prisma.$executeRawUnsafe(
        `DELETE FROM "products" WHERE "organizationId" = $1`, orgId
      )) as any;

      // Connections
      deleted.connections = (await prisma.$executeRawUnsafe(
        `DELETE FROM "connections" WHERE "organizationId" = $1`, orgId
      )) as any;

      // Backfill jobs
      deleted.backfillJobs = (await prisma.$executeRawUnsafe(
        `DELETE FROM "backfill_jobs" WHERE "organizationId" = $1`, orgId
      )) as any;

      // ML webhook events (tabla nueva, puede no existir)
      try {
        deleted.mlWebhookEvents = (await prisma.$executeRawUnsafe(
          `DELETE FROM "meli_webhook_events" WHERE "organizationId" = $1`, orgId
        )) as any;
      } catch {}

      // Sync watermarks (tabla nueva, puede no existir)
      try {
        deleted.syncWatermarks = (await prisma.$executeRawUnsafe(
          `DELETE FROM "sync_watermarks" WHERE "organizationId" = $1`, orgId
        )) as any;
      } catch {}

      // Cualquier otra tabla con organizationId — best-effort
      // (alerts, campaigns, etc — no rompen si no tienen rows)
      for (const tbl of [
        "alert_rules", "alert_runs", "alert_read_state", "alert_favorite",
        "campaigns", "ad_campaigns", "ad_metric_daily", "web_metric_daily",
        "influencer_creators", "influencer_campaigns", "influencer_deals",
        "influencer_attributions", "pixel_attributions", "pixel_visitors",
      ]) {
        try {
          const n = await prisma.$executeRawUnsafe(
            `DELETE FROM "${tbl}" WHERE "organizationId" = $1`, orgId
          );
          if (n > 0) deleted[tbl] = n;
        } catch {}
      }
    }

    // 3. Borrar User (antes de Organization por FK)
    if (user) {
      deleted.users = (await prisma.$executeRawUnsafe(
        `DELETE FROM "users" WHERE "id" = $1`, user.id
      )) as any;
    }

    // 4. Borrar Organization
    if (orgId) {
      deleted.organizations = (await prisma.$executeRawUnsafe(
        `DELETE FROM "organizations" WHERE "id" = $1`, orgId
      )) as any;
    }

    // 5. Borrar onboarding_requests con ese email
    deleted.onboardingRequests = (await prisma.$executeRawUnsafe(
      `DELETE FROM "onboarding_requests" WHERE LOWER("contactEmail") = $1`, email
    )) as any;

    // 6. Borrar leads con ese email
    deleted.leads = (await prisma.$executeRawUnsafe(
      `DELETE FROM "leads" WHERE LOWER("contactEmail") = $1`, email
    )) as any;

    // 7. Borrar email_log entries del email (opcional — puede interesar mantener)
    // NO borramos email_log para que Tomy pueda ver el historial

    const totalDeleted = Object.values(deleted).reduce((s: number, n: any) => s + (Number(n) || 0), 0);

    return NextResponse.json({
      ok: true,
      email,
      orgId,
      userId: user?.id || null,
      totalDeleted,
      deleted,
      note: "email_log NO se borra (lo mantenemos para historial).",
    });
  } catch (error: any) {
    console.error("[reset-test-env] error:", error);
    return NextResponse.json({ error: error.message, stack: error.stack?.slice(0, 500) }, { status: 500 });
  }
}
