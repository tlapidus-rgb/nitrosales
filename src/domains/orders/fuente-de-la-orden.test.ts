import { describe, it, expect } from "vitest";
import {
  fuenteDeLaOrdenSql,
  meliPendienteSql,
  fuenteDeOrdenPedida,
  FUENTES_DE_ORDEN,
} from "./index";

// ══════════════════════════════════════════════════════════════════════════
// E-30 — "la plataforma de una orden" deja de estar escrita 42 veces
// ══════════════════════════════════════════════════════════════════════════
// `COALESCE("source", 'VTEX')` estaba 42 veces, 41 de ellas en un solo
// archivo. No era riesgo de inconsistencia —todas decian lo mismo— sino de
// CAMBIO: el dia que entre una tercera plataforma, "una orden sin plataforma
// es VTEX" hay que revisarlo en 42 lugares en vez de en uno.
//
// LO QUE ESTE ARCHIVO CUIDA POR ENCIMA DE TODO: que el SQL generado sea
// IDENTICO al que habia. Son 42 interpolaciones en queries de metricas; un
// caracter distinto y los numeros cambian sin que nadie lo pida.
// ══════════════════════════════════════════════════════════════════════════

describe("el SQL generado es EXACTAMENTE el que estaba escrito a mano", () => {
  it("sin alias", () => {
    expect(fuenteDeLaOrdenSql()).toBe(`COALESCE("source", 'VTEX')`);
  });

  it("con alias `o`", () => {
    expect(fuenteDeLaOrdenSql("o")).toBe(`COALESCE(o."source", 'VTEX')`);
  });

  it("el patron MELI-pendiente, sin alias", () => {
    expect(meliPendienteSql()).toBe(`COALESCE("source", 'VTEX') = 'MELI' AND status = 'PENDING'`);
  });

  it("el patron MELI-pendiente, con alias `o`", () => {
    expect(meliPendienteSql("o")).toBe(
      `COALESCE(o."source", 'VTEX') = 'MELI' AND o.status = 'PENDING'`,
    );
  });
});

describe("por que ese patron existe", () => {
  it("nombra MELI y PENDING, que es lo que se excluye", () => {
    // MELI crea la orden al iniciar el checkout, no al pagarlo: contarlas
    // infla las ventas con carritos abandonados.
    const sql = meliPendienteSql("o");
    expect(sql).toContain("'MELI'");
    expect(sql).toContain("'PENDING'");
  });

  it("el default es VTEX y no otra cosa", () => {
    // Es la regla que la ficha nombra: una orden sin plataforma ES una orden
    // VTEX. Vive tambien en el schema (`source String @default("VTEX")`), asi
    // que ya tenia dos duenos antes de repetirse 42 veces.
    expect(fuenteDeLaOrdenSql()).toContain("'VTEX'");
  });
});

describe("la whitelist de fuentes", () => {
  it("son VTEX y MELI", () => {
    expect([...FUENTES_DE_ORDEN]).toEqual(["VTEX", "MELI"]);
  });

  it("acepta las conocidas, normalizando mayusculas", () => {
    expect(fuenteDeOrdenPedida("vtex")).toBe("VTEX");
    expect(fuenteDeOrdenPedida("MELI")).toBe("MELI");
    expect(fuenteDeOrdenPedida("MeLi")).toBe("MELI");
  });

  it("ES WHITELIST DE SEGURIDAD: lo que no esta, no entra", () => {
    // El valor se interpola en SQL. Esto no es solo dominio, es la defensa
    // contra inyeccion que los dos endpoints ya tenian.
    expect(fuenteDeOrdenPedida("VTEX'; DROP TABLE orders;--")).toBeNull();
    expect(fuenteDeOrdenPedida("SHOPIFY")).toBeNull();
  });

  it("null, undefined y vacio devuelven null — o sea sin filtro", () => {
    // Es lo que los dos endpoints ya hacian: sin filtro, no error.
    expect(fuenteDeOrdenPedida(null)).toBeNull();
    expect(fuenteDeOrdenPedida(undefined)).toBeNull();
    expect(fuenteDeOrdenPedida("")).toBeNull();
  });
});
