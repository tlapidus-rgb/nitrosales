import { describe, it, expect } from "vitest";
import {
  armarManifiesto,
  estaCompleta,
  SE_EXPORTA,
  NO_SE_EXPORTA,
} from "./exportacion";

// ══════════════════════════════════════════════════════════════════════════
// E-27 — llevarse los datos propios
// ══════════════════════════════════════════════════════════════════════════
// La regla: una exportacion que recorta EN SILENCIO es peor que no tener
// exportacion. Sin ella el cliente sabe que no tiene sus datos; con una
// incompleta que no avisa, cree que los tiene.
// ══════════════════════════════════════════════════════════════════════════

const conteos = [
  { tabla: "orders", filas: 100 },
  { tabla: "order_items", filas: 250 },
  { tabla: "customers", filas: 80 },
  { tabla: "products", filas: 40 },
  { tabla: "manual_costs", filas: 0 },
  { tabla: "manual_channel_spends", filas: 0 },
  { tabla: "influencers", filas: 0 },
  { tabla: "influencer_deals", filas: 0 },
  { tabla: "influencer_attributions", filas: 0 },
  { tabla: "payouts", filas: 0 },
];

const manifiesto = (over: Partial<Parameters<typeof armarManifiesto>[0]> = {}) =>
  armarManifiesto({
    organizationId: "org1",
    organizacion: "Arredo",
    conteos,
    ahora: new Date("2026-09-13T12:00:00Z"),
    ...over,
  });

describe("el manifiesto dice que trae", () => {
  it("lista cada tabla con lo que es, en palabras del cliente", () => {
    const m = manifiesto();
    const ordenes = m.contenido.find((c) => c.tabla === "orders")!;
    expect(ordenes.que).toBe("Tus pedidos");
    expect(ordenes.filas).toBe(100);
  });

  it("suma las filas esperadas", () => {
    expect(manifiesto().filasEsperadas).toBe(470);
  });

  it("una tabla en cero igual figura: cero es una respuesta", () => {
    // Si no apareciera, el cliente no sabria si no tiene creadores o si nos
    // olvidamos de exportarlos.
    const m = manifiesto();
    expect(m.contenido.find((c) => c.tabla === "influencers")?.filas).toBe(0);
  });
});

describe("EL PUNTO: no da un total que parezca completo si no lo es", () => {
  it("si una tabla no se pudo contar, el total es null y no una suma parcial", () => {
    const m = manifiesto({
      conteos: conteos.map((c) => (c.tabla === "orders" ? { ...c, filas: null } : c)),
    });
    expect(m.filasEsperadas).toBeNull();
    expect(m.contenido.find((c) => c.tabla === "orders")?.filas).toBeNull();
  });

  it("una tabla que no vino en los conteos queda en null, no en cero", () => {
    const m = manifiesto({ conteos: [{ tabla: "orders", filas: 10 }] });
    expect(m.contenido.find((c) => c.tabla === "products")?.filas).toBeNull();
    expect(m.filasEsperadas).toBeNull();
  });
});

describe("lo que NO va, y por que", () => {
  it("cada exclusion tiene un motivo escrito", () => {
    for (const x of NO_SE_EXPORTA) {
      expect(x.porQue.length, `"${x.que}" no dice por que`).toBeGreaterThan(30);
    }
  });

  it("los eventos del pixel se declaran como excluidos, no se recortan", () => {
    // Son datos del cliente, pero son millones de filas. Recortarlos a los
    // primeros N sin decirlo seria exactamente el bug que esto evita.
    const pixel = NO_SE_EXPORTA.find((x) => /pixel/i.test(x.que));
    expect(pixel).toBeDefined();
    expect(pixel!.porQue).toMatch(/se piden aparte|aparte/i);
  });

  it("las credenciales NO se exportan nunca, y lo dice fuerte", () => {
    const cred = NO_SE_EXPORTA.find((x) => /credencial/i.test(x.que));
    expect(cred).toBeDefined();
    expect(cred!.porQue).toMatch(/NUNCA/);
  });

  it("los derivados nuestros se distinguen de los datos del cliente", () => {
    // El criterio es de propiedad, no de tamaño: un rollup es un calculo
    // nuestro y se reconstruye; una orden es del cliente.
    const rollups = NO_SE_EXPORTA.find((x) => /rollup|Gold/i.test(x.que));
    expect(rollups!.porQue).toMatch(/reconstruyen|cálculos nuestros/i);
  });
});

describe("la lista de lo que se exporta", () => {
  it("son datos del cliente, no derivados nuestros", () => {
    const tablas = SE_EXPORTA.map((t) => t.tabla);
    expect(tablas).toContain("orders");
    expect(tablas).toContain("customers");
    expect(tablas).toContain("products");
    // Nada de lo nuestro:
    expect(tablas.some((t) => t.startsWith("pixel_daily_"))).toBe(false);
    expect(tablas.some((t) => t.startsWith("silver_"))).toBe(false);
    expect(tablas.some((t) => t.startsWith("gold_"))).toBe(false);
    expect(tablas).not.toContain("customer_ltv_predictions");
  });

  it("toda tabla exportada explica que es, sin jerga de base de datos", () => {
    for (const t of SE_EXPORTA) {
      expect(t.que.length, `${t.tabla} no explica que es`).toBeGreaterThan(5);
      expect(t.que).not.toContain("_");
    }
  });

  it("NO se exportan las credenciales de las integraciones", () => {
    expect(SE_EXPORTA.map((t) => t.tabla)).not.toContain("connections");
  });
});

describe("saber si quedo completa", () => {
  it("coincide lo prometido con lo escrito", () => {
    expect(estaCompleta(470, 470)).toBe(true);
  });

  it("si salieron menos filas, NO esta completa", () => {
    // Aunque la descarga haya terminado sin error.
    expect(estaCompleta(470, 469)).toBe(false);
  });

  it("si no se sabia cuantas esperar, NO se puede afirmar que este completa", () => {
    expect(estaCompleta(null, 1000)).toBe(false);
  });
});
