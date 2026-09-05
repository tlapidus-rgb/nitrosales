import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isValidAdminKey } from "@/lib/admin-key";

// ══════════════════════════════════════════════════════════════════════════
// R-C01 / R-C04 — puertas traseras y fail-open en endpoints admin y de cron
// ══════════════════════════════════════════════════════════════════════════
// Tres endpoints validaban así:
//
//     if (key !== process.env.ADMIN_SECRET && key !== "usage-2026") { 401 }
//
// El `&&` con un literal vuelve el control decorativo: la contraseña está en el
// código, ninguno de los tres pasa por el gate del middleware, y quedan
// accesibles desde internet sin sesión.
//
// Lo que desbloqueaban:
//   · `/api/admin/usage`      → telemetría de Aurum de TODAS las organizaciones,
//                               incluido el ranking de uso por cliente.
//   · `/api/admin/reconcile`  → relink de órdenes de un cliente ajeno vía `?org=`.
//   · `/api/admin/reattribute`→ reescribir la atribución de TODOS los clientes en
//                               un loop secuencial. La atribución decide qué canal
//                               se lleva el crédito de cada venta y cuánta comisión
//                               cobra cada creador de Aura: mueve plata.
//
// Y `/api/cron/ml-sync` era fail-OPEN: `if (cronSecret && ...)` significa que sin
// la variable seteada el chequeo no corre y el endpoint queda público.
// ══════════════════════════════════════════════════════════════════════════

const RAIZ = process.cwd();
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");

/**
 * Código sin comentarios.
 *
 * Necesario porque los comentarios de estos archivos **citan textualmente la
 * comparación vieja** para explicar qué se arregló y por qué. Sin esto, un test
 * de "no debe aparecer el patrón X" falla por la explicación de X — y la salida
 * obvia sería borrar la explicación, que es justo lo que no queremos.
 */
const sinComentarios = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const CON_BACKDOOR = [
  ["usage", ["src", "app", "api", "admin", "usage", "route.ts"]],
  ["reconcile", ["src", "app", "api", "admin", "reconcile", "route.ts"]],
  ["reattribute", ["src", "app", "api", "admin", "reattribute", "route.ts"]],
] as const;

describe("R-C01 — no quedan contraseñas hardcodeadas en los endpoints admin", () => {
  for (const [nombre, ruta] of CON_BACKDOOR) {
    it(`admin/${nombre} valida con isValidAdminKey, no con un literal`, () => {
      const codigo = sinComentarios(leer(...ruta));
      expect(codigo).toContain("isValidAdminKey(key)");
      // El literal sigue citado en el comentario que explica el bug; lo que no
      // puede volver es la COMPARACIÓN, y por eso se mira el código sin comentarios.
      expect(codigo).not.toMatch(/key !== ["']usage-2026["']/);
      expect(codigo).not.toMatch(/key !== ["']reattribute-2026["']/);
    });
  }

  it("`isValidAdminKey` es fail-closed: sin variable seteada no acepta nada", () => {
    // El helper cae a un valor aleatorio por proceso cuando ADMIN_API_KEY no está,
    // así que ninguna key entrante puede matchear. Es la propiedad que hace que
    // migrar a él sea seguro.
    expect(isValidAdminKey("")).toBe(false);
    expect(isValidAdminKey(null)).toBe(false);
    expect(isValidAdminKey(undefined)).toBe(false);
    expect(isValidAdminKey("usage-2026")).toBe(false);
    expect(isValidAdminKey("reattribute-2026")).toBe(false);
  });
});

describe("R-C01 — `reattribute` no puede reescribir todas las organizaciones de una", () => {
  const src = leer("src", "app", "api", "admin", "reattribute", "route.ts");

  it("exige `org` explícito", () => {
    expect(src).toContain("if (!org) {");
    expect(src).toContain("where: { organizationId: org }");
  });

  it("tiene un tope por invocación", () => {
    // Sin tope, un POST recorre toda la historia de atribuciones en un loop
    // secuencial: con la org grande son cientos de miles de llamadas y satura la
    // base mientras corre, tumbando el dashboard de todos los clientes.
    expect(src).toContain("take: MAX_PER_CALL");
  });
});

describe("R-C04 — `cron/ml-sync` es fail-closed", () => {
  const src = leer("src", "app", "api", "cron", "ml-sync", "route.ts");

  it("sin CRON_SECRET no corre, en vez de quedar abierto", () => {
    expect(src).toContain("if (!cronSecret) {");
    // El patrón fail-open no debe volver (sin comentarios: la explicación lo cita).
    expect(sinComentarios(src)).not.toMatch(/if \(cronSecret && authHeader !==/);
  });
});

describe("endpoints públicos que se sacaron de producción", () => {
  it("`/api/debug/meta` ya no existe", () => {
    // Era público, sin autenticación, y devolvía conteos de órdenes, clientes y
    // productos de TODOS los tenants más 3 order items reales con su producto.
    expect(
      existsSync(join(RAIZ, "src", "app", "api", "debug", "meta", "route.ts"))
    ).toBe(false);
  });
});
