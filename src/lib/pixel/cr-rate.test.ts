import { describe, it, expect } from "vitest";
import { crPct, isCoverageIncoherent } from "./cr-rate";

describe("crPct — tasa de conversión honesta", () => {
  it("calcula el ratio normal con dos decimales", () => {
    expect(crPct(29, 1000)).toBe(2.9);
    expect(crPct(1, 3)).toBe(33.33);
  });

  it("no afirma nada cuando las ventas superan a las visitas (bug 2026-07-18)", () => {
    // Caso real visto en Arredo: "Acolchado King Sensitive Plush" con 1 visita
    // y 8 ventas mostraba CR 100%. No es un CR del 100%: es que el pixel no
    // registró esas visitas (46% de los VIEW_PRODUCT no traen productId).
    expect(crPct(8, 1)).toBe(0);
    expect(crPct(198, 100)).toBe(0);
  });

  it("un CR alto pero POSIBLE se muestra igual", () => {
    // 15 ventas sobre 17 visitas es sospechoso pero no imposible: puede ser un
    // producto de nicho con muy poca consulta y mucha intención. Sospechoso no
    // es lo mismo que incoherente — solo omitimos lo que no puede ser.
    expect(crPct(15, 17)).toBe(88.24);
  });

  it("tolera el error de HLL sin descartar filas sanas", () => {
    // Los visitantes son HLL (~2% de error): 101 compradores sobre 100
    // visitantes es ruido estadístico, no falta de cobertura.
    expect(crPct(101, 100)).toBe(100);
    expect(crPct(105, 100)).toBe(100);
    // Más allá de la tolerancia sí es incoherente.
    expect(crPct(120, 100)).toBe(0);
  });

  it("sin visitantes no hay denominador", () => {
    expect(crPct(5, 0)).toBe(0);
    expect(crPct(0, 0)).toBe(0);
  });

  it("un producto sin ventas da 0, no rompe", () => {
    expect(crPct(0, 500)).toBe(0);
  });

  it("no explota con valores no numéricos", () => {
    expect(crPct(NaN, 100)).toBe(0);
    expect(crPct(5, NaN)).toBe(0);
    expect(crPct(Infinity, 100)).toBe(0);
  });
});

describe("isCoverageIncoherent", () => {
  it("marca las filas donde la cobertura del pixel no alcanza", () => {
    expect(isCoverageIncoherent(8, 1)).toBe(true);
    expect(isCoverageIncoherent(5, 0)).toBe(true);
  });

  it("no marca las filas sanas ni las sin ventas", () => {
    expect(isCoverageIncoherent(29, 1000)).toBe(false);
    expect(isCoverageIncoherent(101, 100)).toBe(false); // ruido de HLL
    expect(isCoverageIncoherent(0, 500)).toBe(false);
    expect(isCoverageIncoherent(0, 0)).toBe(false);
  });
});
