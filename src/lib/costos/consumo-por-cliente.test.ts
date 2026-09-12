import { describe, it, expect } from "vitest";
import { costoDeAurum, armarConsumo, avisosDelReporte } from "./consumo-por-cliente";
import type { ConsumoDeUnCliente, LlamadaDeAurum } from "./consumo-por-cliente";

// ══════════════════════════════════════════════════════════════════════════
// E-21 — medir el consumo es parte del producto
// ══════════════════════════════════════════════════════════════════════════
// El precio es por volumen de data procesada. Si el precio es por consumo y el
// consumo no se mide, cerrar un contrato y facturarlo son dos actos de fe
// distintos.
//
// La regla que ordena todo: `null` != 0. Una dimension que no se pudo medir
// tiene que verse distinta de una que midio cero, porque las decisiones son
// opuestas — y aca el numero termina en una factura.
// ══════════════════════════════════════════════════════════════════════════

const vacio = {} as NodeJS.ProcessEnv;

const llamada = (over: Partial<LlamadaDeAurum> = {}): LlamadaDeAurum => ({
  organizationId: "org1",
  mode: "FLASH",
  model: "claude-haiku-4-5",
  inputTokens: 1_000_000,
  outputTokens: 0,
  ...over,
});

describe("el costo de Aurum", () => {
  it("suma las llamadas conocidas", () => {
    const r = costoDeAurum([llamada(), llamada()], vacio);
    expect(r.queries).toBe(2);
    expect(r.usdConocido).toBeCloseTo(2, 6);
  });

  it("cuenta las queries por modo, que es lo que se factura", () => {
    // Deep cuesta 10-50x Flash: el mix importa tanto como el total.
    const r = costoDeAurum(
      [llamada({ mode: "FLASH" }), llamada({ mode: "DEEP" }), llamada({ mode: "DEEP" })],
      vacio,
    );
    expect(r.porModo).toEqual({ FLASH: 1, DEEP: 2 });
  });

  it("acumula tokens de entrada y salida por separado", () => {
    const r = costoDeAurum([llamada({ inputTokens: 100, outputTokens: 50 })], vacio);
    expect(r.tokensEntrada).toBe(100);
    expect(r.tokensSalida).toBe(50);
  });
});

describe("EL PUNTO: un modelo sin precio no se suma como cero", () => {
  it("queda listado aparte, con cuantas llamadas", () => {
    const r = costoDeAurum(
      [llamada(), llamada({ model: "modelo-raro" }), llamada({ model: "modelo-raro" })],
      vacio,
    );
    expect(r.usdConocido).toBeCloseTo(1, 6); // solo la conocida
    expect(r.modelosSinPrecio).toEqual([{ modelo: "modelo-raro", llamadas: 2 }]);
  });

  it("pero SI cuenta en queries y tokens: eso se midio igual", () => {
    // El consumo se midio; lo que falta es el precio. Sacarla del conteo seria
    // perder dos datos en vez de uno.
    const r = costoDeAurum([llamada({ model: "modelo-raro", inputTokens: 500 })], vacio);
    expect(r.queries).toBe(1);
    expect(r.tokensEntrada).toBe(500);
    expect(r.usdConocido).toBe(0);
  });

  it("los ordena por volumen, para saber cual duele mas", () => {
    const r = costoDeAurum(
      [
        llamada({ model: "raro-a" }),
        llamada({ model: "raro-b" }),
        llamada({ model: "raro-b" }),
      ],
      vacio,
    );
    expect(r.modelosSinPrecio[0].modelo).toBe("raro-b");
  });

  it("sin llamadas, todo en cero y la lista vacia", () => {
    const r = costoDeAurum([], vacio);
    expect(r.queries).toBe(0);
    expect(r.usdConocido).toBe(0);
    expect(r.modelosSinPrecio).toEqual([]);
  });
});

const base = {
  organizationId: "org1",
  nombre: "Arredo",
  plan: "PRO",
  ordenesDelPeriodo: 20000,
  skusActivos: 5000,
  integracionesActivas: 8,
  eventosPixelDelPeriodo: 900000,
  usuarios: 12,
  aurum: costoDeAurum([], vacio),
};

