import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { PAGE_SECTION_PREFIXES } from "@/lib/section-access";

// ══════════════════════════════════════════════════════════════════════════
// Un gate escrito y desconectado no protege nada
// ══════════════════════════════════════════════════════════════════════════
// Dos hallazgos de la revisión del 2026-09-07, los dos de la misma familia:
// existía el control, existía la intención escrita en un comentario, y no había
// nada que verificara que estuviera enchufado.
//
//   1. `/products`, `/rentabilidad` y `/pixel/canales` estaban mapeados a su
//      sección en `PAGE_SECTION_PREFIXES` pero NO en el `matcher` del
//      middleware, así que el middleware ni los evaluaba. Un usuario solo-pixel
//      podía escribir `/rentabilidad` en la barra y ver el P&L — justo el caso
//      que el comentario del código dice que el gate viene a cubrir.
//
//   2. `/api/admin/migrate-aura-dedup-indexes` no tenía NINGUNA autenticación:
//      un POST anónimo desde internet corría DDL sobre producción. El modelo
//      "cada handler valida lo suyo" no lo verificaba nadie.
//
// Estos dos casos barren el árbol en vez de mirar una lista escrita a mano, así
// que valen también para el código que todavía no existe.
//
// ── LO QUE ESTE ARCHIVO NO PROBABA ───────────────────────────────────────
// La comparación `matcher` vs `PAGE_SECTION_PREFIXES` lee el fuente y no
// ejecuta nada. La auditoría del 2026-09-07 mostró que con un
// `return NextResponse.next()` como primera línea del middleware —RBAC
// apagado, read-only de impersonate apagado, gate staff-only apagado— los 21
// casos seguían en verde. Lo único que garantizaban era que dos listas de
// strings coincidieran, que es el bug que motivó el archivo, pero el título
// prometía más.
//
// El último bloque cierra eso: ejecuta el middleware con un token de un
// usuario solo-pixel y verifica que las tres rutas del hallazgo lo frenen de
// verdad.
// ══════════════════════════════════════════════════════════════════════════

const MIDDLEWARE = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");

/** Los prefijos declarados en el `matcher`, ya sin el sufijo `/:path*`. */
function prefijosDelMatcher(): string[] {
  const bloque = MIDDLEWARE.slice(MIDDLEWARE.indexOf("matcher: ["));
  return [...bloque.matchAll(/"(\/[^"]*)"/g)]
    .map((m) => m[1].replace(/\/:path\*$/, "").replace(/\/:path$/, ""))
    .filter(Boolean);
}

describe("todo gate de página tiene que estar en el matcher", () => {
  const delMatcher = prefijosDelMatcher();

  it("el matcher se pudo leer (si esto falla, cambió el formato)", () => {
    expect(delMatcher.length).toBeGreaterThan(10);
    expect(delMatcher).toContain("/dashboard");
  });

  it.each(PAGE_SECTION_PREFIXES.map((p) => p.prefix))(
    "%s está cubierto por el matcher",
    (prefijo) => {
      // Cubierto = el matcher lo lista, o lista un ancestro suyo.
      // `/pixel/canales` lo cubre `/pixel`.
      const cubierto = delMatcher.some(
        (m) => prefijo === m || prefijo.startsWith(m + "/"),
      );
      expect(cubierto).toBe(true);
    },
  );
});

// ── Toda ruta bajo /api/admin tiene que autenticar de alguna forma ────────
const RAIZ_ADMIN = "src/app/api/admin";

function rutas(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) rutas(rel, out);
    else if (e.name === "route.ts") out.push(rel);
  }
  return out;
}

/** Las formas de autenticar que existen hoy en el repo. */
const SEÑALES_DE_AUTH = [
  "isValidAdminKey",
  "isInternalUser",
  "getServerSession",
  "requirePermission",
  "getOrganizationId",
  "getOrganization",
  "NEXTAUTH_SECRET",
  "ADMIN_API_KEY",
];

