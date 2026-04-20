// ══════════════════════════════════════════════════════════════
// Auth Guard - Organization Resolution (Multi-tenant safe)
// ══════════════════════════════════════════════════════════════
// Resuelve la organización del user logueado.
//
// Contract:
//   - Endpoints autenticados: usan getOrganization() / getOrganizationId()
//     — devuelven la org de la session.
//   - Endpoints sin session (webhooks, crons): deben resolver la org por
//     OTRO mecanismo explícito (accountName, ?key=, mlUserId, etc).
//
// Estado Sesión 52 Fase 12 (auditoría multi-tenant):
// El fallback a DEFAULT_ORG_ID se mantiene TEMPORALMENTE mientras migramos
// endpoints uno por uno para que tomen orgId explícito. Una vez migrados
// TODOS los callers que dependen del fallback, este código final (auth-guard
// Fase A6) elimina el fallback.
//
// IMPORTANTE: el fallback solo se activa si no hay session. Cualquier uso
// del fallback loguea un warning para trackear los callers pendientes.
// ══════════════════════════════════════════════════════════════

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { NextRequest } from "next/server";

// Fallback org ID — TEMPORAL hasta completar migración multi-tenant.
// Cuando TODOS los callers tomen orgId explícito, eliminar este const
// y hacer que las funciones throw si no hay session.
const FALLBACK_ORG_ID =
  process.env.DEFAULT_ORG_ID || "cmmmga1uq0000sb43w0krvvys";

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
}

export class NoOrganizationError extends Error {
  constructor(message = "No organization in session") {
    super(message);
    this.name = "NoOrganizationError";
  }
}

/**
 * Get the organization for the current request.
 *
 * Priority:
 * 1. Session JWT (authenticated user routes)
 * 2. Fallback to DEFAULT_ORG_ID (temporal durante migración multi-tenant)
 *
 * ⚠ El fallback loguea un warning cada vez que se usa, para poder rastrear
 * qué endpoint todavía no tomó orgId explícito.
 */
export async function getOrganization(
  _req?: NextRequest
): Promise<OrgInfo> {
  // 1. Try session-based auth
  try {
    const session = await getServerSession(authOptions);
    if (session?.user) {
      const orgId = (session.user as Record<string, unknown>).organizationId as string;
      if (orgId) {
        const org = await prisma.organization.findUnique({
          where: { id: orgId },
          select: { id: true, name: true, slug: true },
        });
        if (org) return org;
      }
    }
  } catch {
    // Session lookup failed (e.g., webhook route with no cookies)
  }

  // 2. Fallback (temporal)
  console.warn(
    "[auth-guard] Usando FALLBACK_ORG_ID. Caller pendiente de migración multi-tenant."
  );
  const org = await prisma.organization.findUnique({
    where: { id: FALLBACK_ORG_ID },
    select: { id: true, name: true, slug: true },
  });

  if (!org) {
    throw new NoOrganizationError(
      `Default organization not found (${FALLBACK_ORG_ID}). ` +
        "Set DEFAULT_ORG_ID env var or ensure the org exists in DB."
    );
  }

  return org;
}

/**
 * Devuelve solo el orgId (más liviano, sin DB call si session lo tiene).
 * Usa fallback si no hay session (temporal — ver comment arriba).
 */
export async function getOrganizationId(): Promise<string> {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user) {
      const orgId = (session.user as Record<string, unknown>).organizationId as string;
      if (orgId) return orgId;
    }
  } catch {
    // Fall through
  }

  console.warn(
    "[auth-guard] getOrganizationId usando FALLBACK_ORG_ID. Caller pendiente de migración."
  );
  return FALLBACK_ORG_ID;
}

/**
 * Variant estricto: throw si no hay session. Usalo en endpoints que
 * ya migraste y NUNCA deberían caer al fallback.
 */
export async function getOrganizationIdStrict(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new NoOrganizationError(
      "No hay session autenticada. Este endpoint requiere login."
    );
  }
  const orgId = (session.user as Record<string, unknown>).organizationId as string;
  if (!orgId) {
    throw new NoOrganizationError(
      "Session sin organizationId. JWT token viejo — logout + login."
    );
  }
  return orgId;
}

/**
 * Variant para endpoints opcionalmente autenticados: devuelve null si no hay
 * session (sin fallback). El caller decide qué hacer.
 */
export async function tryGetOrganizationId(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;
    const orgId = (session.user as Record<string, unknown>).organizationId as string;
    return orgId || null;
  } catch {
    return null;
  }
}
