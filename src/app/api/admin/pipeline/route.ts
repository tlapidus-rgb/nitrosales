// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/pipeline
// ══════════════════════════════════════════════════════════════
// Devuelve TODOS los clientes/leads agrupados por etapa del funnel.
//
// Etapas (de izquierda a derecha en el Kanban):
//   1. LEAD          — prospect manual, no contactado aun
//   2. CONTACTADO    — Tomy le mando link, esperando que se postule
//   3. POSTULADO     — completo form (onboarding_requests.status=PENDING)
//   4. CUENTA_OK     — admin aprobo cuenta (status=IN_PROGRESS), esperando wizard
//   5. WIZARD_OK     — completo wizard (status=NEEDS_INFO), esperando aprobar backfill
//   6. BACKFILLING   — backfill corriendo
//   7. ACTIVO        — todo OK, cliente operando
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Leads (etapas 1 y 2)
    const leadsRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "leads" WHERE "convertedToOnboardingId" IS NULL ORDER BY "createdAt" DESC`
    );

    // Onboarding requests (etapas 3-7)
    const obRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT id, "companyName", "contactName", "contactEmail", "contactPhone",
              "contactWhatsapp", "status", "createdOrgId", "createdAt", "updatedAt",
              "activatedAt", "industry", "storeUrl"
       FROM "onboarding_requests"
       ORDER BY "createdAt" DESC`
    );

    const stages: Record<string, any[]> = {
      LEAD: [],
      CONTACTADO: [],
      POSTULADO: [],
      CUENTA_OK: [],
      WIZARD_OK: [],
      BACKFILLING: [],
      ACTIVO: [],
    };

    // Procesar leads
    for (const l of leadsRows) {
      const stage = l.status === "CONTACTADO" ? "CONTACTADO" : "LEAD";
      stages[stage].push({
        type: "lead",
        id: l.id,
        companyName: l.companyName,
        contactName: l.contactName,
        contactEmail: l.contactEmail,
        contactPhone: l.contactPhone,
        industry: l.industry,
        estimatedMonthlyOrders: l.estimatedMonthlyOrders,
        source: l.source,
        notes: l.notes,
        lastContactedAt: l.lastContactedAt ? new Date(l.lastContactedAt).toISOString() : null,
        lastEmailSentAt: l.lastEmailSentAt ? new Date(l.lastEmailSentAt).toISOString() : null,
        createdAt: new Date(l.createdAt).toISOString(),
      });
    }

    // Procesar onboarding requests → mapear status enum a etapa visual
    for (const r of obRows) {
      let stage: string;
      switch (r.status) {
        case "PENDING":
          stage = "POSTULADO";
          break;
        case "IN_PROGRESS":
          stage = "CUENTA_OK";
          break;
        case "NEEDS_INFO":
          stage = "WIZARD_OK";
          break;
        case "BACKFILLING":
          stage = "BACKFILLING";
          break;
        case "ACTIVE":
          stage = "ACTIVO";
          break;
        case "REJECTED":
          continue; // no mostrar rechazadas en pipeline
        default:
          stage = "POSTULADO";
      }

      stages[stage].push({
        type: "onboarding",
        id: r.id,
        companyName: r.companyName,
        contactName: r.contactName,
        contactEmail: r.contactEmail,
        contactPhone: r.contactPhone,
        contactWhatsapp: r.contactWhatsapp,
        industry: r.industry,
        storeUrl: r.storeUrl,
        status: r.status,
        createdOrgId: r.createdOrgId,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
        activatedAt: r.activatedAt ? new Date(r.activatedAt).toISOString() : null,
      });
    }

    const counts = Object.fromEntries(
      Object.entries(stages).map(([k, v]) => [k, v.length])
    );

    return NextResponse.json({
      ok: true,
      stages,
      counts,
      totalActive: counts.ACTIVO,
      totalInProgress:
        counts.LEAD + counts.CONTACTADO + counts.POSTULADO +
        counts.CUENTA_OK + counts.WIZARD_OK + counts.BACKFILLING,
    });
  } catch (error: any) {
    console.error("[admin/pipeline] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
