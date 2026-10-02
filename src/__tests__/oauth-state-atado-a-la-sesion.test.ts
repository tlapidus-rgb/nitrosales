import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ══════════════════════════════════════════════════════════════════════════
// OAuth de Meta y Google Ads: el `state` no alcanza, mandan la cookie y la sesión
// ══════════════════════════════════════════════════════════════════════════
// El callback guarda los tokens en la conexión de la organización que dice el
// `state`. Antes: el inicio firmaba un `state` para cualquier `?orgId=` sin
// sesión, la firma usa un secreto filtrado, el `state` era siempre el mismo por
// org (CSRF de vinculación con el `code` de otro), `returnTo` iba a cualquier
// dominio y las páginas de error mostraban la URL sin escapar (XSS). Ver
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

import { armarState, COOKIE_NONCE, destinoSeguro, escaparHtml, leerCookie, leerState, nuevoNonce } from "@/lib/oauth-state";
import * as googleInicio from "@/app/api/auth/google-ads/route";
import * as googleCallback from "@/app/api/auth/google-ads/callback/route";
import * as metaInicio from "@/app/api/oauth/meta/start/route";
import * as metaCallback from "@/app/api/oauth/meta/callback/route";

const MIA = "ckorgmia0000000000000001";
const VICTIMA = "ckorgvictima000000000001";
const NONCE = "0123456789abcdef0123456789abcdef";
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
  it("destinoSeguro sólo deja caminos de esta app que no sean de la API", () => {
    expect(destinoSeguro("/settings/integraciones?x=1")).toBe("/settings/integraciones?x=1");
    for (const malo of [
      "https://evil.example/x", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null,
      "/\t/evil.example", "/\r\n/evil.example", "/api/oauth/meta/callback?code=viejo", "/api",
    ]) {
      expect(destinoSeguro(malo as any), JSON.stringify(malo)).toBe("/settings/integraciones");
    }
  });

  it("leerState valida firma, forma del orgId y nonce de la cookie", () => {
    const st = armarState(VICTIMA, NONCE, "/onboarding")!;
    expect(leerState(st, NONCE)).toEqual({ orgId: VICTIMA, returnTo: "/onboarding" });
    const [org, , nonce, ...resto] = st.split(".");
    expect(leerState(`${org}.0000000000000000.${nonce}.${resto.join(".")}`, NONCE)).toBeNull();
    expect(leerState(`x'"><script>.${st.split(".")[1]}.${nonce}.%2F`, NONCE)).toBeNull();
  });

  it("el nonce de la cookie tiene que ser el del state", () => {
    const st = armarState(VICTIMA, NONCE, "/")!;
    expect(leerState(st, null)).toBeNull();
    expect(leerState(st, nuevoNonce())).toBeNull();
    // Cambiar el nonce del state por el de la cookie rompe la firma.
    const otro = nuevoNonce();
    const [org, f, , ...resto] = st.split(".");
    expect(leerState([org, f, otro, ...resto].join("."), otro)).toBeNull();
  });

  it("sin NEXTAUTH_SECRET no firma ni acepta nada (no hay secreto de repuesto)", () => {
    const st = armarState(VICTIMA, NONCE, "/")!;
    const antes = process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    try {
      expect(armarState(VICTIMA, NONCE, "/")).toBeNull();
      expect(leerState(st, NONCE)).toBeNull();
    } finally {
      process.env.NEXTAUTH_SECRET = antes;
    }
  });

  it("un state armado con returnTo a otro dominio vuelve a la app", () => {
    const [org, f, nonce] = armarState(VICTIMA, NONCE, "/")!.split(".");
    expect(leerState(`${org}.${f}.${nonce}.${encodeURIComponent("https://evil.example")}`, NONCE, "/onboarding")?.returnTo).toBe("/onboarding");
  });

  it("escaparHtml y leerCookie", () => {
    expect(escaparHtml(`<script>"'&`)).toBe("&lt;script&gt;&quot;&#39;&amp;");
    const req = new Request("http://local/", { headers: { cookie: `a=1; ${COOKIE_NONCE.meta}=${NONCE}; b=2` } });
    expect(leerCookie(req, COOKIE_NONCE.meta)).toBe(NONCE);
    expect(leerCookie(req, COOKIE_NONCE.google)).toBeNull();
  });
});

