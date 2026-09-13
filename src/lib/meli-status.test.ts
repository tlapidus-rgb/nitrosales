import { describe, it, expect, vi, afterEach } from "vitest";
import { mapMeliStatus, esStatusDeMeliConocido, MELI_STATUSES_CONOCIDOS } from "./meli-status";
import { ORDER_STATUS_NOT_CONCRETED } from "@/domains/orders";

// ══════════════════════════════════════════════════════════════════════════
// E-30 — el mapeo de estados de MELI estaba en seis copias que no coincidian
// ══════════════════════════════════════════════════════════════════════════
// Dos familias:
//   A (4 archivos, incluido el webhook en vivo): confirmed -> APPROVED
//   B (2 archivos: backfill y reconcile):        confirmed -> PENDING
//
// Las dos diferencias caen justo sobre el filtro de venta valida, asi que la
// MISMA orden contaba como facturacion o no segun que codigo la escribio. Es
// la clase de bug "12 vs 14 vs 16" que el contrato de ordenes existe para matar.
//
// Este mapper adopta la familia B, que es la correcta.
// ══════════════════════════════════════════════════════════════════════════

/** Refleja `ordersValidWhere`: una orden cuenta si su estado NO esta en la lista. */
const cuentaComoVenta = (estado: string) =>
  !(ORDER_STATUS_NOT_CONCRETED as readonly string[]).includes(estado);

afterEach(() => vi.restoreAllMocks());

describe("LAS DOS DIVERGENCIAS QUE MOVIAN PLATA", () => {
  it("`confirmed` es PENDING: en MELI significa 'esperando pago'", () => {
    // La familia A la daba por APPROVED, o sea que el webhook contaba plata
    // que todavia no entro.
    expect(mapMeliStatus("confirmed")).toBe("PENDING");
    expect(cuentaComoVenta(mapMeliStatus("confirmed"))).toBe(false);
  });

  it("`partially_refunded` es APPROVED: la venta sigue siendo valida", () => {
    // Reembolso PARCIAL. La propia UI de MELI lo cuenta en "concretadas".
    // La familia A lo mandaba al default (PENDING) y lo perdia.
    expect(mapMeliStatus("partially_refunded")).toBe("APPROVED");
    expect(cuentaComoVenta(mapMeliStatus("partially_refunded"))).toBe(true);
  });

  it("`invalid` es CANCELLED, no PENDING", () => {
    // Una orden que MELI descarto. Mandarla a PENDING la dejaba pareciendo
    // que todavia puede concretarse.
    expect(mapMeliStatus("invalid")).toBe("CANCELLED");
  });
});

describe("el orden de resolucion — y por que no es negociable", () => {
  it("cancelled gana sobre el tag `delivered`", () => {
    // MELI conserva el tag historico incluso tras cancelar el pack. Mirar el
    // tag primero resucitaria ordenes canceladas como entregadas.
    expect(mapMeliStatus("cancelled", ["delivered"])).toBe("CANCELLED");
  });

  it("invalid tambien gana sobre el tag", () => {
    expect(mapMeliStatus("invalid", ["delivered"])).toBe("CANCELLED");
  });

  it("el tag `delivered` SI pisa a un status en curso", () => {
    // MELI a veces deja el status atras y marca la entrega solo por tag.
    expect(mapMeliStatus("shipped", ["delivered"])).toBe("DELIVERED");
    expect(mapMeliStatus("paid", ["delivered"])).toBe("DELIVERED");
  });

  it("otros tags no cambian nada", () => {
    expect(mapMeliStatus("paid", ["not_delivered", "pack_order"])).toBe("APPROVED");
  });

  it("tags vacios, null o undefined no rompen", () => {
    expect(mapMeliStatus("paid", [])).toBe("APPROVED");
    expect(mapMeliStatus("paid", null)).toBe("APPROVED");
    expect(mapMeliStatus("paid")).toBe("APPROVED");
  });
});

describe("la tabla completa", () => {
  const esperado: Record<string, string> = {
    confirmed: "PENDING",
    payment_required: "PENDING",
    payment_in_process: "PENDING",
    partially_paid: "PENDING",
    paid: "APPROVED",
    partially_refunded: "APPROVED",
    shipped: "SHIPPED",
    delivered: "DELIVERED",
    cancelled: "CANCELLED",
    invalid: "CANCELLED",
  };

  for (const [entrada, salida] of Object.entries(esperado)) {
    it(`${entrada} -> ${salida}`, () => {
      expect(mapMeliStatus(entrada)).toBe(salida);
    });
  }

  it("conoce exactamente esos diez y ninguno mas", () => {
    expect(MELI_STATUSES_CONOCIDOS.sort()).toEqual(Object.keys(esperado).sort());
  });
});

describe("lo desconocido es conservador y ruidoso", () => {
  it("un status nuevo de MELI cae a PENDING, o sea NO cuenta como venta", () => {
    // Al reves seria peor: un status que no entendemos inflando facturacion.
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(mapMeliStatus("un_estado_nuevo")).toBe("PENDING");
    expect(cuentaComoVenta("PENDING")).toBe(false);
    spy.mockRestore();
  });

  it("y avisa por consola, igual que el mapper de VTEX", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mapMeliStatus("un_estado_nuevo");
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0][0])).toContain("un_estado_nuevo");
  });

  it("un status conocido NO avisa", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mapMeliStatus("paid");
    expect(spy).not.toHaveBeenCalled();
  });

  it("vacio, null y undefined caen a PENDING", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(mapMeliStatus("")).toBe("PENDING");
    expect(mapMeliStatus(null)).toBe("PENDING");
    expect(mapMeliStatus(undefined)).toBe("PENDING");
    spy.mockRestore();
  });
});

describe("normalizacion de la entrada", () => {
  it("mayusculas y espacios no cambian el resultado", () => {
    expect(mapMeliStatus("  PAID  ")).toBe("APPROVED");
    expect(mapMeliStatus("Cancelled")).toBe("CANCELLED");
  });
});

describe("esStatusDeMeliConocido", () => {
  it("distingue un status raro de uno vacio", () => {
    expect(esStatusDeMeliConocido("paid")).toBe(true);
    expect(esStatusDeMeliConocido("invalid")).toBe(true);
    expect(esStatusDeMeliConocido("marciano")).toBe(false);
    expect(esStatusDeMeliConocido("")).toBe(false);
    expect(esStatusDeMeliConocido(null)).toBe(false);
  });
});
