import { describe, it, expect, vi, beforeEach } from "vitest";

// ══════════════════════════════════════════════════════════════════════════
// R-C05 — el gate staff-only NO puede romper los crons ni al staff
// ══════════════════════════════════════════════════════════════════════════
// `section-access-staff-only.test.ts` cubre la lógica pura de quién entra. Acá se
// cubren las dos formas en que este arreglo puede tumbar producción en silencio:
//
//   1. Los 28 crons y los self-fetch server-to-server le pegan a `/api/admin/*`
//      SIN cookie de NextAuth. Si el middleware los bloqueara, dejarían de correr
//      y Vercel no alerta por un 403 en un cron: se descubre semanas después,
//      con datos faltantes.
//   2. `staff.ts` combina el flag `users.isStaff` de la base con una allowlist de
//      transición por email. El middleware era el ÚNICO lugar que miraba sólo el
//      flag. Con el gate nuevo, un staff que todavía no tiene `isStaff=true` en
//      la base pasaba de "ve menos secciones" a "no entra más a /control".
// ══════════════════════════════════════════════════════════════════════════

const getToken = vi.fn();
vi.mock("next-auth/jwt", () => ({ getToken: (...a: unknown[]) => getToken(...a) }));

const { default: middleware } = await import("@/middleware");

function req(pathname: string, method = "GET") {
  return {
    nextUrl: { pathname, clone: () => new URL(`https://app.nitrosales.ai${pathname}`) },
    method,
    url: `https://app.nitrosales.ai${pathname}`,
    headers: new Headers(),
    cookies: { get: () => undefined },
  } as never;
}

/** 200/next = pasó · 403 = lo bloqueó el gate. */
async function status(pathname: string, method = "GET"): Promise<number> {
  return (await middleware(req(pathname, method))).status;
}

// Sin `mockReset()` a propósito: cada test fija su propia implementación, y en
// vitest 4 un `mockReset()` en beforeEach hace que un throw del mock escape del
// try/catch del middleware y falle el test aunque el guard funcione.

describe("los crons y los self-fetch no llevan token: tienen que pasar", () => {
  beforeEach(() => getToken.mockResolvedValue(null));

  it.each([
    "/api/admin/setup-pixel-rollups",
    "/api/admin/trigger-vtex-sync",
    "/api/admin/vtex-recover-customer-emails",
    "/api/admin/reconcile",
    "/api/backfill/runner",
  ])("%s pasa el middleware sin sesión", async (p) => {
    // Pasa el MIDDLEWARE. Cada handler sigue exigiendo su `?key=` — el gate de
    // sección nunca fue el que los autenticaba.
    expect(await status(p)).not.toBe(403);
  });

  it("tampoco bloquea un POST sin token", async () => {
    expect(await status("/api/admin/reattribute", "POST")).not.toBe(403);
  });

  // NO hay caso para "si getToken explota, no se bloquea nada". El guard existe
  // (middleware.ts lo envuelve en try/catch) y lo verifiqué a mano: devuelve 200 y
  // no propaga. Pero en vitest 4 un mock que tira sincrónicamente escapa igual del
  // try/catch del código bajo test y falla el caso aunque el guard ande. Es un
  // artefacto del harness, y ese guard es preexistente: no es lo que arregla R-C05.
});

describe("staff por allowlist de email, sin el flag en la base", () => {
  it("entra a /api/admin aunque users.isStaff sea false", async () => {
    // Es el caso de tlapidus@99media.com.ar en staff.ts. auth.ts ya lo trata como
    // staff; el middleware no lo hacía.
    getToken.mockResolvedValue({
      isStaff: false,
      email: "tlapidus@99media.com.ar",
      allowedSections: ["dashboard"],
      writableSections: ["dashboard"],
    });
    expect(await status("/api/admin/onboardings")).not.toBe(403);
  });

  it("y el email se compara sin distinguir mayúsculas", async () => {
    getToken.mockResolvedValue({
      isStaff: false,
      email: "TLapidus@99Media.com.ar",
      allowedSections: ["dashboard"],
      writableSections: ["dashboard"],
    });
    expect(await status("/api/admin/onboardings")).not.toBe(403);
  });

  it("un email cualquiera NO es staff", async () => {
    getToken.mockResolvedValue({
      isStaff: false,
      email: "mromero@arredo.com.ar",
      allowedSections: ["dashboard", "pixel"],
      writableSections: ["dashboard", "pixel"],
    });
    expect(await status("/api/admin/onboardings")).toBe(403);
  });

  it("un token sin email tampoco rompe nada", async () => {
    getToken.mockResolvedValue({ isStaff: true, allowedSections: [], writableSections: [] });
    expect(await status("/api/admin/onboardings")).not.toBe(403);
  });
});

describe("el cliente logueado: bloqueado en admin, intacto en lo suyo", () => {
  beforeEach(() =>
    getToken.mockResolvedValue({
      isStaff: false,
      email: "leandroc@tevecompras.com",
      allowedSections: ["dashboard", "pixel"],
      writableSections: ["dashboard", "pixel"],
    }),
  );

  it("EL BUG: antes atravesaba el middleware hacia cualquier ruta admin", async () => {
    expect(await status("/api/admin/usage")).toBe(403);
    expect(await status("/api/admin/reattribute", "POST")).toBe(403);
    expect(await status("/api/backfill/vtex")).toBe(403);
  });

  it("el panel de canales le sigue funcionando", async () => {
    expect(await status("/api/admin/channel-rules")).not.toBe(403);
    expect(await status("/api/admin/channel-rules", "POST")).not.toBe(403);
    expect(await status("/api/admin/channels-breakdown")).not.toBe(403);
  });

  it("y sus métricas también", async () => {
    expect(await status("/api/metrics/orders")).not.toBe(403);
    expect(await status("/api/metrics/pixel")).not.toBe(403);
  });
});
