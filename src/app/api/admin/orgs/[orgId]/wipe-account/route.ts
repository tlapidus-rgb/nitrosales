// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/orgs/[orgId]/wipe-account
// ══════════════════════════════════════════════════════════════
// Borra TODO lo asociado a UNA org especifica (orgId directo).
//
// Diferencia con /api/admin/reset-test-env (que es por email):
//   - Por email: si el mismo email esta en N cuentas, no es claro cual borrar.
//   - Por orgId: borra UNA cuenta puntual sin ambiguedad.
//
// Borra: orders, items, customers, products, connections, backfill_jobs,
// pixel_events/visitors/attributions, ad_campaigns/metrics, influencer_*,
// alerts, ml_webhook_events, sync_watermarks, users (todos los de la org),
// onboarding_request asociado al primer user, finalmente la organization.
//
// MANTIENE: email_log (historial), email_templates (globales), leads
// (no estan ligados a org una vez convertidos).
//
// SAFETY:
//   - Solo admins (isInternalUser).
//   - Requiere body { confirm: "WIPE-{orgId}" } para evitar borrar accidental.
//   - Idempotente: si la org no existe devuelve 404.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { orgId } = params;
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const expected = `WIPE-${orgId}`;
    if (body?.confirm !== expected) {
      return NextResponse.json(
        {
          error: "Confirmacion requerida",
          message: `Pasa { "confirm": "${expected}" } en el body para confirmar.`,
        },
        { status: 400 }
      );
    }

    // Validar que la org existe + traer info para el reporte
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, slug: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Org no existe", orgId }, { status: 404 });
    }

    // Listar users de la org para el reporte
    const users = await prisma.user.findMany({
      where: { organizationId: orgId },
      select: { id: true, email: true },
    });

    const deleted: Record<string, number> = {};

    // ── DATA TABLES (best-effort, idempotente) ──
    // Orden importa: hijas antes que padres por FK constraints.

    // Order items dependen de orders
    deleted.orderItems = (await prisma.$executeRawUnsafe(
      `DELETE FROM "order_items" WHERE "orderId" IN (SELECT "id" FROM "orders" WHERE "organizationId" = $1)`,
      orgId
    )) as any;
    deleted.orders = (await prisma.$executeRawUnsafe(
      `DELETE FROM "orders" WHERE "organizationId" = $1`,
      orgId
    )) as any;

    // Pixel attributions dependen de pixel_visitors via FK
    for (const tbl of [
      "pixel_attributions",
      "pixel_visitor_aliases",
      "pixel_events",
      "pixel_visitors",
    ]) {
      try {
        const n = await prisma.$executeRawUnsafe(
          `DELETE FROM "${tbl}" WHERE "organizationId" = $1`,
          orgId
        );
        if (n > 0) deleted[tbl] = n;
      } catch (e: any) {
        deleted[`${tbl}_error`] = e.message?.slice(0, 80);
      }
    }

    // Customers + products
    deleted.customers = (await prisma.$executeRawUnsafe(
      `DELETE FROM "customers" WHERE "organizationId" = $1`,
      orgId
    )) as any;
    deleted.products = (await prisma.$executeRawUnsafe(
      `DELETE FROM "products" WHERE "organizationId" = $1`,
      orgId
    )) as any;

    // Connections + jobs
    deleted.connections = (await prisma.$executeRawUnsafe(
      `DELETE FROM "connections" WHERE "organizationId" = $1`,
      orgId
    )) as any;
    deleted.backfillJobs = (await prisma.$executeRawUnsafe(
      `DELETE FROM "backfill_jobs" WHERE "organizationId" = $1`,
      orgId
    )) as any;

    // Tablas opcionales / por feature (best-effort)
    const optionalTables = [
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
    ];
    for (const tbl of optionalTables) {
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

    // ── USERS de la org ──
    if (users.length > 0) {
      deleted.users = (await prisma.$executeRawUnsafe(
        `DELETE FROM "users" WHERE "organizationId" = $1`,
        orgId
      )) as any;
    }

    // ── ONBOARDING REQUESTS asociadas a algun user de la org ──
    const userEmails = users.map((u) => (u.email || "").toLowerCase()).filter(Boolean);
    if (userEmails.length > 0) {
      try {
        deleted.onboardingRequests = (await prisma.$executeRawUnsafe(
          `DELETE FROM "onboarding_requests" WHERE LOWER("contactEmail") = ANY($1::text[])`,
          userEmails
        )) as any;
      } catch {}
    }

    // ── ORGANIZATION (al final, despues de todas las hijas) ──
    deleted.organizations = (await prisma.$executeRawUnsafe(
      `DELETE FROM "organizations" WHERE "id" = $1`,
      orgId
    )) as any;

    const totalDeleted = Object.values(deleted)
      .filter((v) => typeof v === "number")
      .reduce((s: number, n: any) => s + Number(n), 0);

    return NextResponse.json({
      ok: true,
      org: { id: org.id, name: org.name, slug: org.slug },
      usersDeleted: users.map((u) => u.email),
      totalDeleted,
      deleted,
      note: "email_log + leads NO se borran (se mantienen para historial).",
    });
  } catch (error: any) {
    console.error("[orgs/wipe-account] error:", error);
    return NextResponse.json(
      { error: error.message, stack: error.stack?.slice(0, 500) },
      { status: 500 }
    );
  }
}
