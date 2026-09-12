import { describe, it, expect } from "vitest";
import { describirCobertura } from "./cobertura";

// ══════════════════════════════════════════════════════════════════════════
// E-26 — el truncado silencioso
// ══════════════════════════════════════════════════════════════════════════
// El bug no es tener un techo: es que el techo no se vea. Un panel que dice
// "0 clientes en riesgo crítico" sobre los 200 que más gastaron dice algo
// MUY distinto de lo que el usuario entiende que dice.
// ══════════════════════════════════════════════════════════════════════════

describe("cuando entró todo", () => {
  it("no hay nada que aclarar", () => {
    const c = describirCobertura({ analizados: 120, techo: 500, criterio: "mas-recientes" });
    expect(c.completa).toBe(true);
    expect(c.aviso).toBeNull();
  });

  it("un panel vacío tampoco inventa un aviso", () => {
    const c = describirCobertura({ analizados: 0, techo: 200, criterio: "mayor-gasto" });
    expect(c.completa).toBe(true);
    expect(c.aviso).toBeNull();
  });
});

describe("cuando se tocó el techo", () => {
  it("lo dice, con el número", () => {
    const c = describirCobertura({ analizados: 500, techo: 500, criterio: "mas-recientes" });
    expect(c.completa).toBe(false);
    expect(c.aviso).toContain("500");
  });

  it("EL DATO QUE FALTABA: dice por qué criterio se recortó", () => {
    // Saber que faltan filas sirve poco. Saber que las que faltan son las
    // menos recientes cambia cómo se lee la pantalla.
    const recientes = describirCobertura({ analizados: 500, techo: 500, criterio: "mas-recientes" });
    const gasto = describirCobertura({ analizados: 200, techo: 200, criterio: "mayor-gasto" });
    expect(recientes.aviso).toContain("más recientes");
    expect(gasto.aviso).toContain("más gastaron");
    expect(recientes.aviso).not.toEqual(gasto.aviso);
  });

  it("y dice qué es lo que NO se está viendo, no sólo que falta algo", () => {
    const gasto = describirCobertura({ analizados: 200, techo: 200, criterio: "mayor-gasto" });
    expect(gasto.aviso).toMatch(/ticket más chico/i);
    expect(gasto.aviso).toMatch(/no se está midiendo/i);

    const recientes = describirCobertura({ analizados: 500, techo: 500, criterio: "mas-recientes" });
    expect(recientes.aviso).toMatch(/no volvieron/i);
  });
});

describe("el borde exacto — el caso que define el criterio", () => {
  it("justo en el techo cuenta como RECORTADO, no como completo", () => {
    // Con exactamente `techo` filas no se puede distinguir "había justo esa
    // cantidad" de "había más y se cortó". La asimetría manda: un falso
    // positivo es molesto pero honesto; un falso negativo es el bug.
    expect(describirCobertura({ analizados: 200, techo: 200, criterio: "mayor-gasto" }).completa).toBe(
      false,
    );
  });

  it("uno menos que el techo es completo", () => {
    expect(describirCobertura({ analizados: 199, techo: 200, criterio: "mayor-gasto" }).completa).toBe(
      true,
    );
  });
});

describe("las exclusiones son otra cosa que el truncado", () => {
  it("se reportan aunque la cobertura esté completa", () => {
    // No desaparecen al subir el techo: son filtros del propio query. Un
    // cliente de una sola compra no entra a churn ni con LIMIT infinito.
    const c = describirCobertura({
      analizados: 40,
      techo: 200,
      criterio: "mayor-gasto",
      exclusiones: ["Clientes con una sola compra"],
    });
    expect(c.completa).toBe(true);
    expect(c.aviso).toBeNull();
    expect(c.exclusiones).toEqual(["Clientes con una sola compra"]);
  });

  it("sin exclusiones, la lista va vacía y no undefined", () => {
    // La UI mapea sobre esto. `undefined.map` es una pantalla en blanco.
    expect(describirCobertura({ analizados: 1, techo: 9, criterio: "mayor-gasto" }).exclusiones).toEqual(
      [],
    );
  });
});
