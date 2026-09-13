import { describe, it, expect } from "vitest";
import { armarPlanDeBorrado, auditar, loQueSePuedeAfirmar, SE_CONSERVAN } from "./borrado";

// ══════════════════════════════════════════════════════════════════════════
// E-28 — poder decir "borramos todo" con evidencia, no de memoria
// ══════════════════════════════════════════════════════════════════════════
// `wipe-account` borra de 9 tablas. El schema tiene 54 con `organizationId`, y
// hay ~30 mas en produccion que ni siquiera estan en schema.prisma.
//
// Y el header de ese archivo AFIRMA que borra pixel_events, pixel_visitors,
// pixel_attributions, ad_campaigns, influencer_*, alerts, ml_webhook_events y
// sync_watermarks. Ninguna aparece en el codigo.
// ══════════════════════════════════════════════════════════════════════════

describe("el orden de borrado respeta las foreign keys", () => {
  it("las hijas se borran ANTES que las madres", () => {
    // Sin esto el primer DELETE choca contra una FK y el borrado se corta a la
    // mitad, dejando al cliente PARCIALMENTE borrado — el peor estado posible.
    const plan = armarPlanDeBorrado(
      ["organizations", "orders", "order_items"],
      [
        { hija: "orders", madre: "organizations" },
        { hija: "order_items", madre: "orders" },
      ],
      {},
    );
    const pos = (t: string) => plan.orden.indexOf(t);
    expect(pos("order_items")).toBeLessThan(pos("orders"));
    expect(pos("orders")).toBeLessThan(pos("organizations"));
  });

  it("una cadena larga sale ordenada entera", () => {
    const plan = armarPlanDeBorrado(
      ["a", "b", "c", "d"],
      [
        { hija: "d", madre: "c" },
        { hija: "c", madre: "b" },
        { hija: "b", madre: "a" },
      ],
      {},
    );
    expect(plan.orden).toEqual(["d", "c", "b", "a"]);
  });

  it("las tablas sueltas entran igual", () => {
    const plan = armarPlanDeBorrado(["sola", "otra"], [], {});
    expect(plan.orden.sort()).toEqual(["otra", "sola"]);
  });

  it("una FK a si misma no traba nada", () => {
    // `customers` puede referenciarse a si misma (cliente padre/hijo). Si eso
    // contara como dependencia, la tabla nunca quedaria libre y el plan se
    // frenaria sin explicacion.
    const plan = armarPlanDeBorrado(["customers"], [{ hija: "customers", madre: "customers" }], {});
    expect(plan.orden).toEqual(["customers"]);
    expect(plan.ciclos).toEqual([]);
  });

  it("un ciclo REAL se reporta, no se resuelve inventando", () => {
    // Dos tablas que se referencian mutuamente no tienen orden posible.
    // Elegir uno al azar haria que el borrado falle en produccion; decirlo
    // permite resolverlo a mano.
    const plan = armarPlanDeBorrado(
      ["x", "y"],
      [
        { hija: "x", madre: "y" },
        { hija: "y", madre: "x" },
      ],
      {},
    );
    expect(plan.ciclos.sort()).toEqual(["x", "y"]);
    expect(plan.orden).toEqual([]);
  });
});

describe("lo que se conserva lleva motivo escrito", () => {
  it("las conservadas salen del plan de borrado", () => {
    const plan = armarPlanDeBorrado(["orders", "email_log"], [], SE_CONSERVAN);
    expect(plan.orden).toEqual(["orders"]);
    expect(plan.seConservan.map((c) => c.tabla)).toEqual(["email_log"]);
  });

  it("TODA conservada tiene un motivo no vacio", () => {
    // "Por las dudas" no es un motivo: si no se sabe por que se conserva algo
    // de un cliente que se fue, hay que borrarlo.
    for (const [tabla, motivo] of Object.entries(SE_CONSERVAN)) {
      expect(motivo.length, `${tabla} no tiene motivo`).toBeGreaterThan(20);
    }
  });

  it("el motivo de email_log reconoce que contiene direcciones", () => {
    // Conservarlo entero ante un pedido de borrado total seria incumplir.
    expect(SE_CONSERVAN.email_log).toMatch(/anonimiz/i);
  });

  it("una tabla que NO esta en la lista se borra", () => {
    // El default es borrar, no conservar: los datos de un cliente que se fue
    // no se quedan por omision.
    const plan = armarPlanDeBorrado(["tabla_nueva"], [], SE_CONSERVAN);
    expect(plan.orden).toEqual(["tabla_nueva"]);
  });
});

describe("la auditoria — poder probarlo", () => {
  it("con todo en cero, esta limpio", () => {
    const a = auditar([
      { tabla: "orders", filas: 0 },
      { tabla: "pixel_events", filas: 0 },
    ]);
    expect(a.limpio).toBe(true);
    expect(a.filasQueQuedan).toBe(0);
  });

  it("lista lo que queda, de mayor a menor", () => {
    const a = auditar([
      { tabla: "orders", filas: 100 },
      { tabla: "pixel_events", filas: 50_000 },
      { tabla: "products", filas: 0 },
    ]);
    expect(a.limpio).toBe(false);
    expect(a.filasQueQuedan).toBe(50_100);
    expect(a.conDatos.map((t) => t.tabla)).toEqual(["pixel_events", "orders"]);
  });

  it("EL PUNTO: una tabla que no se pudo contar NO cuenta como limpia", () => {
    // Decir "esta todo borrado" porque una consulta fallo es exactamente la
    // mentira que este modulo viene a evitar.
    const a = auditar([
      { tabla: "orders", filas: 0 },
      { tabla: "pixel_events", filas: null },
    ]);
    expect(a.limpio).toBe(false);
    expect(a.sinPoderContar).toEqual(["pixel_events"]);
  });
});

describe("lo que se puede afirmar", () => {
  it("limpio: la afirmacion es categorica", () => {
    const t = loQueSePuedeAfirmar(auditar([{ tabla: "orders", filas: 0 }]));
    expect(t).toMatch(/No queda ningún dato/i);
  });

  it("con datos: dice cuantas filas y en cuantas tablas", () => {
    const t = loQueSePuedeAfirmar(
      auditar([
        { tabla: "orders", filas: 100 },
        { tabla: "pixel_events", filas: 900 },
      ]),
    );
    expect(t).toContain("1.000");
    expect(t).toContain("2 tabla");
    expect(t).toMatch(/no se puede afirmar/i);
  });

  it("sin poder contar: distingue 'no encontre nada' de 'esta limpio'", () => {
    const t = loQueSePuedeAfirmar(
      auditar([
        { tabla: "orders", filas: 0 },
        { tabla: "silver_orders", filas: null },
      ]),
    );
    expect(t).toMatch(/no se pudieron consultar/i);
    expect(t).toMatch(/no se puede afirmar/i);
    expect(t).not.toMatch(/No queda ningún dato/i);
  });
});
