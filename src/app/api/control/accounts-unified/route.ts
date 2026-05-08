// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/control/accounts-unified
// ══════════════════════════════════════════════════════════════
// Devuelve UNA sola lista normalizada con TODAS las "cuentas" del sistema:
//   - Leads (pipeline temprano, antes de aplicar)
//   - Onboarding requests (postulados, en wizard, rechazados, etc)
//   - Organizations (cuentas activas, incluyendo "fundadoras" sin onboarding)
//
// Cada item tiene shape uniforme para que el frontend muestre todo en
// una sola tabla con tabs/filtros por estado.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

type AccountKind = "lead" | "onboarding" | "org";
type AccountStatus =
  | "LEAD"
  | "CONTACTADO"
  | "POSTULADO"
  | "CUENTA_OK"
  | "WIZARD_OK"
  | "BACKFILLING"
  | "READY_FOR_REVIEW"
  | "ACTIVA"
  | "FUNDADORA"
  | "RECHAZADA";

interface AccountRow {
  kind: AccountKind;
  id: string; // unique row id (lead.id, onboarding.id, or org.id with prefix)
  orgId: string | null;
  onboardingId: string | null;
  leadId: string | null;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  storeUrl: string | null;
  status: AccountStatus;
  platforms: { vtex: boolean; ml: boolean; meta: boolean; google: boolean };
  // Fechas relevantes
  submittedAt: string | null; // cuando llego la solicitud (lead o onboarding)
  activatedAt: string | null; // cuando se activo la cuenta
  createdAt: string; // siempre presente — sirve para ordenar
}

