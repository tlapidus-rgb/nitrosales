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

/** Authenticated organization only. Jobs/webhooks must supply an explicit org. */
export async function getOrganization(_req?: NextRequest): Promise<OrgInfo> {
  const orgId = await getOrganizationIdStrict();
  const org = await prisma.organization.findUnique({
    where: { id: orgId }, select: { id: true, name: true, slug: true },
  });
  if (!org) throw new NoOrganizationError("Organización no disponible");
  return org;
}
export async function getOrganizationId(): Promise<string> {
  return getOrganizationIdStrict();
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
  if (typeof orgId !== "string" || !orgId.trim()) {
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
    return typeof orgId === "string" && orgId.trim() ? orgId : null;
  } catch {
    return null;
  }
}
