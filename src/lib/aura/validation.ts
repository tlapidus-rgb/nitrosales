// ══════════════════════════════════════════════════════════════
// Validaciones puras de Aura — compartidas cliente/servidor
// ══════════════════════════════════════════════════════════════
// Módulo SIN dependencias de servidor (no prisma) para que los forms
// "use client" y los endpoints usen EXACTAMENTE las mismas reglas.
// Review 2026-07: la regla de teléfono estaba duplicada entre
// create-creator.ts y aura/creadores/nuevo/page.tsx (riesgo de drift).
// ══════════════════════════════════════════════════════════════

/**
 * Ventana de atribución por defecto del motor Aura (días).
 * 14 → 7 por pedido de Tomy (2026-07-20). Es la ÚNICA fuente de verdad:
 * el `@default` de Prisma y los fallbacks de los endpoints tienen que
 * seguir a esta constante, no repetir el número.
 */
export const AURA_DEFAULT_ATTRIBUTION_WINDOW_DAYS = 7;
/** Rango permitido para ventanas de atribución (creador y campaña). */
export const ATTRIBUTION_WINDOW_MIN_DAYS = 1;
export const ATTRIBUTION_WINDOW_MAX_DAYS = 180;

const PHONE_MAX_LENGTH = 32;
const PHONE_MIN_DIGITS = 6;
// Acepta formatos comunes: +54 9 11 1234 5678, (011) 4123-4567, 1123456789
const PHONE_REGEX = /^[+(\d][\d\s\-()]*$/;

/** Valida un teléfono de creador. Regla única para form y API. */
export function isValidCreatorPhone(phone: unknown): phone is string {
  if (typeof phone !== "string") return false;
  const trimmed = phone.trim();
  if (trimmed.length === 0 || trimmed.length > PHONE_MAX_LENGTH) return false;
  if (!PHONE_REGEX.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= PHONE_MIN_DIGITS;
}
