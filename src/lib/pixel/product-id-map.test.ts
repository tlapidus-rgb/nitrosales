import { describe, it, expect } from "vitest";
import {
  foldPurchasesToProductGrain,
  type PurchaseRow,
} from "./product-id-map";

const row = (skuId: string, over: Partial<PurchaseRow> = {}): PurchaseRow => ({
  productExternalId: skuId,
  productName: "Juego de Sábanas Postal playa",
  category: "/1/11/",
  brand: "Arredo",
  orders: 1,
  units: 1,
  revenue: 1000,
  ...over,
});

describe("foldPurchasesToProductGrain — grano producto (D3)", () => {
  it("suma las variantes en UNA fila, sin multiplicar revenue (bug 2026-07-18)", () => {
    // Un producto con 4 colores: 4 filas de SKU en order_items, UNA ficha en el
    // pixel. Si esto no pliega, el JOIN por productId devuelve 4 filas y el
    // revenue se multiplica por 4 sin que ningún conteo lo note.
    const map = new Map([
      ["sku-blanco", "prod-1"],
      ["sku-gris", "prod-1"],
      ["sku-beige", "prod-1"],
      ["sku-negro", "prod-1"],
    ]);
    const out = foldPurchasesToProductGrain(
      [
        row("sku-blanco", { orders: 2, units: 3, revenue: 1000 }),
        row("sku-gris", { orders: 1, units: 1, revenue: 500 }),
        row("sku-beige", { orders: 4, units: 5, revenue: 2000 }),
        row("sku-negro", { orders: 1, units: 2, revenue: 700 }),
      ],
      map
    );

    expect(out.size).toBe(1);
    const p = out.get("prod-1")!;
    expect(p.orders).toBe(8);
    expect(p.units).toBe(11);
    expect(p.revenue).toBe(4200); // suma exacta, NO 4x nada
    expect(p.productExternalId).toBe("prod-1"); // re-keyeado al padre
  });

  it("descarta las filas sin cruce verificado en vez de atribuirlas mal", () => {
    // El bug original: products."externalId" = <id del pixel> emparejaba por
    // colisión numérica y le colgaba las ventas al producto equivocado.
    // Sin mapa no se atribuye nada.
    const out = foldPurchasesToProductGrain(
      [row("sku-huerfano"), row("sku-conocido")],
      new Map([["sku-conocido", "prod-9"]])
    );

    expect(out.size).toBe(1);
    expect(out.has("prod-9")).toBe(true);
    expect(out.get("prod-9")!.revenue).toBe(1000);
  });

  it("sin mapa (dimensión vacía) no atribuye NINGUNA venta", () => {
    // Estado previo al backfill: preferimos columnas en blanco antes que el CR
    // de otro producto.
    const out = foldPurchasesToProductGrain(
      [row("sku-a"), row("sku-b")],
      new Map()
    );
    expect(out.size).toBe(0);
  });

  it("no muta las filas de entrada", () => {
    const input = [row("sku-1", { revenue: 100 }), row("sku-2", { revenue: 50 })];
    foldPurchasesToProductGrain(
      input,
      new Map([
        ["sku-1", "prod-1"],
        ["sku-2", "prod-1"],
      ])
    );
    expect(input[0].revenue).toBe(100);
    expect(input[1].revenue).toBe(50);
  });

  it("lista vacía devuelve mapa vacío", () => {
    expect(foldPurchasesToProductGrain([], new Map()).size).toBe(0);
  });
});
