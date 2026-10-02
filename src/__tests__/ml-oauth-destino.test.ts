import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// El OAuth de MercadoLibre guardaba `returnTo` sin validar y al final hacía un
// redirect ahí: con un link armado, después del login real en ML el cliente
// terminaba en una página del atacante ("volvé a iniciar sesión").

vi.mock("@/lib/db/client", () => ({ prisma: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => null }) }) }));
vi.mock("@/lib/auth-guard", () => ({ tryGetOrganizationId: async () => "ckorg00000000000000000002" }));

import * as connect from "@/app/api/auth/mercadolibre/connect/route";
import * as callback from "@/app/api/auth/mercadolibre/callback/route";

afterEach(() => vi.unstubAllGlobals());

describe("OAuth de MercadoLibre: el destino es siempre de la app", () => {
  it("EL CASO: connect no guarda un returnTo a otro dominio", async () => {
    const res = await connect.GET(new NextRequest("http://local/api/auth/mercadolibre/connect?returnTo=https%3A%2F%2Fevil.example%2Flogin"));
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("ml_oauth_return_to=%2Fcompetitors");
    expect(setCookie).not.toContain("evil.example");
  });

  it("connect respeta un camino de la app", async () => {
    const res = await connect.GET(new NextRequest("http://local/api/auth/mercadolibre/connect?returnTo=%2Fonboarding"));
    expect(res.headers.get("set-cookie") || "").toContain("ml_oauth_return_to=%2Fonboarding");
  });

  it("callback: una cookie de destino a otro dominio no sale de la app", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("red caída"); }));
    const res = await callback.GET(new NextRequest("http://local/api/auth/mercadolibre/callback?code=abc", {
      headers: { cookie: "ml_oauth_return_to=https://evil.example/login; ml_pkce_verifier=v" },
    }));
    const location = new URL(res.headers.get("location")!);
    expect(location.host).toBe("local");
    expect(location.pathname).toBe("/competitors");
  });

  it("callback (conexión exitosa): tampoco", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ access_token: "a", refresh_token: "r", user_id: 1, expires_in: 21600 }), { status: 200 })));
    const res = await callback.GET(new NextRequest("http://local/api/auth/mercadolibre/callback?code=abc", {
      headers: { cookie: "ml_oauth_return_to=https://evil.example/login; ml_pkce_verifier=v" },
    }));
    const location = new URL(res.headers.get("location")!);
    expect(location.host).toBe("local");
    expect(location.pathname).toBe("/competitors");
    expect(location.searchParams.get("ml_connected")).toBe("true");
  });
});
