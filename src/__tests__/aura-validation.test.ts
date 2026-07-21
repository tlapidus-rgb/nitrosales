// ══════════════════════════════════════════════════════════════
// Tests — validaciones puras de Aura (hotfixes 2026-07-15)
// ══════════════════════════════════════════════════════════════
// 1. isValidCreatorPhone: regla única form + API (teléfono obligatorio).
// 2. campaignNameToSlug: CONTRATO entre la generación de tracking links
//    y el matching del motor de atribución — si divergen, la atribución
//    por campaña deja de matchear en silencio.
// ══════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  isValidCreatorPhone,
  AURA_DEFAULT_ATTRIBUTION_WINDOW_DAYS,
  ATTRIBUTION_WINDOW_MIN_DAYS,
  ATTRIBUTION_WINDOW_MAX_DAYS,
} from "@/lib/aura/validation";
import { campaignNameToSlug } from "@/lib/aura/campaign-slug";

describe("isValidCreatorPhone", () => {
  it("acepta formato internacional con espacios", () => {
    expect(isValidCreatorPhone("+54 9 11 1234 5678")).toBe(true);
  });

  it("acepta formato local con paréntesis inicial", () => {
    // Regresión review 2026-07: la regex original rechazaba '(' inicial
    expect(isValidCreatorPhone("(011) 4123-4567")).toBe(true);
  });

  it("acepta solo dígitos", () => {
    expect(isValidCreatorPhone("1123456789")).toBe(true);
  });

  it("rechaza menos de 6 dígitos reales", () => {
    expect(isValidCreatorPhone("+54 11")).toBe(false);
    expect(isValidCreatorPhone("12345")).toBe(false);
  });

  it("rechaza vacío, no-string y caracteres inválidos", () => {
    expect(isValidCreatorPhone("")).toBe(false);
    expect(isValidCreatorPhone("   ")).toBe(false);
    expect(isValidCreatorPhone(null)).toBe(false);
    expect(isValidCreatorPhone(undefined)).toBe(false);
    expect(isValidCreatorPhone(1123456789)).toBe(false);
    expect(isValidCreatorPhone("abc123456")).toBe(false);
    expect(isValidCreatorPhone("11-2345-6789 ext 4")).toBe(false);
  });

  it("rechaza strings absurdamente largos (cap de 32 chars)", () => {
    expect(isValidCreatorPhone("1".repeat(33))).toBe(false);
    expect(isValidCreatorPhone("1".repeat(32))).toBe(true);
  });
});

describe("campaignNameToSlug — contrato link ↔ atribución", () => {
  // Copia literal de la expresión que usaban tracking-link/route.ts y
  // influencers/[id]/campaigns/route.ts ANTES de extraer el util compartido.
  // Si alguien cambia el util sin actualizar este espejo, este test grita.
  const legacyLinkSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);

  it.each([
    "Campaña Verano 2026",
    "Lanzamiento — Edición Especial Black Friday", // >30 chars, em-dash, acentos
    "PROMO!!! 50% OFF",
    "  espacios  raros  ",
    "ñandú & Cía",
  ])("genera el mismo slug que el lado del link para %j", (name) => {
    expect(campaignNameToSlug(name)).toBe(legacyLinkSlug(name));
  });

  it("trunca a 30 caracteres", () => {
    expect(campaignNameToSlug("a".repeat(50))).toHaveLength(30);
  });

  it("es case-insensitive y colapsa separadores", () => {
    expect(campaignNameToSlug("Campaña   VERANO")).toBe(campaignNameToSlug("campaña verano"));
  });
});

describe("constantes de ventana de atribución", () => {
  it("default 7, rango 1-180 (contrato con las APIs de aura)", () => {
    // 14 → 7 por pedido de Tomy (2026-07-20). Si esto cambia, el @default de
    // Prisma y el DEFAULT de la columna en Neon tienen que acompañar.
    expect(AURA_DEFAULT_ATTRIBUTION_WINDOW_DAYS).toBe(7);
    expect(ATTRIBUTION_WINDOW_MIN_DAYS).toBe(1);
    expect(ATTRIBUTION_WINDOW_MAX_DAYS).toBe(180);
  });
});
