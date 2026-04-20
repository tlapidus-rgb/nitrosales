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
// Estado Sesión 52 Fase A6 (auditoría multi-tenant):
// FALLBACK CONDICIONAL: si no hay session y hay UNA SOLA org en el
// sistema, usa esa (compat single-tenant). Si hay 2+ orgs sin session,
// THROW con error explícito — no leakea silenciosamente data cruzada.
//
// Comportamiento:
// - Hoy (1 org Mundo del Juguete): funciona igual que antes.
// - Cuando entre Arredo (2 orgs): endpoints sin session que NO pasen
//   orgId explícito van a fallar con 500 visible → identifican callers
//   pendientes de migración sin riesgo de data leak.
// ══════════════════════════════════════════════════════════════

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { NextRequest } from "next/server";

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

export class AmbiguousOrgError extends Error {
  constructor(orgCount: number) {
    super(
      `Hay ${orgCount} orgs activas y este endpoint no recibió orgId explícito. ` +
        "Multi-tenant safety: migrar el caller a pasar orgId (session, ?org=, o mlUserId del payload)."
    );
    this.name = "AmbiguousOrgError";
  }
}

/**
 * Get the organization for the current request.
 *
 * Priority:
 * 1. Session JWT (authenticated user routes)
 * 2. Single-org fallback: si hay 1 sola org en DB, la usa (compat MdJ).
 * 3. Si hay 2+ orgs → throw AmbiguousOrgError (multi-tenant safety).
 */
export async function getOrganization(
  _req?: NextRequest
): Promise<OrgInfo> {
  // 1. Session-based auth
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

  // 2. Single-org fallback (compat durante transición multi-tenant)
  const allOrgs = await prisma.organization.findMany({
    select: { id: true, name: true, slug: true },
    take: 2, // Solo necesitamos saber si hay 1 o más
  });

  if (allOrgs.length === 0) {
    throw new NoOrganizationError(
      "No hay ninguna organización en la DB. Setup inicial requerido."
    );
  }

  if (allOrgs.length === 1) {
    console.warn(
      "[auth-guard] Single-org fallback activado (1 sola org). " +
        "Caller pendiente de migración multi-tenant."
    );
    return allOrgs[0];
  }

  // 3. 2+ orgs sin session → THROW (no data leak)
  throw new AmbiguousOrgError(allOrgs.length);
}

/**
 * Devuelve solo el orgId (más liviano, sin DB call si session lo tiene).
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

  // Single-org fallback
  const allOrgs = await prisma.organization.findMany({
    select: { id: true },
    take: 2,
  });

  if (allOrgs.length === 0) {
    throw new NoOrganizationError("No hay organizaciones en DB");
  }

  if (allOrgs.length === 1) {
    console.warn(
      "[auth-guard] getOrganizationId single-org fallback. " +
        "Caller pendiente de migración multi-tenant."
    );
    return allOrgs[0].id;
  }

  throw new AmbiguousOrgError(allOrgs.length);
}

/**
 * Variant estricto: throw si no hay session. Sin fallback.
 * Usalo en endpoints que ya migraste y NUNCA deberían caer al fallback.
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
