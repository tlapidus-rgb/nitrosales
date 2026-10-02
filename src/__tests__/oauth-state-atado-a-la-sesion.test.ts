import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ══════════════════════════════════════════════════════════════════════════
// OAuth de Meta y Google Ads: el `state` no alcanza, manda la sesión
// ══════════════════════════════════════════════════════════════════════════
// El callback guarda los tokens en la conexión de la organización que dice el
// `state`. Antes: el inicio firmaba un `state` para cualquier `?orgId=` sin
// sesión, la firma usa un secreto filtrado, `returnTo` iba a cualquier dominio
// y las páginas de error mostraban la URL sin escapar (XSS). Ver
// src/lib/oauth-state.ts.
// ══════════════════════════════════════════════════════════════════════════

const m = vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET = "secreto-sintetico-de-prueba";
  process.env.GOOGLE_ADS_CLIENT_ID = "cliente-google-sintetico";
  process.env.META_APP_ID = "app-meta-sintetica";
  process.env.META_APP_SECRET = "secreto-meta-sintetico";
  return { session: null as any, escrituras: [] as any[] };
});

vi.mock("next-auth", () => ({ getServerSession: async () => m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    connection: {
      findFirst: async () => null,
      update: async (x: any) => { m.escrituras.push(x); return {}; },
      create: async (x: any) => { m.escrituras.push(x); return {}; },
      upsert: async (x: any) => { m.escrituras.push(x); return {}; },
    },
  },
}));

import { armarState, destinoSeguro, escaparHtml, leerState } from "@/lib/oauth-state";
import * as googleInicio from "@/app/api/auth/google-ads/route";
import * as googleCallback from "@/app/api/auth/google-ads/callback/route";
import * as metaInicio from "@/app/api/oauth/meta/start/route";
import * as metaCallback from "@/app/api/oauth/meta/callback/route";

const MIA = "ckorgmia0000000000000001";
const VICTIMA = "ckorgvictima000000000001";
const fetchSimulado = vi.fn(async () => new Response(JSON.stringify({ error: { message: "code vencido" } }), { status: 400 }));

beforeEach(() => {
  m.session = null;
  m.escrituras = [];
  fetchSimulado.mockClear();
  vi.stubGlobal("fetch", fetchSimulado);
});
afterEach(() => vi.unstubAllGlobals());

const sesionDe = (orgId: string) => ({ user: { id: "ckuser0000000000000000001", email: "u@tienda.test", organizationId: orgId } });

describe("src/lib/oauth-state", () => {
  it("destinoSeguro sólo deja caminos de esta app", () => {
    expect(destinoSeguro("/settings/integraciones?x=1")).toBe("/settings/integraciones?x=1");
    for (const malo of ["https://evil.example/x", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null]) {
      expect(destinoSeguro(malo as any)).toBe("/settings/integraciones");
    }
  });

  it("leerState valida firma y forma del orgId", () => {
    const st = armarState(VICTIMA, "/onboarding")!;
    expect(leerState(st)).toEqual({ orgId: VICTIMA, returnTo: "/onboarding" });
    const [org, , ...resto] = st.split(".");
    expect(leerState(`${org}.0000000000000000.${resto.join(".")}`)).toBeNull();
    expect(leerState(`x'"><script>.${st.split(".")[1]}.%2F`)).toBeNull();
  });

  it("sin NEXTAUTH_SECRET no firma ni acepta nada (no hay secreto de repuesto)", () => {
    const st = armarState(VICTIMA, "/")!;
    const antes = process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    try {
      expect(armarState(VICTIMA, "/")).toBeNull();
      expect(leerState(st)).toBeNull();
    } finally {
      process.env.NEXTAUTH_SECRET = antes;
    }
  });

  it("un state armado con returnTo a otro dominio vuelve a la app", () => {
    const firma = armarState(VICTIMA, "/")!.split(".")[1];
    expect(leerState(`${VICTIMA}.${firma}.${encodeURIComponent("https://evil.example")}`, "/onboarding")?.returnTo).toBe("/onboarding");
  });

  it("escaparHtml", () => {
    expect(escaparHtml(`<script>"'&`)).toBe("&lt;script&gt;&quot;&#39;&amp;");
  });
});

describe.each([
  ["Google Ads", googleInicio, "/api/auth/google-ads"],
  ["Meta", metaInicio, "/api/oauth/meta/start"],
])("inicio de %s", (_n, ruta, camino) => {
  it("EL CASO: sin sesión, ?orgId= de otro no arranca nada", async () => {
    const res = await ruta.GET(new Request(`http://local${camino}?orgId=${VICTIMA}`));
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });

  it("con sesión, la org es la de la sesión aunque la URL diga otra", async () => {
    m.session = sesionDe(MIA);
    const res = await ruta.GET(new Request(`http://local${camino}?orgId=${VICTIMA}`));
    const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
    expect(state.startsWith(`${MIA}.`)).toBe(true);
  });
});

describe.each([
  ["Google Ads", googleCallback, "/api/auth/google-ads/callback"],
  ["Meta", metaCallback, "/api/oauth/meta/callback"],
])("callback de %s", (_n, ruta, camino) => {
  const callback = (q: string) => ruta.GET(new Request(`http://local${camino}?${q}`));
  const stateDe = (org: string) => encodeURIComponent(armarState(org, "/onboarding")!);

  it("EL CASO: un state válido de otra org con la sesión mía no toca nada", async () => {
    m.session = sesionDe(MIA);
    const res = await callback(`code=abc&state=${stateDe(VICTIMA)}`);
    expect(await res.text()).toContain("Sesión de otra cuenta");
    expect(fetchSimulado).not.toHaveBeenCalled();
    expect(m.escrituras).toEqual([]);
  });

  it("sin sesión tampoco", async () => {
    const res = await callback(`code=abc&state=${stateDe(VICTIMA)}`);
    expect(await res.text()).toContain("Sesión de otra cuenta");
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("firma que no coincide: no sigue", async () => {
    m.session = sesionDe(VICTIMA);
    const res = await callback(`code=abc&state=${VICTIMA}.0000000000000000.%2F`);
    expect(await res.text()).toContain("Link de conexión inválido");
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("sesión de la misma org: sigue al canje del code", async () => {
    m.session = sesionDe(VICTIMA);
    await callback(`code=abc&state=${stateDe(VICTIMA)}`);
    expect(fetchSimulado).toHaveBeenCalled();
  });

  it("la página de error no ejecuta lo que venga en la URL", async () => {
    const res = await callback(`error=${encodeURIComponent("<script>alert(1)</script>")}&error_description=${encodeURIComponent("<img src=x onerror=alert(1)>")}`);
    const html = await res.text();
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });
});
