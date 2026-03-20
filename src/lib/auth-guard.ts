// ══════════════════════════════════════════════════════════════
// Auth Guard - Organization Resolution
// ══════════════════════════════════════════════════════════════
// Resolves the current organization from the user's session.
// For public/webhook routes, falls back to org lookup by slug.
//
// Usage in API routes:
//   const org = await getOrganization(req);
//   // org.id is the organizationId to use in all queries

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { NextRequest } from "next/server";

// Fallback org ID for routes not yet migrated to session-based auth
const FALLBACK_ORG_ID =
  process.env.DEFAULT_ORG_ID || "cmmmga1uq0000sb43w0krvvys";

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
}

/**
 * Get the organization for the current request.
 *
 * Priority:
 * 1. Session JWT (authenticated user routes)
 * 2. Fallback to default org (for cron/webhook/legacy routes)
 *
 * When NitroSales goes multi-tenant, routes that use the fallback
 * MUST be migrated to require session auth.
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

  // 2. Fallback to default org
  const org = await prisma.organization.findUnique({
    where: { id: FALLBACK_ORG_ID },
    select: { id: true, name: true, slug: true },
  });

  if (!org) {
    throw new Error(
      `Default organization not found (${FALLBACK_ORG_ID}). ` +
        "Set DEFAULT_ORG_ID env var or ensure the org exists in DB."
    );
  }

  return org;
}

/**
 * Get the organization ID only (lighter, no DB call if session has it).
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

  return FALLBACK_ORG_ID;
}
