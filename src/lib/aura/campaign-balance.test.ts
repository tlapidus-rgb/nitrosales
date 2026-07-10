import { describe, it, expect } from "vitest";
import { allocateFifo } from "./campaign-balance";

const c = (id: string, pending: number) => ({ campaignId: id, name: id, pending });

describe("allocateFifo — asignación FIFO de pagos por campaña (Bloque D)", () => {
  it("ejemplo de Tomy: 2 campañas de $25, pago $40 → vieja $25, siguiente $15", () => {
    const r = allocateFifo([c("c1", 25), c("c2", 25)], 40);
    expect(r.allocations).toEqual([
      { campaignId: "c1", name: "c1", amount: 25 },
      { campaignId: "c2", name: "c2", amount: 15 },
    ]);
    expect(r.allocated).toBe(40);
    expect(r.leftover).toBe(0);
  });

  it("paga exacto una sola campaña", () => {
    const r = allocateFifo([c("c1", 25), c("c2", 25)], 25);
    expect(r.allocations).toEqual([{ campaignId: "c1", name: "c1", amount: 25 }]);
    expect(r.leftover).toBe(0);
  });

  it("respeta el orden viejo→nuevo (candidates ya vienen ordenados)", () => {
    const r = allocateFifo([c("vieja", 10), c("nueva", 100)], 50);
    expect(r.allocations).toEqual([
      { campaignId: "vieja", name: "vieja", amount: 10 },
      { campaignId: "nueva", name: "nueva", amount: 40 },
    ]);
  });

  it("saltea campañas sin saldo pendiente", () => {
    const r = allocateFifo([c("saldada", 0), c("c2", 30)], 20);
    expect(r.allocations).toEqual([{ campaignId: "c2", name: "c2", amount: 20 }]);
  });

  it("pago mayor al total pendiente → allocated = total, leftover = sobrante", () => {
    const r = allocateFifo([c("c1", 25), c("c2", 25)], 80);
    expect(r.allocated).toBe(50);
    expect(r.leftover).toBe(30);
  });

  it("onlyCampaignIds: solo salda las seleccionadas, en orden viejo→nuevo", () => {
    const r = allocateFifo([c("c1", 25), c("c2", 25), c("c3", 25)], 100, ["c2", "c3"]);
    expect(r.allocations).toEqual([
      { campaignId: "c2", name: "c2", amount: 25 },
      { campaignId: "c3", name: "c3", amount: 25 },
    ]);
    expect(r.leftover).toBe(50);
  });

  it("montos con decimales redondean a 2", () => {
    const r = allocateFifo([c("c1", 33.33), c("c2", 33.33)], 50);
    expect(r.allocations[0].amount).toBe(33.33);
    expect(r.allocations[1].amount).toBe(16.67);
    expect(r.leftover).toBe(0);
  });
});
