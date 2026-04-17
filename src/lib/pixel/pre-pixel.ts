// ══════════════════════════════════════════════════════════════
// NitroPixel — Pre-Pixel Detection
// ══════════════════════════════════════════════════════════════
// Helpers para marcar ordenes hechas ANTES que se instalara
// NitroPixel. Estas ordenes nunca van a tener canal porque no
// existe pixel data de ese periodo — es una limitacion del
// origen de los datos, no del plan.
//
// Se usa en la UI para mostrar "Pre-pixel" en vez de "Sin canal"
// y evitar que el equipo crea que hay un bug de atribucion.
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

// Cache in-memory por proceso (TTL 1h).
// Para single-org esta fine. Si en el futuro hay multi-org y este
// cache crece, reemplazar por Redis o por una columna en organizations.
const installDateCache = new Map<
  string,
  { value: Date | null; expiresAt: number }
>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

/**
 * Devuelve la fecha del PRIMER evento pixel registrado para esta
 * organization. Esa es, de facto, la fecha de instalacion del pixel.
 *
 * Devuelve null si la org nunca tuvo un evento (caso raro, significa
 * que el pixel nunca se instalo o no enviA eventos todavia).
 */
export async function getPixelInstallDate(
  organizationId: string
): Promise<Date | null> {
  const cached = installDateCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const firstEvent = await prisma.pixelEvent.findFirst({
      where: { organizationId },
      select: { timestamp: true },
      orderBy: { timestamp: "asc" },
    });

    const value = firstEvent?.timestamp ?? null;
    installDateCache.set(organizationId, {
      value,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return value;
  } catch (error) {
    console.error("[prePixel] Error getting install date (non-fatal):", error);
    // No cachear errores — la proxima llamada reintenta
    return null;
  }
}

/**
 * True si la orden fue hecha ANTES de que se instalara el pixel.
 * Estas ordenes nunca van a tener canal (imposible de recuperar).
 */
export function isPrePixelOrder(
  orderDate: Date | string | null | undefined,
  installDate: Date | null
): boolean {
  if (!installDate || !orderDate) return false;
  const d = typeof orderDate === "string" ? new Date(orderDate) : orderDate;
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < installDate.getTime();
}

/**
 * Limpia el cache (util para tests o cuando se reinstala el pixel).
 */
export function clearPixelInstallDateCache(): void {
  installDateCache.clear();
}
