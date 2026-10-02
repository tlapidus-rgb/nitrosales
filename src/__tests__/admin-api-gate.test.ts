import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";

// ══════════════════════════════════════════════════════════════════════════
// HOTFIX 2026-10-01 — /api/admin/* ya NO se abre con `?key=` sola
// ══════════════════════════════════════════════════════════════════════════
// /api/me/vtex-affiliate-info le muestra a cualquier usuario logueado una URL
// con `?key=<NEXTAUTH_SECRET>`, y en prod ese valor == ADMIN_API_KEY. Con esa
// key, /api/admin/debug-vtex-raw-emails?orgId=X&key=Y devolvía nombre y email
// de compradores de CUALQUIER org, sin sesión. El middleware ahora exige sesión
// de staff en /api/admin/*, salvo la allowlist de automatización.
//
// Se testea el middleware REAL (src/middleware.ts) con getToken mockeado: el
// JWT de NextAuth es lo único que el middleware lee de la sesión.
// ══════════════════════════════════════════════════════════════════════════

const { getTokenMock } = vi.hoisted(() => ({ getTokenMock: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken: getTokenMock }));

import middleware from "@/middleware";
import {
  ADMIN_KEY_ALLOWLIST,
  ADMIN_SELF_GATED_ROUTES,
  checkAdminApiAccess,
} from "@/lib/admin-gate";

const BASE = "https://app.nitrosales.ai";
// Cualquier valor: el middleware no compara la key (eso lo hace la ruta).
// Que "la key correcta" no alcance es justamente lo que se testea.
const KEY = "la-key-filtrada";
const SENSITIVE = `/api/admin/debug-vtex-raw-emails?orgId=cvictimasintetica000000001&key=${KEY}`;

const STAFF_TOKEN = { email: "staff@nitrosales.ai", isStaff: true };
const STAFF_BY_EMAIL_TOKEN = { email: "TLapidus@99media.com.ar", isStaff: false };
const CLIENT_TOKEN = {
  email: "cliente@tienda.com",
  isStaff: false,
  allowedSections: ["pixel"],
  writableSections: ["pixel"],
};

function req(path: string, method = "GET"): NextRequest {
  return new NextRequest(`${BASE}${path}`, { method });
}

/** El pedido sigue hacia la ruta (NextResponse.next()). */
function passed(res: Response): boolean {
  return res.headers.get("x-middleware-next") === "1";
}

/** La misma ruta sensible, sin la clave: así la usa el staff con su sesión. */
const SENSITIVE_SIN_CLAVE = "/api/admin/debug-vtex-raw-emails?orgId=cvictimasintetica000000001";

describe("middleware — fuera de la allowlist, un pedido con ?key= se rechaza", () => {
  // El middleware no puede consultar la base: confía en el isStaff del JWT, y
  // con NEXTAUTH_SECRET filtrado ese JWT se puede fabricar. Si la ruta además
  // viera la clave (que el atacante también tiene), aceptaría
  // `key === ADMIN_API_KEY` sin mirar la sesión. Una primera versión
  // reescribía la URL sin la clave; ~105 rutas leen `new URL(req.url)` y no
  // está garantizado que un rewrite cambie `req.url`. Rechazar no depende de eso.
  it("EL CASO: staff (o un JWT fabricado) con ?key= → 403, no llega a la ruta", async () => {
    getTokenMock.mockResolvedValue(STAFF_TOKEN);
    const res = await middleware(req(SENSITIVE));
    expect(passed(res)).toBe(false);
    expect(res.status).toBe(403);
    expect(res.headers.has("x-middleware-rewrite")).toBe(false);
  });

  it.each(["%6Bey", "key=x&key", "KEY_NO&key"])("variantes de la clave también se rechazan: %s", async (k) => {
    getTokenMock.mockResolvedValue(STAFF_TOKEN);
    const res = await middleware(req(`${SENSITIVE_SIN_CLAVE}&${k}=${KEY}`));
    expect(res.status).toBe(403);
  });

  it("staff sin key → pasa", async () => {
    getTokenMock.mockResolvedValue(STAFF_TOKEN);
    expect(passed(await middleware(req(SENSITIVE_SIN_CLAVE)))).toBe(true);
  });

  it.each([
    "/api/admin/trigger-vtex-sync-x",
    "/api/admin/trigger-vtex-sync/algo",
  ])("%s con clave y staff exige coincidencia exacta: 403", async (path) => {
    getTokenMock.mockResolvedValue(STAFF_TOKEN);
    const res = await middleware(req(`${path}?key=${KEY}`));
    expect(res.status).toBe(403);
    expect(passed(res)).toBe(false);
    expect((await res.json()).error).toBe("La clave por URL no se acepta en esta ruta");
  });

  it("en la allowlist la clave SÍ pasa (la automatización la necesita)", async () => {
    getTokenMock.mockResolvedValue(null);
    expect(passed(await middleware(req(`${ADMIN_KEY_ALLOWLIST[0].path}?key=${KEY}`)))).toBe(true);
  });
});