export async function GET() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 1) Leads (no convertidos aún) — SELECT * para tolerar columnas variables
    let leadsRows: Array<any> = [];
    let leadsError: string | null = null;
    try {
      leadsRows = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT * FROM "leads" WHERE "convertedToOnboardingId" IS NULL ORDER BY "createdAt" DESC`
      );
    } catch (e: any) {
      leadsError = e.message?.slice(0, 200);
      console.error("[accounts-unified] leads query failed:", e.message);
    }

    // 2) Onboarding requests
    let obRows: Array<any> = [];
    let obError: string | null = null;
    try {
      obRows = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT id, "companyName", "contactName", "contactEmail", "contactPhone",
                "status"::text as "status", "createdOrgId", "createdAt", "activatedAt",
                "storeUrl",
                ("vtexAccountName" IS NOT NULL) AS "hasVtex",
                ("mlUsername" IS NOT NULL) AS "hasMl",
                ("metaAdAccountId" IS NOT NULL) AS "hasMeta",
                ("googleAdsCustomerId" IS NOT NULL) AS "hasGoogleAds"
         FROM "onboarding_requests"
         ORDER BY "createdAt" DESC`
      );
    } catch (e: any) {
      obError = e.message?.slice(0, 200);
      console.error("[accounts-unified] onboardings query failed:", e.message);
    }

    // 3) Orgs (organizations) — incluye las "fundadoras" sin onboarding_request
    let orgRows: Array<any> = [];
    let orgError: string | null = null;
    try {
      orgRows = await prisma.organization.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          connections: {
            select: { platform: true, status: true },
          },
          // Traer TODOS los users de la org para luego elegir el OWNER real.
          // Antes hacia take: 1 sin orden y a veces traia un user de prueba
          // (ej: gerencia@... creado para testear ML) en vez del owner real.
          users: {
            select: { email: true, name: true, role: true, createdAt: true },
          },
        },
      });
    } catch (e: any) {
      orgError = e.message?.slice(0, 200);
      console.error("[accounts-unified] orgs query failed:", e.message);
    }

    // Mapeo
    const items: AccountRow[] = [];

    // Leads
    for (const l of leadsRows) {
      const status: AccountStatus =
        l.status === "CONTACTADO" ? "CONTACTADO" : "LEAD";
      items.push({
        kind: "lead",
        id: `lead:${l.id}`,
        orgId: null,
        onboardingId: null,
        leadId: l.id,
        companyName: l.companyName || "(sin nombre)",
        contactName: l.contactName || null,
        contactEmail: l.contactEmail || null,
        contactPhone: l.contactPhone || null,
        storeUrl: l.storeUrl || null,
        status,
        platforms: { vtex: false, ml: false, meta: false, google: false },
        submittedAt: l.createdAt ? new Date(l.createdAt).toISOString() : null,
        activatedAt: null,
        createdAt: new Date(l.createdAt).toISOString(),
      });
    }

    // Onboarding requests + tracking de cuáles tienen createdOrgId (para no duplicar con orgs)
    const orgsConOnboarding = new Set<string>();
    for (const o of obRows) {
      if (o.createdOrgId) orgsConOnboarding.add(o.createdOrgId);
      // mapear status a AccountStatus
      let status: AccountStatus;
      switch (o.status) {
        case "PENDING":
          status = "POSTULADO";
          break;
        case "IN_PROGRESS":
          status = "CUENTA_OK";
          break;
        case "NEEDS_INFO":
          status = "WIZARD_OK";
          break;
        case "BACKFILLING":
          status = "BACKFILLING";
          break;
        case "READY_FOR_REVIEW":
          status = "READY_FOR_REVIEW";
          break;
        case "ACTIVE":
          status = "ACTIVA";
          break;
        case "REJECTED":
          status = "RECHAZADA";
          break;
        default:
          status = "POSTULADO";
      }
      items.push({
        kind: "onboarding",
        id: `ob:${o.id}`,
        orgId: o.createdOrgId || null,
        onboardingId: o.id,
        leadId: null,
        companyName: o.companyName || "(sin nombre)",
        contactName: o.contactName || null,
        contactEmail: o.contactEmail || null,
        contactPhone: o.contactPhone || null,
        storeUrl: o.storeUrl || null,
        status,
        platforms: {
          vtex: !!o.hasVtex,
          ml: !!o.hasMl,
          meta: !!o.hasMeta,
          google: !!o.hasGoogleAds,
        },
        submittedAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
        activatedAt: o.activatedAt ? new Date(o.activatedAt).toISOString() : null,
        createdAt: new Date(o.createdAt).toISOString(),
      });
    }

    // Orgs SIN onboarding_request (fundadoras como EMDJ)
    for (const org of orgRows) {
      if (orgsConOnboarding.has(org.id)) continue; // ya esta como onboarding ACTIVA
      const platforms = {
        vtex: org.connections.some((c) => c.platform === "VTEX"),
        ml: org.connections.some(
          (c) => c.platform === "MERCADOLIBRE" || c.platform === "ML"
        ),
        meta: org.connections.some((c) => c.platform === "META_ADS"),
        google: org.connections.some(
          (c) => c.platform === "GOOGLE_ADS" || c.platform === "GA4" || c.platform === "GSC"
        ),
      };
      // Elegir el user "principal" priorizando role:
      // 1) OWNER (dueño real de la cuenta)
      // 2) ADMIN
      // 3) MEMBER (cualquier user mas antiguo)
      // Antes tomabamos org.users[0] sin orden, lo que a veces traia un user
      // de prueba (ej: gerencia@... creado para testear ML) en vez del owner.
      const sortedUsers = [...(org.users || [])].sort((a: any, b: any) => {
        const roleRank: Record<string, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };
        const ra = roleRank[a.role] ?? 99;
        const rb = roleRank[b.role] ?? 99;
        if (ra !== rb) return ra - rb;
        // Mismo rol → más antiguo primero (probablemente el original)
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
      const ownerUser = sortedUsers[0];
      items.push({
        kind: "org",
        id: `org:${org.id}`,
        orgId: org.id,
        onboardingId: null,
        leadId: null,
        companyName: org.name,
        contactName: ownerUser?.name || null,
        contactEmail: ownerUser?.email || null,
        contactPhone: null,
        storeUrl: null,
        status: "FUNDADORA",
        platforms,
        submittedAt: null,
        activatedAt: org.createdAt ? new Date(org.createdAt).toISOString() : null,
        createdAt: new Date(org.createdAt).toISOString(),
      });
    }

    // Ordenar por createdAt desc
    items.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

    // Counts por status
    const counts: Record<string, number> = {};
    for (const it of items) {
      counts[it.status] = (counts[it.status] || 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      total: items.length,
      counts,
      items,
      // Diagnostico: si alguna fuente fallo, devolvemos los errores
      // sin romper la respuesta — asi el frontend muestra lo que SI cargo.
      errors:
        leadsError || obError || orgError
          ? { leads: leadsError, onboardings: obError, orgs: orgError }
          : undefined,
      sources: {
        leads: leadsRows.length,
        onboardings: obRows.length,
        orgs: orgRows.length,
      },
    });
  } catch (error: any) {
    console.error("[control/accounts-unified] error:", error);
    return NextResponse.json(
      { error: error.message || "Error" },
      { status: 500 }
    );
  }
}
