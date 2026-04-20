// ══════════════════════════════════════════════════════════════
// Org Store URL resolver — Multi-tenant safe
// ══════════════════════════════════════════════════════════════
// Resuelve la URL de la tienda online de una org.
//
// Priority:
//   1. Organization.settings.storeUrl (configurado via /settings/organization)
//   2. process.env.STORE_URL (compat legacy — single tenant)
//   3. "" + warning (multi-tenant breaking: cada org DEBE tener su storeUrl)
//
// Cambio Sesión 52 Fase D: eliminado el default hardcoded a
// "https://elmundodeljuguete.com.ar" que leakeaba el cliente actual a
// otras orgs.
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

export async function getStoreUrl(orgId: string): Promise<string> {
  if (!orgId) {
    console.warn("[getStoreUrl] Sin orgId — usando env fallback");
    return process.env.STORE_URL || "";
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true, slug: true },
    });
    const settings = (org?.settings as any) ?? {};
    const fromSettings = typeof settings.storeUrl === "string" ? settings.storeUrl.trim() : "";
    if (fromSettings) {
      return fromSettings.replace(/\/+$/, ""); // strip trailing slash
    }
  } catch (e) {
    console.warn(`[getStoreUrl] DB lookup failed for org ${orgId}:`, e);
  }

  const fromEnv = process.env.STORE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  console.warn(
    `[getStoreUrl] Sin storeUrl configurado para org ${orgId}. ` +
      "Setear Organization.settings.storeUrl o STORE_URL env var."
  );
  return "";
}