describe("middleware — el rechazo de ?key= vale para CUALQUIER método, no sólo GET", () => {
  // Un JWT con isStaff:true se fabrica con el secreto filtrado. Si el 403 por
  // la clave mirara sólo GET, un POST con ?key= llegaría a una ruta de
  // escritura que acepta `key === ADMIN_API_KEY` sin mirar la sesión
  // (cleanup-duplicate-leads, por ejemplo, borra leads).
  const ESCRITURA = "/api/admin/cleanup-duplicate-leads";

  it.each(["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])(
    "%s de staff (o JWT fabricado) con ?key= fuera de la allowlist → 403 por la clave",
    async (method) => {
      getTokenMock.mockResolvedValue(STAFF_TOKEN);
      const res = await middleware(req(`${ESCRITURA}?key=${KEY}`, method));
      expect(passed(res)).toBe(false);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("La clave por URL no se acepta en esta ruta");
    },
  );

  it.each(["POST", "DELETE"])("%s de staff SIN clave → pasa (el 403 es por la clave, no por el método)", async (method) => {
    getTokenMock.mockResolvedValue(STAFF_TOKEN);
    expect(passed(await middleware(req(ESCRITURA, method)))).toBe(true);
  });
});

beforeEach(() => {
  getTokenMock.mockReset();
});

describe("middleware — /api/admin sensible con ?key= correcta", () => {
  it("SIN sesión → 401 (la key sola ya no alcanza)", async () => {
    getTokenMock.mockResolvedValue(null);
    const res = await middleware(req(SENSITIVE));
    expect(passed(res)).toBe(false);
    expect(res.status).toBe(401);
  });

  it("con sesión de CLIENTE (no staff) → 403", async () => {
    getTokenMock.mockResolvedValue(CLIENT_TOKEN);
    const res = await middleware(req(SENSITIVE));
    expect(passed(res)).toBe(false);
    expect(res.status).toBe(403);
  });

  it("con sesión de STAFF (users.isStaff), sin key → pasa", async () => {
    getTokenMock.mockResolvedValue(STAFF_TOKEN);
    const res = await middleware(req(SENSITIVE_SIN_CLAVE));
    expect(passed(res)).toBe(true);
  });

  it("con sesión de STAFF por allowlist de email (isStaffUser), sin key → pasa", async () => {
    getTokenMock.mockResolvedValue(STAFF_BY_EMAIL_TOKEN);
    const res = await middleware(req(SENSITIVE_SIN_CLAVE));
    expect(passed(res)).toBe(true);
  });

  it("aura-resend-onboarding (sin gate de rol propio) con sesión de cliente → 403", async () => {
    getTokenMock.mockResolvedValue(CLIENT_TOKEN);
    const res = await middleware(req("/api/admin/aura-resend-onboarding", "POST"));
    expect(res.status).toBe(403);
  });

  it("POST sin sesión a una ruta de escritura → 401", async () => {
    getTokenMock.mockResolvedValue(null);
    const res = await middleware(req(`/api/admin/orgs/x/wipe-account?key=${KEY}`, "POST"));
    expect(res.status).toBe(401);
  });

  it("si getToken falla, /api/admin falla CERRADO (401)", async () => {
    getTokenMock.mockRejectedValue(new Error("boom"));
    const res = await middleware(req(SENSITIVE));
    expect(res.status).toBe(401);
  });

  it("variantes de path (encoding, //, / final) NO esquivan el gate", async () => {
    getTokenMock.mockResolvedValue(null);
    for (const p of [
      `/api/admin/%64ebug-vtex-raw-emails?key=${KEY}`,
      `/api/%61dmin/debug-vtex-raw-emails?key=${KEY}`,
      `/api//admin//debug-vtex-raw-emails?key=${KEY}`,
      `/api/admin/debug-vtex-raw-emails/?key=${KEY}`,
      `/api/admin?key=${KEY}`,
    ]) {
      const res = await middleware(req(p));
      expect(res.status, p).toBe(401);
    }
  });
});

describe("middleware — allowlist de automatización (crons con ?key=, sin cookie)", () => {
  it.each(ADMIN_KEY_ALLOWLIST.map((r) => r.path))(
    "%s con ?key= y SIN sesión → pasa (la ruta valida la key, igual que hoy)",
    async (path) => {
      getTokenMock.mockResolvedValue(null);
      const res = await middleware(req(`${path}?orgId=cunaorgsintetica0000000001&key=${KEY}`));
      expect(passed(res)).toBe(true);
    },
  );

  it("la allowlist NO se extiende a sub-rutas ni a prefijos parecidos", () => {
    expect(checkAdminApiAccess("/api/admin/trigger-vtex-sync/x", null)).toBe("unauthenticated");
    expect(checkAdminApiAccess("/api/admin/trigger-vtex-sync-x", null)).toBe("unauthenticated");
    expect(checkAdminApiAccess("/api/admin/trigger-vtex-sync/../debug-vtex-raw-emails", null)).toBe(
      "unauthenticated",
    );
  });
});

describe("middleware — fuera de /api/admin nada cambia", () => {
  it("rutas de producto que viven bajo /api/admin y hacen su propio gate → pasan", async () => {
    getTokenMock.mockResolvedValue(CLIENT_TOKEN);
    for (const { path } of ADMIN_SELF_GATED_ROUTES) {
      const res = await middleware(req(path));
      expect(passed(res), path).toBe(true);
    }
  });

  it("una API no-admin sin sesión sigue pasando al endpoint", async () => {
    getTokenMock.mockResolvedValue(null);
    const res = await middleware(req("/api/metrics/orders"));
    expect(passed(res)).toBe(true);
  });

  it("si getToken falla fuera de /api/admin, sigue fail-open como antes", async () => {
    getTokenMock.mockRejectedValue(new Error("boom"));
    const res = await middleware(req("/api/metrics/orders"));
    expect(passed(res)).toBe(true);
  });
});

// ── GUARD: que la allowlist no quede incompleta ni apunte a rutas inexistentes ──
const SRC = join(process.cwd(), "src");
const ADMIN_DIR = join(SRC, "app/api/admin");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// Fuera de ADMIN_KEY_ALLOWLIST el middleware responde 403 a cualquier pedido
// con `?key=`, haya sesión o no. Así que todo código que arme una URL a
// /api/admin con `key=` tiene que apuntar a una ruta de la allowlist: si no,
// en producción es un 403. Antes había excepciones (links de mail al staff, el
// auto-continue de vtex-recover-customer-emails, /admin/usage) de cuando el
// middleware reescribía la URL; ahora van sin clave y con la sesión del staff.

describe("guard — inventario de llamadores automáticos a /api/admin con key=", () => {
  it("cada ruta de la allowlist existe", () => {
    for (const { path } of ADMIN_KEY_ALLOWLIST) {
      const file = join(SRC, "app", path, "route.ts");
      expect(existsSync(file), path).toBe(true);
    }
  });

  it("todo código en src/ que arma una URL /api/admin/...key= está clasificado", () => {
    const allow = new Set(ADMIN_KEY_ALLOWLIST.map((r) => r.path));
    const unclassified: string[] = [];
    for (const file of walk(SRC)) {
      if (file.includes("__tests__")) continue;
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*")) return; // comentarios/docs
        const m = t.match(/\/api\/admin\/[A-Za-z0-9_\-/]+/);
        if (!m) return;
        // la key puede ir en la misma línea o en las siguientes (template multilínea)
        const window = lines.slice(i, i + 6).join("\n");
        if (!/key=/.test(window)) return;
        const path = m[0].replace(/\/+$/, "");
        if (!allow.has(path)) {
          unclassified.push(`${relative(process.cwd(), file)}:${i + 1} → ${path}`);
        }
      });
    }
    expect(unclassified).toEqual([]);
  });

  it("las rutas self-gated de producto NO aceptan key (si no, deberían estar gateadas)", () => {
    for (const { path } of ADMIN_SELF_GATED_ROUTES) {
      const src = readFileSync(join(SRC, "app", path, "route.ts"), "utf8");
      expect(/searchParams\.get\(\s*["']key["']\s*\)|isValidAdminKey|ADMIN_API_KEY/.test(src), path).toBe(
        false,
      );
    }
  });

  it("existen rutas admin para revisar (sanity)", () => {
    expect(walk(ADMIN_DIR).length).toBeGreaterThan(100);
  });
});

describe("middleware — un orgId mal formado no llega a ninguna ruta", () => {
  // metrics/orders, metrics/pixel (CORE) y asset-stats pegan el orgId del
  // atajo de warm-cache en SQL crudo. Con la clave filtrada, era inyección SQL.
  it.each([
    "/api/metrics/orders?orgId=x'%20OR%20'1'='1&key=k",
    "/api/metrics/pixel?orgId=cmocep2vk000b1409iqylv7zg'--&key=k",
    "/api/nitropixel/asset-stats?orgId=ORG_MAYUS&key=k",
    "/api/metrics/orders?orgId=cmocep2vk000b1409iqylv7zg&orgId=malo;drop",
  ])("rechaza %s con 400", async (path) => {
    getTokenMock.mockResolvedValue(null);
    const res = await middleware(req(path));
    expect(res.status).toBe(400);
  });

  it("un orgId real (cuid) pasa", async () => {
    getTokenMock.mockResolvedValue(null);
    expect(passed(await middleware(req("/api/metrics/orders?orgId=cmocep2vk000b1409iqylv7zg&key=k")))).toBe(true);
  });

  it("sin orgId, nada cambia", async () => {
    getTokenMock.mockResolvedValue(null);
    expect(passed(await middleware(req("/api/metrics/orders?from=2026-09-01")))).toBe(true);
  });
});
