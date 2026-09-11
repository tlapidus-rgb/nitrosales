import { describe, it, expect } from "vitest";
import {
  confianzaDelMargen,
  margenParaMostrar,
  avisoDeCobertura,
  COBERTURA_MINIMA,
  COBERTURA_CONFIABLE,
} from "./confianza-del-margen";

// ══════════════════════════════════════════════════════════════════════════
// E-25 — el margen bruto del 100 %
// ══════════════════════════════════════════════════════════════════════════
// Sin costos cargados, `COALESCE(costPrice, 0)` da COGS = 0 y el margen sale
// 100 %. No es un error de cálculo: es la respuesta correcta a la pregunta
// equivocada — el SQL cuenta como gratis lo que no sabe.
//
// Le pasa a TODO cliente nuevo el día 1, y miente en la dirección más
// peligrosa: diciéndole que gana más de lo que gana.
// ══════════════════════════════════════════════════════════════════════════

describe("confianzaDelMargen", () => {
  it("sin un solo costo cargado, no hay margen que mostrar", () => {
    expect(confianzaDelMargen(0)).toBe("sin-datos");
  });

  it("con cobertura parcial se muestra, pero avisando", () => {
    expect(confianzaDelMargen(35)).toBe("parcial");
  });

  it("con cobertura alta no hace falta aclarar nada", () => {
    expect(confianzaDelMargen(90)).toBe("confiable");
  });

  it("los bordes caen del lado que corresponde", () => {
    expect(confianzaDelMargen(COBERTURA_MINIMA - 0.1)).toBe("sin-datos");
    expect(confianzaDelMargen(COBERTURA_MINIMA)).toBe("parcial");
    expect(confianzaDelMargen(COBERTURA_CONFIABLE - 0.1)).toBe("parcial");
    expect(confianzaDelMargen(COBERTURA_CONFIABLE)).toBe("confiable");
  });

  it("una cobertura que no es un número se trata como sin datos", () => {
    expect(confianzaDelMargen(NaN)).toBe("sin-datos");
  });

  it("el umbral está alineado con el del detector de anomalías", () => {
    // `anomaly/detector.ts` usa `cogsCoverage > 20` para decidir si evaluar el
    // margen. Que el mail diga una cosa y la pantalla otra es peor que
    // cualquiera de las dos solas.
    expect(COBERTURA_MINIMA).toBe(20);
  });
});

describe("margenParaMostrar", () => {
  it("EL BUG: el 100 % del cliente nuevo no se muestra", () => {
    expect(margenParaMostrar(100, 0)).toBeNull();
  });

  it("null NO es cero — un cero es tan inventado como un cien", () => {
    // Esto es lo que hacía el `?? 0` del componente: convertía el "no sabemos"
    // en un 0 % pintado de rojo con la etiqueta "Crítico".
    const r = margenParaMostrar(100, 0);
    expect(r).toBeNull();
    expect(r).not.toBe(0);
  });

  it("con datos, devuelve el margen tal cual", () => {
    expect(margenParaMostrar(42.5, 90)).toBe(42.5);
  });

  it("con cobertura parcial también lo devuelve: se muestra con aviso", () => {
    expect(margenParaMostrar(42.5, 35)).toBe(42.5);
  });

  it("un margen legítimo de 0 % SÍ se muestra, si hay costos cargados", () => {
    // Vender al costo es un dato real y alarmante. No hay que confundirlo con
    // "no sé".
    expect(margenParaMostrar(0, 90)).toBe(0);
  });

  it("y un margen negativo también: es el caso más urgente que hay", () => {
    expect(margenParaMostrar(-15, 90)).toBe(-15);
  });
});

describe("avisoDeCobertura", () => {
  it("sin datos, explica QUÉ falta hacer y por qué no hay número", () => {
    const a = avisoDeCobertura(0)!;
    expect(a).toContain("precios de costo");
    expect(a).toMatch(/no se muestran|no mostrarte/);
  });

  it("parcial, dice que el número es mejor que el real", () => {
    // Es la dirección del error, y es la que importa: el cliente cree que gana
    // más de lo que gana.
    const a = avisoDeCobertura(35)!;
    expect(a).toContain("mejor que el real");
    expect(a).toContain("35%");
  });

  it("con cobertura buena no dice nada", () => {
    expect(avisoDeCobertura(90)).toBeNull();
  });

  it("ningún aviso habla de COGS ni de jerga", () => {
    // Lo lee Tomy y lo lee el cliente. Ninguno de los dos sabe qué es el COGS.
    for (const c of [0, 35]) {
      expect(avisoDeCobertura(c)!.toLowerCase()).not.toContain("cogs");
      expect(avisoDeCobertura(c)!.toLowerCase()).not.toContain("coverage");
    }
  });
});
