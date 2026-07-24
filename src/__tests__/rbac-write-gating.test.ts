import { describe, it, expect } from "vitest";
import { isPathAllowed, requiredSectionForPath } from "@/lib/section-access";

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

// ══════════════════════════════════════════════════════════════════════════
// Namespaces que la auditoría había dejado sin gatear (2026-07-24)
// ══════════════════════════════════════════════════════════════════════════
describe("nuevos namespaces gateados", () => {
  const cases: Array<[string, string]> = [
    ["/api/aurum/section-insight", "aurum"],
    ["/api/chat", "aurum"],
    ["/api/memory/notes", "memory"],
    ["/api/ltv/predict", "bondly"],
    ["/api/audiences/sync", "campaigns"],
    ["/api/analyze/creative", "campaigns"],
    ["/api/finance/manual-costs", "costos"],
    ["/api/finance/fiscal", "fiscal"],
    ["/api/finance/fiscal-profile", "fiscal"], // gana sobre el catch-all /api/finance
  ];
  it.each(cases)("%s → sección %s", (path, section) => {
    expect(requiredSectionForPath(path)).toBe(section);
  });

  it("read a la nueva sección NO habilita POST (mismo gate de método)", () => {
    const p = {
      pathname: "/api/ltv/predict",
      isApi: true,
      isStaff: false,
      allowedSections: ["bondly"],
    };
    expect(isPathAllowed({ ...p, method: "POST", writableSections: [] })).toBe(false);
    expect(isPathAllowed({ ...p, method: "POST", writableSections: ["bondly"] })).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ⚠️ REGRESIÓN: flujos SELF y pendientes que NO deben gatearse. Gatear
// /api/settings o /api/dashboard en grueso rompería estos (un MEMBER sin write
// de settings_org no podría cambiar SU contraseña ni aceptar una invitación).
// ══════════════════════════════════════════════════════════════════════════
describe("flujos self / pendientes NO se gatean", () => {
  const noGate = [
    "/api/settings/security/password",        // cambiar la propia contraseña
    "/api/settings/team/invitations/accept",  // aceptar invitación
    "/api/dashboard/preferences",             // preferencias propias del usuario
    "/api/influencers/applications",          // sin sección — decisión de Tomy pendiente
  ];
  it.each(noGate)("%s pasa (sección null)", (path) => {
    expect(requiredSectionForPath(path)).toBe(null);
  });
});
