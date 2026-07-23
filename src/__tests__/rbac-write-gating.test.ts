import { describe, it, expect } from "vitest";
import { isPathAllowed } from "@/lib/section-access";

// ══════════════════════════════════════════════════════════════════════════
// REGRESIÓN — leer NO puede implicar escribir (auditoría 2026-07-22)
// ══════════════════════════════════════════════════════════════════════════
// El gating por sección sólo miraba `allowedSections` (read+) y JAMÁS el método
// HTTP. Un user con `aura: read` podía hacer POST /api/aura/creators/<id>/settle
// (registrar pagos), DELETE de campañas, etc. Ahora los métodos que mutan una
// ruta de API exigen que la sección esté también en `writableSections`.
//
// isPathAllowed es lógica pura (sin DB) → se testea directo, sin PGlite.
// ══════════════════════════════════════════════════════════════════════════

const base = {
  pathname: "/api/aura/creators/abc/settle",
  isApi: true,
  isStaff: false,
  allowedSections: ["aura"] as string[] | undefined,
  writableSections: [] as string[] | undefined,
};

describe("isPathAllowed — gating por método", () => {
  it("EL BUG: read a la sección NO habilita POST a su API", () => {
    // aura en allowedSections (puede ver) pero NO en writableSections.
    expect(isPathAllowed({ ...base, method: "POST" })).toBe(false);
    expect(isPathAllowed({ ...base, method: "DELETE" })).toBe(false);
    expect(isPathAllowed({ ...base, method: "PUT" })).toBe(false);
    expect(isPathAllowed({ ...base, method: "PATCH" })).toBe(false);
  });

  it("read a la sección SÍ habilita GET", () => {
    expect(isPathAllowed({ ...base, method: "GET" })).toBe(true);
  });

  it("write a la sección habilita los métodos que mutan", () => {
    const w = { ...base, writableSections: ["aura"] };
    expect(isPathAllowed({ ...w, method: "POST" })).toBe(true);
    expect(isPathAllowed({ ...w, method: "DELETE" })).toBe(true);
    expect(isPathAllowed({ ...w, method: "GET" })).toBe(true);
  });

  it("sin la sección en allowedSections, ni ver puede (menos escribir)", () => {
    const none = { ...base, allowedSections: ["dashboard"], writableSections: ["dashboard"] };
    expect(isPathAllowed({ ...none, method: "GET" })).toBe(false);
    expect(isPathAllowed({ ...none, method: "POST" })).toBe(false);
  });

  it("staff pasa siempre, incluso writes", () => {
    expect(isPathAllowed({ ...base, method: "POST", isStaff: true })).toBe(true);
  });

  it("ruta sin sección restringida: cualquier método pasa", () => {
    const free = { ...base, pathname: "/api/health", allowedSections: [], writableSections: [] };
    expect(isPathAllowed({ ...free, method: "POST" })).toBe(true);
  });

  it("fail-open: allowedSections undefined (token viejo) deja pasar", () => {
    expect(
      isPathAllowed({ ...base, method: "POST", allowedSections: undefined })
    ).toBe(true);
  });

  it("fail-open acotado: writableSections undefined (token viejo) deja pasar el write", () => {
    // Bloquear de golpe lockearía writes legítimos hasta re-login. Se cierra
    // solo cuando el JWT rota y trae el snapshot.
    expect(
      isPathAllowed({ ...base, method: "POST", writableSections: undefined })
    ).toBe(true);
  });

  it("el gating de write es SÓLO para API: un POST a una página no se bloquea por método", () => {
    // Las páginas son GET en la práctica; el gate de write no debe afectarlas.
    const page = {
      ...base,
      pathname: "/aura/pagos",
      isApi: false,
      writableSections: [],
    };
    expect(isPathAllowed({ ...page, method: "POST" })).toBe(true);
  });
});
