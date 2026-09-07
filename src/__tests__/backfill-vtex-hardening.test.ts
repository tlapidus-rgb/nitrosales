import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ORDER_STATUS_TODOS,
  esOrderStatusValido,
  ORDER_STATUS_CONCRETED,
  ORDER_STATUS_NOT_CONCRETED,
} from "@/domains/orders";

// ══════════════════════════════════════════════════════════════════════════
// R-C02 — /api/backfill/vtex tenia inyeccion SQL, IDOR y credenciales
// compartidas entre invocaciones
// ══════════════════════════════════════════════════════════════════════════
// Cuatro problemas en el mismo archivo:
//   1. `newStatus` y `orderId` salian crudos de la querystring y se
//      interpolaban en `$executeRawUnsafe`. Un valor que cerrara la comilla
//      alcanzaba la tabla `orders` ENTERA, de todos los tenants; la variante
//      action=delete llegaba a un DELETE.
//   2. `getVtexConfig(?org=)` cargaba las credenciales VTEX de la org pedida
//      SIN verificar que la sesion perteneciera a esa organizacion.
//   3. Las credenciales vivian en variables de MODULO, compartidas entre
//      invocaciones concurrentes de la misma instancia (Fluid Compute).
//   4. `ORG_ID` de modulo quedaba en "" para catalog/inventory/orders, que
//      escribian con organizationId = ''.
//
// Y uno que la auditoria no habia visto: `VTEX_BASE` era un `const` de MODULO
// calculado al importar, cuando VTEX_ACCOUNT valia "". Quedaba fijo en
// "https://.vtexcommercestable.com.br", asi que esas tres fases le pegaban a un
// host invalido y NO PODIAN FUNCIONAR. Eso es lo unico que evito que el (4)
// ensuciara la base — y por eso arreglar solo el host habria resucitado codigo
// muerto que escribe con org vacia.
// ══════════════════════════════════════════════════════════════════════════

const RUTA = "src/app/api/backfill/vtex/route.ts";

