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

  it("ningun $executeRawUnsafe/$queryRawUnsafe interpola una variable", () => {
    // Se busca la forma peligrosa: un template con ${...} dentro de la llamada
    // a la variante Unsafe. Los tagged templates ($executeRaw`...`) SI pueden
    // usar ${} — ahi Prisma parametriza.
    const llamadas = src.match(/\$(?:execute|query)RawUnsafe[\s\S]*?\)/g) ?? [];
    expect(llamadas.length).toBeGreaterThan(0);
    const conInterpolacion = llamadas.filter((c) => /`[^`]*\$\{/.test(c));
    expect(conInterpolacion).toEqual([]);
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
    expect(src).not.toMatch(/^let VTEX_(ACCOUNT|KEY|TOKEN)/m);
    expect(src).not.toMatch(/^let ORG_ID/m);
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

describe("R-C02 — IDOR: el ?org= tiene que ser el tuyo", () => {
  const src = fuente();

  it("se compara el ?org= contra la org de la sesion antes de cargar credenciales", () => {
    expect(src).toContain("orgParam !== orgDeLaSesion");
    expect(src).toContain("isInternalUser");
    // El chequeo va ANTES de getVtexConfig: si fuera despues, ya habriamos
    // cargado las credenciales de otro tenant en memoria.
    expect(src.indexOf("orgParam !== orgDeLaSesion")).toBeLessThan(
      src.indexOf("await getVtexConfig(orgParam)"),
    );
  });

  it("el endpoint opera sobre UNA sola org, no mezcla sesion con ?org=", () => {
    // Antes el SQL se scopeaba por la org de la SESION mientras las
    // credenciales VTEX salian del ?org=. Para un staff con View-as-Org eso
    // consultaba la base de una organizacion con las credenciales de otra.
    const enQueries = src.match(/^\s*ORG_ID,\s*$/gm) ?? [];
    expect(enQueries).toEqual([]);
    expect(src).toContain("ctx.orgId");
  });
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