describe.each([
  ["Google Ads", googleInicio, "/api/auth/google-ads", COOKIE_NONCE.google],
  ["Meta", metaInicio, "/api/oauth/meta/start", COOKIE_NONCE.meta],
])("inicio de %s", (_n, ruta, camino, cookie) => {
  it("EL CASO: sin sesión, ?orgId= de otro no arranca nada", async () => {
    const res = await ruta.GET(new Request(`http://local${camino}?orgId=${VICTIMA}`));
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });

  it("con sesión: la org es la de la sesión, y el nonce del state queda en una cookie httpOnly", async () => {
    m.session = sesionDe(MIA);
    const res = await ruta.GET(new Request(`http://local${camino}?orgId=${VICTIMA}`));
    const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
    expect(state.startsWith(`${MIA}.`)).toBe(true);
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain(`${cookie}=${state.split(".")[2]}`);
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("cada inicio usa un nonce distinto", async () => {
    m.session = sesionDe(MIA);
    const s1 = new URL((await ruta.GET(new Request(`http://local${camino}`))).headers.get("location")!).searchParams.get("state")!;
    const s2 = new URL((await ruta.GET(new Request(`http://local${camino}`))).headers.get("location")!).searchParams.get("state")!;
    expect(s1).not.toBe(s2);
  });

  it("no toma como destino una URL de la API que llega por Referer", async () => {
    m.session = sesionDe(MIA);
    const res = await ruta.GET(new Request(`http://local${camino}`, { headers: { referer: "http://local/api/oauth/meta/callback?code=viejo" } }));
    const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
    expect(decodeURIComponent(state.split(".").slice(3).join("."))).toBe("/settings/integraciones");
  });
});

describe.each([
  ["Google Ads", googleCallback, "/api/auth/google-ads/callback", COOKIE_NONCE.google],
  ["Meta", metaCallback, "/api/oauth/meta/callback", COOKIE_NONCE.meta],
])("callback de %s", (_n, ruta, camino, cookie) => {
  const callback = (q: string, nonce: string | null = NONCE) =>
    ruta.GET(new Request(`http://local${camino}?${q}`, nonce ? { headers: { cookie: `${cookie}=${nonce}` } } : undefined));
  const stateDe = (org: string) => encodeURIComponent(armarState(org, NONCE, "/onboarding")!);

  it("EL CASO: un state válido de otra org con la sesión mía no toca nada", async () => {
    m.session = sesionDe(MIA);
    const res = await callback(`code=abc&state=${stateDe(VICTIMA)}`);
    expect(await res.text()).toContain("Sesión de otra cuenta");
    expect(fetchSimulado).not.toHaveBeenCalled();
    expect(m.escrituras).toEqual([]);
  });

  it("EL CASO (CSRF): con la sesión correcta pero sin la cookie del inicio, no canjea el code", async () => {
    m.session = sesionDe(VICTIMA);
    const res = await callback(`code=del-atacante&state=${stateDe(VICTIMA)}`, null);
    expect(await res.text()).toContain("Link de conexión inválido");
    expect(fetchSimulado).not.toHaveBeenCalled();
    expect(m.escrituras).toEqual([]);
  });

  it("con la cookie de otro inicio, tampoco", async () => {
    m.session = sesionDe(VICTIMA);
    await callback(`code=abc&state=${stateDe(VICTIMA)}`, nuevoNonce());
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("sin sesión: no sigue, y lo dice", async () => {
    const res = await callback(`code=abc&state=${stateDe(VICTIMA)}`);
    expect(await res.text()).toContain("Tu sesión no está activa");
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("firma que no coincide: no sigue", async () => {
    m.session = sesionDe(VICTIMA);
    const res = await callback(`code=abc&state=${VICTIMA}.0000000000000000.${NONCE}.%2F`);
    expect(await res.text()).toContain("Link de conexión inválido");
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("sesión de la misma org y cookie del inicio: sigue al canje del code", async () => {
    m.session = sesionDe(VICTIMA);
    await callback(`code=abc&state=${stateDe(VICTIMA)}`);
    expect(fetchSimulado).toHaveBeenCalled();
  });

  it("si el canje falla, Reintentar vuelve al inicio con el destino original (no al callback)", async () => {
    m.session = sesionDe(VICTIMA);
    const html = await (await callback(`code=abc&state=${stateDe(VICTIMA)}`)).text();
    expect(html).toContain("returnTo=%2Fonboarding");
  });

  it("la página de error no ejecuta lo que venga en la URL", async () => {
    const res = await callback(`error=${encodeURIComponent("<script>alert(1)</script>")}&error_description=${encodeURIComponent("<img src=x onerror=alert(1)>")}`);
    const html = await res.text();
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });
});
