import { describe, it, expect } from "vitest";
import { evaluarMoneda, resumir, MONEDA_ASUMIDA } from "./moneda";

// ══════════════════════════════════════════════════════════════════════════
// R-V05 — ¿pesos o dólares?
// ══════════════════════════════════════════════════════════════════════════
// La pregunta lleva abierta desde la auditoría del 2026-09-02. Si alguna cuenta
// factura en dólares, el ROAS de ese canal está mal por un factor de ~1.000.
//
// Al ir a mirar apareció que el sistema NUNCA PREGUNTÓ: `ad_metrics_daily` no
// tiene columna de moneda, Google convierte `cost_micros` y no lee cuál, y Meta
// pide `spend` sin pedir `currency`. Las dos APIs la devuelven gratis.
// ══════════════════════════════════════════════════════════════════════════

describe("una cuenta en la moneda asumida", () => {
  it("está bien y lo dice", () => {
    const r = evaluarMoneda("META_ADS", "Arredo", "act_1", MONEDA_ASUMIDA);
    expect(r.desalineada).toBe(false);
    expect(r.moneda).toBe("ARS");
  });

  it("no se confunde por mayúsculas ni espacios", () => {
    expect(evaluarMoneda("META_ADS", "x", "a", " ars ").desalineada).toBe(false);
  });
});

describe("EL CASO QUE IMPORTA: una cuenta en dólares", () => {
  const r = evaluarMoneda("GOOGLE_ADS", "Arredo", "123", "USD");

  it("sale marcada", () => {
    expect(r.desalineada).toBe(true);
    expect(r.moneda).toBe("USD");
  });

  it("explica el tamaño del error, que es lo que hace actuar", () => {
    // "está en otra moneda" no mueve a nadie. "un ROAS de 3x se muestra como
    // 3.000x" sí.
    expect(r.detalle).toContain("3.000x");
  });

  it("y dice que no se tomen decisiones de presupuesto con esos números", () => {
    expect(r.detalle).toMatch(/presupuesto/i);
  });
});

describe("cuando no se pudo preguntar", () => {
  const r = evaluarMoneda("META_ADS", "x", "act_1", null);

  it("NO cuenta como desalineada: no sabemos", () => {
    expect(r.desalineada).toBe(false);
  });

  it("pero tampoco se reporta como si estuviera bien", () => {
    // Si contara como alineada, el diagnóstico daría verde justo en la cuenta
    // que no pudimos revisar.
    expect(r.moneda).toBeNull();
    expect(r.detalle).toContain("No es lo mismo que estar bien");
  });

  it("un string vacío es lo mismo que no haber contestado", () => {
    expect(evaluarMoneda("META_ADS", "x", "a", "   ").moneda).toBeNull();
    expect(evaluarMoneda("META_ADS", "x", "a", undefined).moneda).toBeNull();
  });
});

describe("el resumen contesta la pregunta de una", () => {
  const ars = evaluarMoneda("META_ADS", "a", "1", "ARS");
  const usd = evaluarMoneda("GOOGLE_ADS", "b", "2", "USD");
  const mudo = evaluarMoneda("META_ADS", "c", "3", null);

  it("todo en pesos = R-V05 contestada", () => {
    const r = resumir([ars, ars]);
    expect(r.desalineadas).toBe(0);
    expect(r.veredicto).toContain("R-V05 contestada");
  });

  it("con una en dólares, lo dice primero", () => {
    const r = resumir([ars, usd]);
    expect(r.desalineadas).toBe(1);
    expect(r.veredicto).toContain("NO facturan");
  });

  it("con alguna muda, la respuesta NO se da por completa", () => {
    // Es la diferencia entre "verificamos y está bien" y "verificamos lo que
    // pudimos". Darlo por cerrado sería el mismo error que tratar un "no sé"
    // como un verde.
    const r = resumir([ars, mudo]);
    expect(r.desalineadas).toBe(0);
    expect(r.veredicto).toContain("no es completa");
  });

  it("una en dólares manda sobre una muda", () => {
    const r = resumir([usd, mudo]);
    expect(r.veredicto).toContain("NO facturan");
  });

  it("sin cuentas conectadas lo dice, no inventa un verde", () => {
    expect(resumir([]).veredicto).toContain("No hay cuentas");
  });
});
