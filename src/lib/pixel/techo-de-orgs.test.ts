import { describe, it, expect } from "vitest";
import { calcularTecho, dispersion } from "./techo-de-orgs";

// ══════════════════════════════════════════════════════════════════════════
// El techo de organizaciones — la cuenta, con numeros que se pueden verificar
// ══════════════════════════════════════════════════════════════════════════
// Circulaban TRES numeros distintos para "cuantos clientes aguanta esto", y
// ninguno estaba medido. Este modulo hace la cuenta; los tests fijan que la
// cuenta sea la correcta, no que el numero sea lindo.
// ══════════════════════════════════════════════════════════════════════════

// El presupuesto real, leido de vercel.json y del codigo del cron:
//   Vercel "11,41 * * * *"     → 2 por hora  = 48/dia
//   GitHub Actions "*/15"      → 4 por hora  = 96/dia
//   INVOCATION_BUDGET_MS       → 250.000 ms
//   ROLLUP_TABLES              → 8 tablas
const REAL = {
  invocacionesPorDia: 144,
  presupuestoPorInvocacionMs: 250_000,
  tablas: 8,
};

describe("la cuenta base", () => {
  it("el presupuesto diario es invocaciones x presupuesto", () => {
    const t = calcularTecho([{ org: "a", ms: 1000 }], REAL);
    expect(t.presupuestoDiarioMs).toBe(144 * 250_000); // 36.000.000 ms = 10 h
  });

  it("la demanda es la suma de las orgs POR la cantidad de tablas", () => {
    // Cada tabla hay que rehacerla para el dia que paso: 8 tablas x cada org.
    const t = calcularTecho(
      [
        { org: "a", ms: 1000 },
        { org: "b", ms: 2000 },
      ],
      REAL,
    );
    expect(t.demandaDiariaMs).toBe(3000 * 8);
  });

  it("la ocupacion dice que fraccion del dia se usa", () => {
    const t = calcularTecho([{ org: "a", ms: 4_500_000 }], { ...REAL, tablas: 8 });
    expect(t.ocupacion).toBeCloseTo(1, 6); // 4,5M x 8 = 36M = exactamente el dia
  });
});

describe("el techo", () => {
  it("con orgs iguales, el techo es presupuesto / costo de una", () => {
    const t = calcularTecho([{ org: "a", ms: 100_000 }], REAL);
    // 36.000.000 / (100.000 x 8) = 45
    expect(t.techoDeOrgs).toBe(45);
  });

  it("y las adicionales descuentan las que ya estan", () => {
    const t = calcularTecho(
      [
        { org: "a", ms: 100_000 },
        { org: "b", ms: 100_000 },
      ],
      REAL,
    );
    expect(t.techoDeOrgs).toBe(45);
    expect(t.orgsAdicionales).toBe(43);
  });

  it("EL NUMERO QUE IMPORTA ANTES DE FIRMAR UN CLIENTE GRANDE", () => {
    // El promedio miente cuando hay una org enorme y tres chicas: dice que
    // entran muchas mas de las que entrarian si el proximo cliente es grande.
    const t = calcularTecho(
      [
        { org: "arredo", ms: 190_000 },
        { org: "chica1", ms: 8_000 },
        { org: "chica2", ms: 8_000 },
        { org: "chica3", ms: 8_000 },
      ],
      REAL,
    );
    expect(t.techoDeOrgs).toBeGreaterThan(t.techoSiTodasFueranGrandes);
    // Si TODAS fueran como Arredo: 36.000.000 / (190.000 x 8) = 23
    expect(t.techoSiTodasFueranGrandes).toBe(23);
  });

  it("si ya se paso del presupuesto, no hay adicionales", () => {
    const t = calcularTecho([{ org: "a", ms: 10_000_000 }], REAL);
    expect(t.ocupacion).toBeGreaterThan(1);
    expect(t.orgsAdicionales).toBeNull();
  });

  it("justo en el limite, adicionales es cero y no null", () => {
    // Cero y "no entra" son cosas distintas: cero es "estas al filo", null es
    // "ya te pasaste". Confundirlas es lo que hace que nadie mire el numero.
    const t = calcularTecho([{ org: "a", ms: 4_500_000 }], REAL);
    expect(t.orgsAdicionales).toBe(0);
    expect(t.ocupacion).toBeCloseTo(1, 6);
  });
});

describe("la dispersion dice cuanto vale el promedio", () => {
  it("orgs parecidas dan dispersion cerca de 1", () => {
    expect(dispersion([{ org: "a", ms: 100 }, { org: "b", ms: 110 }])).toBeCloseTo(1.1, 5);
  });

  it("una org enorme entre chicas la dispara", () => {
    // Con esto en la mano, el promedio deja de ser el numero a reportar.
    const d = dispersion([
      { org: "arredo", ms: 190_000 },
      { org: "chica", ms: 8_000 },
    ]);
    expect(d).toBeCloseTo(23.75, 2);
  });

  it("sin orgs no explota", () => {
    expect(dispersion([])).toBe(0);
    const t = calcularTecho([], REAL);
    expect(t.techoDeOrgs).toBe(0);
    expect(t.demandaDiariaMs).toBe(0);
  });
});

describe("los tres numeros que circulaban, puestos a prueba con la cuenta", () => {
  // Con los costos que el estudio usó —Arredo 190s en funnel, chicas 8s
  // ESTIMADO— y el presupuesto real que ahora conocemos.
  const comoDecianEnElEstudio = [
    { org: "arredo", ms: 190_000 },
    { org: "c1", ms: 8_000 },
    { org: "c2", ms: 8_000 },
    { org: "c3", ms: 8_000 },
  ];

  it("con E-01 puesto, el pipeline NO se rompe con 10 orgs", () => {
    // El "10 orgs" del estudio venia de que la unidad de trabajo era
    // INDIVISIBLE: si un dia-tabla no entraba en 250s, no entraba nunca.
    // E-01 la hizo divisible, asi que el techo pasa a ser de throughput.
    const t = calcularTecho(comoDecianEnElEstudio, REAL);
    expect(t.ocupacion).toBeLessThan(1);
    expect(t.orgsAdicionales).toBeGreaterThan(6);
  });

  it("pero con clientes tamano Arredo el margen es MUCHO mas chico", () => {
    const t = calcularTecho(comoDecianEnElEstudio, REAL);
    expect(t.techoSiTodasFueranGrandes).toBeLessThan(30);
  });
});
