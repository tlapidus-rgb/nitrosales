import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

// ══════════════════════════════════════════════════════════════════════════
// La clave del webhook de inventory de VTEX
// ══════════════════════════════════════════════════════════════════════════
// `/api/webhooks/vtex/inventory` se autentica con `?key=<NEXTAUTH_SECRET>`,
// igual que el de órdenes. Es una URL que vive pegada del lado de VTEX, así que
// el comportamiento con la env de siempre NO puede cambiar: misma clave
// aceptada, mismo 401 con el mismo cuerpo para todo lo demás.
//
// Lo que sí cambia, y es el motivo del cambio:
//
//   · durante una ventana de rotación (`NEXTAUTH_SECRET_ANTERIOR` seteada) la
//     clave vieja también entra — si no, el día que se rote, este webhook se
//     cae aunque el de órdenes siga andando;
//   · con `NEXTAUTH_SECRET=""` ya no entra cualquiera: el `!==` viejo aceptaba
//     una key vacía porque `"" === ""`.
//
// Se prueba llamando a los handlers de verdad (no a la función de la clave por
// separado): lo que importa es qué responde la ruta, no qué devuelve el helper.
// La base está mockeada; con la clave correcta el POST llega hasta buscar la
// conexión VTEX (y da 404 porque el mock no devuelve ninguna), que es la señal
// de que pasó la autenticación.
// ══════════════════════════════════════════════════════════════════════════

const db = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    connection: { findFirst: db.findFirst, findMany: db.findMany },
  },
}));

import { GET, POST } from "@/app/api/webhooks/vtex/inventory/route";

// Valores de prueba, no secretos reales.
const ACTUAL = "clave-de-prueba-actual-aaaaaaaaaaaaaaaa";
const VIEJA = "clave-de-prueba-vieja-bbbbbbbbbbbbbbbbb";

const BASE = "https://test.invalid/api/webhooks/vtex/inventory";

function urlCon(key: string | undefined, extra = ""): string {
  if (key === undefined) return `${BASE}${extra ? `?${extra}` : ""}`;
  return `${BASE}?key=${encodeURIComponent(key)}${extra ? `&${extra}` : ""}`;
}

function get(key: string | undefined) {
  return GET(new NextRequest(urlCon(key)));
}

function post(key: string | undefined) {
  // `?org=` para que, si pasa la clave, vaya por `findFirst` (camino multi-tenant).
  return POST(
    new NextRequest(urlCon(key, "org=org-prueba"), {
      method: "POST",
      body: JSON.stringify({ IdSku: "1", StockModified: true }),
      headers: { "content-type": "application/json" },
    }),
  );
}

async function esperar401(res: Response) {
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "Unauthorized" });
}

const envOriginal = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
  db.findFirst.mockResolvedValue(null);
  db.findMany.mockResolvedValue([]);
  vi.spyOn(console, "log").mockImplementation(() => {});
  process.env.NEXTAUTH_SECRET = ACTUAL;
  delete (process.env as any).NEXTAUTH_SECRET_ANTERIOR;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...envOriginal };
});

describe("sin ventana de rotación — lo mismo que respondía antes", () => {
  it("GET con la clave correcta responde 200", async () => {
    const res = await get(ACTUAL);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, webhook: "vtex-inventory" });
  });

  it("POST con la clave correcta pasa la autenticación y llega a buscar la conexión", async () => {
    const res = await post(ACTUAL);
    expect(db.findFirst).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
  });

  it("clave incorrecta: 401, y el POST no toca la base", async () => {
    await esperar401(await get(VIEJA));
    await esperar401(await post(VIEJA));
    expect(db.findFirst).not.toHaveBeenCalled();
    expect(db.findMany).not.toHaveBeenCalled();
  });

  it("una clave que es prefijo o extensión de la correcta: 401", async () => {
    await esperar401(await get(ACTUAL.slice(0, -1)));
    await esperar401(await get(`${ACTUAL}x`));
    await esperar401(await post(ACTUAL.slice(0, -1)));
  });

  it("`?key=` vacío: 401", async () => {
    await esperar401(await get(""));
    await esperar401(await post(""));
  });

  it("sin `?key`: 401", async () => {
    await esperar401(await get(undefined));
    await esperar401(await post(undefined));
    expect(db.findFirst).not.toHaveBeenCalled();
  });
});

describe("con la ventana de rotación abierta", () => {
  it("la clave ANTERIOR también entra, en GET y en POST", async () => {
    process.env.NEXTAUTH_SECRET_ANTERIOR = VIEJA;
    const resGet = await get(VIEJA);
    expect(resGet.status).toBe(200);
    const resPost = await post(VIEJA);
    expect(resPost.status).toBe(404);
    expect(db.findFirst).toHaveBeenCalledTimes(1);
  });

  it("la actual sigue entrando", async () => {
    process.env.NEXTAUTH_SECRET_ANTERIOR = VIEJA;
    expect((await get(ACTUAL)).status).toBe(200);
  });

  it("cualquier otra sigue afuera", async () => {
    process.env.NEXTAUTH_SECRET_ANTERIOR = VIEJA;
    await esperar401(await get("otra-cosa"));
    await esperar401(await post("otra-cosa"));
  });

  it("al cerrar la ventana, la anterior deja de servir", async () => {
    process.env.NEXTAUTH_SECRET_ANTERIOR = VIEJA;
    expect((await get(VIEJA)).status).toBe(200);
    delete (process.env as any).NEXTAUTH_SECRET_ANTERIOR;
    await esperar401(await get(VIEJA));
  });

  it("una ANTERIOR vacía no abre la puerta a una key vacía", async () => {
    process.env.NEXTAUTH_SECRET_ANTERIOR = "";
    await esperar401(await get(""));
    await esperar401(await post(undefined));
  });
});

describe("fail-closed con el entorno mal configurado", () => {
  it("con NEXTAUTH_SECRET vacía, una key vacía o ausente NO entra", async () => {
    // El `!==` viejo aceptaba esto: `"" !== ""` es false.
    process.env.NEXTAUTH_SECRET = "";
    await esperar401(await get(""));
    await esperar401(await get(undefined));
    await esperar401(await post(undefined));
    expect(db.findFirst).not.toHaveBeenCalled();
  });

  it("sin NEXTAUTH_SECRET, nada entra", async () => {
    delete (process.env as any).NEXTAUTH_SECRET;
    await esperar401(await get(""));
    await esperar401(await get(ACTUAL));
  });
});

describe("el fuente usa el helper (red contra volver al `!==`)", () => {
  const fuente = readFileSync(
    join(process.cwd(), "src/app/api/webhooks/vtex/inventory/route.ts"),
    "utf8",
  );
  // Sin comentarios: el header del archivo explica el `!==` viejo en prosa, y
  // una aserción sobre el texto crudo podría satisfacerse (o romperse) con eso.
  const codigo = fuente
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

  it("importa `esClaveDeWebhookValida` desde @/lib/webhook-key", () => {
    expect(codigo).toMatch(
      /^import\s*\{[^}]*\besClaveDeWebhookValida\b[^}]*\}\s*from\s*"@\/lib\/webhook-key";/m,
    );
  });

  it("no compara NEXTAUTH_SECRET a mano en ningún lado", () => {
    expect(codigo).not.toMatch(/process\.env\.NEXTAUTH_SECRET/);
  });

  it("los dos handlers la llaman", () => {
    const llamadas = codigo.match(/esClaveDeWebhookValida\s*\(/g) ?? [];
    expect(llamadas).toHaveLength(2);
  });
});