describe("null no es cero", () => {
  it("con todo medido, no hay nada faltante", () => {
    expect(armarConsumo(base).sinMedir).toEqual([]);
  });

  it("una dimension en null se lista por nombre", () => {
    const r = armarConsumo({ ...base, skusActivos: null });
    expect(r.sinMedir).toEqual(["SKUs activos"]);
  });

  it("una dimension en CERO no se lista: cero es una medicion valida", () => {
    // Un cliente que no usa el pixel factura cero por esa dimension. Eso no es
    // lo mismo que no haber podido medirlo.
    const r = armarConsumo({ ...base, eventosPixelDelPeriodo: 0 });
    expect(r.sinMedir).toEqual([]);
  });

  it("varias en null se listan todas", () => {
    const r = armarConsumo({ ...base, ordenesDelPeriodo: null, usuarios: null });
    expect(r.sinMedir).toHaveLength(2);
    expect(r.sinMedir).toContain("órdenes del período");
    expect(r.sinMedir).toContain("usuarios");
  });
});

describe("los avisos: cuando el numero NO se puede facturar tal cual", () => {
  const sano = (over: Partial<ConsumoDeUnCliente> = {}) => armarConsumo({ ...base, ...over });
  const args = {
    clientes: [sano()],
    preciosVerificadosEl: "2026-09-12",
    convieneRevisarPrecios: false,
    filasDeAurumTruncadas: false,
  };

  it("SIEMPRE aclara que el USD no incluye infraestructura", () => {
    // Es lo que mas facil se olvida al mirar un numero que dice "USD".
    const r = avisosDelReporte(args);
    expect(r.avisos.some((a) => /no incluye Neon/i.test(a))).toBe(true);
  });

  it("con todo medido y todo con precio, el reporte figura completo", () => {
    expect(avisosDelReporte(args).completo).toBe(true);
  });

  it("una dimension sin medir lo marca incompleto y avisa que NO son cero", () => {
    const r = avisosDelReporte({ ...args, clientes: [sano({ skusActivos: null })] });
    expect(r.completo).toBe(false);
    expect(r.avisos.some((a) => /NO son cero/i.test(a))).toBe(true);
  });

  it("un modelo sin precio lo marca incompleto y lo nombra", () => {
    const conRaro = armarConsumo({
      ...base,
      aurum: costoDeAurum([llamada({ model: "modelo-raro" })], vacio),
    });
    const r = avisosDelReporte({ ...args, clientes: [conRaro] });
    expect(r.completo).toBe(false);
    expect(r.avisos.some((a) => a.includes("modelo-raro"))).toBe(true);
    expect(r.avisos.some((a) => /PRECIOS_MODELOS_JSON/.test(a))).toBe(true);
  });

  it("si los precios envejecieron, lo dice con la fecha", () => {
    const r = avisosDelReporte({ ...args, convieneRevisarPrecios: true });
    expect(r.avisos.some((a) => a.includes("2026-09-12"))).toBe(true);
  });

  it("EL AVISO QUE EVITA FACTURAR DE MENOS: filas truncadas", () => {
    // Si el query de Aurum toco su techo, el costo esta SUBESTIMADO. Facturar
    // de menos es el error que el cliente no reclama nunca.
    const r = avisosDelReporte({ ...args, filasDeAurumTruncadas: true });
    expect(r.avisos.some((a) => /SUBESTIMADO/i.test(a))).toBe(true);
  });
});

describe("filas agrupadas — asi el truncado deja de ser posible", () => {
  // El endpoint agrega en SQL por (org, modo, modelo) en vez de traer filas
  // crudas con `take: 10000`. Eso no reporta mejor el truncado: lo elimina.
  it("una fila con `llamadas: 40` cuenta como 40 queries", () => {
    const r = costoDeAurum([llamada({ llamadas: 40 })], vacio);
    expect(r.queries).toBe(40);
  });

  it("y el modo acumula las 40, no 1", () => {
    const r = costoDeAurum([llamada({ mode: "DEEP", llamadas: 40 })], vacio);
    expect(r.porModo).toEqual({ DEEP: 40 });
  });

  it("los tokens ya vienen sumados por grupo: no se multiplican de nuevo", () => {
    // El precio es lineal en tokens, asi que se costea el grupo entero de una.
    // Multiplicar por `llamadas` contaria el consumo 40 veces.
    const r = costoDeAurum([llamada({ inputTokens: 1_000_000, llamadas: 40 })], vacio);
    expect(r.tokensEntrada).toBe(1_000_000);
    expect(r.usdConocido).toBeCloseTo(1, 6);
  });

  it("sin `llamadas`, una fila sigue siendo una llamada", () => {
    expect(costoDeAurum([llamada(), llamada()], vacio).queries).toBe(2);
  });

  it("un grupo sin precio suma sus llamadas al conteo de desconocidos", () => {
    const r = costoDeAurum([llamada({ model: "raro", llamadas: 13 })], vacio);
    expect(r.modelosSinPrecio).toEqual([{ modelo: "raro", llamadas: 13 }]);
  });
});