const RUTAS_ADMIN = rutas(RAIZ_ADMIN);

describe("ninguna ruta admin queda sin autenticación", () => {
  it("hay rutas para revisar (si esto falla, el barrido se rompió)", () => {
    expect(RUTAS_ADMIN.length).toBeGreaterThan(100);
  });

  it("todas tienen alguna forma de auth", () => {
    // El middleware NO las cubre cuando no hay sesión (sólo gatea `if (token)`),
    // así que cada handler tiene que valerse por sí mismo. Esto es lo que
    // habría cazado el POST anónimo que corría DDL.
    const sinAuth = RUTAS_ADMIN.filter((p) => {
      const src = readFileSync(join(process.cwd(), p), "utf8")
        .replace(/^\s*\/\*[\s\S]*?\*\//gm, "")
        .replace(/^\s*\/\/.*$/gm, "");
      return !SEÑALES_DE_AUTH.some((s) => src.includes(s));
    });
    expect(sinAuth).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Y el gate, ejecutado
// ══════════════════════════════════════════════════════════════════════════
// Lo de arriba prueba que el `matcher` y `PAGE_SECTION_PREFIXES` no se
// desincronicen, que es barato y es el bug real que pasó. Esto prueba la
// consecuencia: que un usuario solo-pixel no vea el P&L.

const getToken = vi.fn();
vi.mock("next-auth/jwt", () => ({ getToken: (...a: unknown[]) => getToken(...a) }));

const { default: middleware } = await import("@/middleware");

function pedido(pathname: string) {
  return {
    nextUrl: { pathname, clone: () => new URL(`https://app.nitrosales.ai${pathname}`) },
    method: "GET",
    url: `https://app.nitrosales.ai${pathname}`,
    headers: new Headers(),
    cookies: { get: () => undefined },
  } as never;
}

describe("un usuario solo-pixel no entra a las secciones que no le tocan", () => {
  // El caso de TeVeCompras, que es el que el comentario de section-access.ts
  // dice que el gate viene a cubrir: se le entrega una org con acceso
  // restringido y tiene que quedar restringida de verdad.
  beforeEach(() =>
    getToken.mockResolvedValue({
      isStaff: false,
      email: "cliente@tevecompras.com",
      allowedSections: ["pixel"],
      writableSections: [],
    }),
  );

  it.each(["/products", "/rentabilidad", "/finanzas"])(
    "%s lo manda a /unauthorized",
    async (ruta) => {
      const r = await middleware(pedido(ruta));
      // Redirect (307/308) a /unauthorized, no un `next()`.
      expect(r.headers.get("location")).toContain("/unauthorized");
    },
  );

  it("/pixel sí lo deja pasar: es la sección que tiene", async () => {
    const r = await middleware(pedido("/pixel"));
    expect(r.headers.get("location")).toBeNull();
  });

  it("una API de una sección ajena devuelve 403, no un redirect", async () => {
    // Las APIs que alimentan el dashboard compartido (`/api/metrics/orders`,
    // `/api/metrics/pixel`…) NO se gatean a propósito; las de una sección
    // restringida sí.
    expect((await middleware(pedido("/api/finanzas/pnl"))).status).toBe(403);
  });

  it("y una API del dashboard compartido NO se bloquea", async () => {
    // El otro lado del filo: si esto se gateara, un cliente solo-pixel se
    // quedaría sin el dashboard que sí le corresponde.
    expect((await middleware(pedido("/api/metrics/orders"))).status).not.toBe(403);
  });
});

describe("el staff sigue entrando a todo", () => {
  beforeEach(() =>
    getToken.mockResolvedValue({ isStaff: true, email: "tomy@99media.com.ar" }),
  );

  it.each(["/products", "/rentabilidad", "/finanzas", "/control"])(
    "%s pasa",
    async (ruta) => {
      expect((await middleware(pedido(ruta))).headers.get("location")).toBeNull();
    },
  );
});