/** El fuente sin comentarios: un comentario que menciona algo no cuenta. */
function fuente(p = RUTA): string {
  return readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("R-C02 — no queda una sola interpolacion en SQL crudo", () => {
  const src = fuente();

  it("ningun executeRawUnsafe/queryRawUnsafe interpola una variable", () => {
    // Version anterior: matcheaba /RawUnsafe[sS]*?)/ y buscaba ${ adentro. Se
    // la burlaba de dos formas triviales, las dos senaladas en la revision del
    // 2026-09-06: el non-greedy cortaba en el PRIMER parentesis (un
    // `SELECT COUNT(*) ... '${id}'` quedaba fuera del match), y solo miraba
    // template literals, asi que RawUnsafe("DELETE ... " + orderId) pasaba limpio.
    //
    // Ahora se lee el PRIMER ARGUMENTO de cada llamada: tiene que ser un
    // template literal sin ${}. Cualquier otra cosa se reporta.
    const sospechosas: string[] = [];
    let desde = 0;
    let encontradas = 0;
    for (;;) {
      const i = src.indexOf("RawUnsafe(", desde);
      if (i < 0) break;
      encontradas++;
      let j = i + "RawUnsafe(".length;
      while (j < src.length && src[j].trim() === "") j++;
      if (src[j] !== "`") {
        sospechosas.push(`arg no es template literal: ${src.slice(i, i + 90)}`);
      } else {
        const fin = src.indexOf("`", j + 1);
        const sql = src.slice(j + 1, fin < 0 ? src.length : fin);
        if (sql.includes("${")) sospechosas.push(`interpola: ${sql.slice(0, 90)}`);
      }
      desde = i + 1;
    }
    expect(encontradas).toBeGreaterThan(0);
    expect(sospechosas).toEqual([]);
  });

  it("EL BUG: ya no se arma el UPDATE de status pegando el valor", () => {
    expect(src).not.toContain("status = '${");
    expect(src).not.toContain(`"externalId" = '\${`);
    expect(src).not.toContain(`"organizationId" = '\${`);
  });

  it("los DELETE tampoco pegan el id", () => {
    expect(src).not.toMatch(/DELETE FROM orders WHERE id = '\$\{/);
    expect(src).not.toMatch(/DELETE FROM order_items WHERE "orderId" = '\$\{/);
  });
});

describe("R-C02 — las credenciales ya no viven en el modulo", () => {
  const src = fuente();

  it("no hay variables de modulo con la cuenta ni las claves VTEX", () => {
    // Sin anclar a `^let`: var, doble espacio o const pasaban igual.
    expect(src).not.toMatch(/(?:let|var|const)s+VTEX_(?:ACCOUNT|KEY|TOKEN)/);
    expect(src).not.toMatch(/(?:let|var|const)s+ORG_ID/);
  });

  it("VTEX_BASE ya no es un const de modulo: la base se arma por request", () => {
    // Era el bug que dejaba el host en "https://.vtexcommercestable.com.br".
    expect(src).not.toMatch(/^const VTEX_BASE/m);
    expect(src).toContain("function vtexBase(ctx: VtexCtx)");
  });

  it("el contexto viaja explicito por parametro", () => {
    expect(src).toContain("type VtexCtx");
    for (const fn of [
      "async function vtexFetch(ctx: VtexCtx",
      "async function phaseCatalog(ctx: VtexCtx",
      "async function phaseInventory(ctx: VtexCtx",
      "async function phaseOrders(ctx: VtexCtx",
      "async function saveOrder(ctx: VtexCtx",
    ]) {
      expect(src).toContain(fn);
    }
  });
});

describe("R-C02 — el endpoint es staff-only", () => {
  const src = fuente();

  it("exige sesion de staff", () => {
    expect(src).toContain("isInternalUser");
  });

  it("opera sobre UNA sola org, no mezcla la sesion con el ?org=", () => {
    // Antes el SQL se scopeaba por la org de la SESION mientras las
    // credenciales VTEX salian del ?org=. Para un staff con View-as-Org eso
    // consultaba la base de una organizacion con las credenciales de otra.
    expect(src.match(/^s*ORG_ID,s*$/gm) ?? []).toEqual([]);
    expect(src).toContain("ctx.orgId");
  });

  // El comportamiento real —401 sin sesion, 404 con org inexistente, 400 con
  // fase invalida, y que en ninguno de esos casos se lleguen a desencriptar
  // credenciales— se verifica EJECUTANDO el handler, en
  // backfill-vtex-auth.test.ts. Comparar indices de strings, como hacia la
  // version anterior de este bloque, no distingue un if real de uno muerto.
});

describe("R-C02 — allowlist de OrderStatus", () => {
  it("cubre exactamente el enum del schema de Prisma", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const bloque = schema.match(/enum OrderStatus \{([^}]*)\}/);
    expect(bloque).not.toBeNull();
    const delSchema = bloque![1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//"));
    expect([...ORDER_STATUS_TODOS].sort()).toEqual(delSchema.sort());
  });

  it("se arma de las dos listas que ya existian, no es una copia a mano", () => {
    // Si fuera una tercera copia se desincronizaria en silencio, que es
    // justo lo que hace que una allowlist deje de servir.
    expect(ORDER_STATUS_TODOS.length).toBe(
      ORDER_STATUS_CONCRETED.length + ORDER_STATUS_NOT_CONCRETED.length,
    );
  });

  it("acepta los validos y rechaza todo lo demas", () => {
    for (const v of ORDER_STATUS_TODOS) expect(esOrderStatusValido(v)).toBe(true);
    for (const v of [
      "",
      "delivered",
      "DELIVERED'; DROP TABLE orders; --",
      "PENDING' OR '1'='1",
      "APPROVED ",
    ]) {
      expect(esOrderStatusValido(v)).toBe(false);
    }
  });

  it("el endpoint valida newStatus antes de tocar la base", () => {
    const src = fuente();
    expect(src).toContain("esOrderStatusValido(newStatus)");
    expect(src.indexOf("esOrderStatusValido(newStatus)")).toBeLessThan(
      src.indexOf(`UPDATE orders SET status = $1::"OrderStatus", "updatedAt" = NOW()`),
    );
  });
});
