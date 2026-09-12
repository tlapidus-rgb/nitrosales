import { describe, it, expect } from "vitest";
import {
  costoDeLaLlamada,
  tablaDePrecios,
  convieneRevisarLosPrecios,
  PRECIOS_VERIFICADOS_EL,
} from "./precios-de-modelos";

// ══════════════════════════════════════════════════════════════════════════
// E-21 — el unico componente con costo variable no se podia costear
// ══════════════════════════════════════════════════════════════════════════
// Los tokens estaban desde siempre. Lo que no habia era una tabla de precios
// en NINGUN lado del repo, asi que no habia forma de pasar de tokens a dolares.
// ══════════════════════════════════════════════════════════════════════════

const vacio = {} as unknown as NodeJS.ProcessEnv;

describe("la cuenta", () => {
  it("un millon de tokens de entrada en Haiku son 1 USD", () => {
    const r = costoDeLaLlamada("claude-haiku-4-5", 1_000_000, 0, vacio);
    expect(r.conocido).toBe(true);
    expect(r.usd).toBeCloseTo(1, 6);
  });

  it("y un millon de salida son 5", () => {
    expect(costoDeLaLlamada("claude-haiku-4-5", 0, 1_000_000, vacio).usd).toBeCloseTo(5, 6);
  });

  it("Opus sale 5 veces mas caro que Haiku en entrada, y 5 en salida", () => {
    const haiku = costoDeLaLlamada("claude-haiku-4-5", 1_000_000, 1_000_000, vacio).usd!;
    const opus = costoDeLaLlamada("claude-opus-4-5", 1_000_000, 1_000_000, vacio).usd!;
    expect(opus / haiku).toBeCloseTo(5, 6);
  });

  it("una llamada chica da un numero chico, no cero", () => {
    const r = costoDeLaLlamada("claude-sonnet-4-5", 1_000, 500, vacio);
    expect(r.usd).toBeGreaterThan(0);
    expect(r.usd).toBeLessThan(0.02);
  });

  it("cero tokens cuesta cero, y eso SI es un cero legitimo", () => {
    const r = costoDeLaLlamada("claude-haiku-4-5", 0, 0, vacio);
    expect(r.conocido).toBe(true);
    expect(r.usd).toBe(0);
  });
});

describe("EL PUNTO: un modelo desconocido no vale cero", () => {
  it("devuelve null y `conocido: false`", () => {
    // Un costo de cero es una mentira que ademas da tranquilidad: el total
    // cierra, se ve bien, y esta mal. Tiene que doler para que alguien mire.
    const r = costoDeLaLlamada("claude-opus-9-9", 5_000_000, 5_000_000, vacio);
    expect(r.usd).toBeNull();
    expect(r.conocido).toBe(false);
  });

  it("un string vacio tampoco se cuela", () => {
    expect(costoDeLaLlamada("", 1000, 1000, vacio).conocido).toBe(false);
  });
});

describe("la tabla se puede corregir sin deployar", () => {
  it("PRECIOS_MODELOS_JSON pisa el precio base", () => {
    const env = {
      PRECIOS_MODELOS_JSON: JSON.stringify({ "claude-haiku-4-5": { entrada: 2, salida: 10 } }),
    } as unknown as NodeJS.ProcessEnv;
    expect(costoDeLaLlamada("claude-haiku-4-5", 1_000_000, 0, env).usd).toBeCloseTo(2, 6);
  });

  it("y puede AGREGAR un modelo que la tabla base no conoce", () => {
    // Es el caso que importa: sale un modelo nuevo y el costeo no se cae
    // esperando un deploy.
    const env = {
      PRECIOS_MODELOS_JSON: JSON.stringify({ "modelo-nuevo": { entrada: 7, salida: 21 } }),
    } as unknown as NodeJS.ProcessEnv;
    const r = costoDeLaLlamada("modelo-nuevo", 1_000_000, 0, env);
    expect(r.conocido).toBe(true);
    expect(r.usd).toBeCloseTo(7, 6);
  });

  it("un JSON roto NO tumba el costeo: cae a la tabla base", () => {
    const env = { PRECIOS_MODELOS_JSON: "{ esto no es json" } as unknown as NodeJS.ProcessEnv;
    expect(costoDeLaLlamada("claude-haiku-4-5", 1_000_000, 0, env).usd).toBeCloseTo(1, 6);
  });

  it("una entrada mal tipada se ignora en vez de volverse NaN", () => {
    // Un NaN se propaga hasta el total y lo vuelve ilegible sin decir por que.
    const env = {
      PRECIOS_MODELOS_JSON: JSON.stringify({ "claude-haiku-4-5": { entrada: "dos", salida: 10 } }),
    } as unknown as NodeJS.ProcessEnv;
    const r = costoDeLaLlamada("claude-haiku-4-5", 1_000_000, 0, env);
    expect(Number.isNaN(r.usd)).toBe(false);
    expect(r.usd).toBeCloseTo(1, 6);
  });

  it("un precio negativo tampoco entra", () => {
    const env = {
      PRECIOS_MODELOS_JSON: JSON.stringify({ "claude-haiku-4-5": { entrada: -5, salida: 10 } }),
    } as unknown as NodeJS.ProcessEnv;
    expect(costoDeLaLlamada("claude-haiku-4-5", 1_000_000, 0, env).usd).toBeCloseTo(1, 6);
  });

  it("un JSON que es un array no rompe nada", () => {
    const env = { PRECIOS_MODELOS_JSON: "[1,2,3]" } as unknown as NodeJS.ProcessEnv;
    expect(tablaDePrecios(env)["claude-haiku-4-5"].entrada).toBe(1);
  });
});

describe("la tabla dice cuando se verifico, y avisa cuando envejece", () => {
  it("lleva una fecha de verificacion", () => {
    expect(PRECIOS_VERIFICADOS_EL).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("recien verificada, no pide revision", () => {
    const alDiaSiguiente = new Date(`${PRECIOS_VERIFICADOS_EL}T00:00:00Z`);
    alDiaSiguiente.setUTCDate(alDiaSiguiente.getUTCDate() + 1);
    expect(convieneRevisarLosPrecios(alDiaSiguiente)).toBe(false);
  });

  it("a los 200 dias SI pide revision", () => {
    // Los precios los pone Anthropic y cambian. Una tabla que nadie vuelve a
    // mirar envejece sin ningun sintoma: un numero equivocado se ve igual de
    // convincente que uno correcto. Es el patron de E-26.
    const tarde = new Date(`${PRECIOS_VERIFICADOS_EL}T00:00:00Z`);
    tarde.setUTCDate(tarde.getUTCDate() + 200);
    expect(convieneRevisarLosPrecios(tarde)).toBe(true);
  });
});

describe("el id con fecha de Haiku vale lo mismo que el id corto", () => {
  it("porque `chat/route.ts` loguea el largo", () => {
    const corto = costoDeLaLlamada("claude-haiku-4-5", 1_000_000, 1_000_000, vacio).usd;
    const largo = costoDeLaLlamada("claude-haiku-4-5-20251001", 1_000_000, 1_000_000, vacio).usd;
    expect(largo).toBe(corto);
  });
});
