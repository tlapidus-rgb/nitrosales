import { describe, it, expect } from "vitest";
import { leafCategoryId } from "./category-label";

describe("leafCategoryId — hoja de una ruta de categorías VTEX", () => {
  it("toma el último id de la ruta", () => {
    // "/1/11/" = categoría 1 > categoría 11. La hoja es la real del producto.
    expect(leafCategoryId("/1/11/")).toBe("11");
    expect(leafCategoryId("/25/28/")).toBe("28");
    expect(leafCategoryId("/12/17/")).toBe("17");
  });

  it("soporta rutas sin barras y de un solo nivel", () => {
    expect(leafCategoryId("12")).toBe("12");
    expect(leafCategoryId("/12/")).toBe("12");
  });

  it("soporta rutas profundas", () => {
    expect(leafCategoryId("/1/2/58/99/")).toBe("99");
  });

  it("devuelve null en entradas vacías o basura", () => {
    expect(leafCategoryId(null)).toBeNull();
    expect(leafCategoryId(undefined)).toBeNull();
    expect(leafCategoryId("")).toBeNull();
    expect(leafCategoryId("/")).toBeNull();
    expect(leafCategoryId("///")).toBeNull();
    expect(leafCategoryId("  ")).toBeNull();
  });
});
