import type { Session } from "next-auth";
import { prisma } from "@/lib/db/client";
import { isStaffUser } from "@/lib/staff";
import { leerEstado } from "./suspension";

/** Check current state on every Node session resolution, including existing JWTs. */
export async function enforceOrganizationAccess(session: Session): Promise<Session> {
  const user = session.user as (NonNullable<Session["user"]> & {
    organizationId?: string; isStaff?: boolean; impersonatedBy?: string;
  }) | undefined;
  if (!user) return session;
  // Support keeps access in view-as; impersonation experiences the client's block.
  if (!user.impersonatedBy && isStaffUser(user)) return session;
  let blocked: "suspended" | "unavailable" | undefined;
  try {
    if (typeof user.organizationId !== "string" || !user.organizationId.trim()) blocked = "unavailable";
    else {
      const org = await prisma.organization.findUnique({
        where: { id: user.organizationId }, select: { settings: true },
      });
      if (!org) blocked = "unavailable";
      else if (!leerEstado(org.settings).activa) blocked = "suspended";
      else if (!org.settings || typeof org.settings !== "object" || Array.isArray(org.settings)
        || ("suspension" in org.settings && org.settings.suspension != null)) blocked = "unavailable";
    }
  } catch { blocked = "unavailable"; }
  // No usable identity or internal reason escapes when access cannot be verified.
  return blocked ? { expires: session.expires, organizationAccess: blocked } as Session : session;
}
