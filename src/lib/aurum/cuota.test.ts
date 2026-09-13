import { describe, it, expect } from "vitest";
import {
  evaluarCuota,
  limitesDeAurum,
  TOPE_USD_MENSUAL_POR_DEFECTO,
  CONSULTAS_POR_MINUTO_POR_DEFECTO,
} from "./cuota";
import type { ModoDeAurum } from "./cuota";

// ══════════════════════════════════════════════════════════════════════════
// E-23 — el unico componente con costo variable sin techo
// ══════════════════════════════════════════════════════════════════════════
// El modo DEEP (Opus, 8 rondas) lo elige el cliente desde la UI, /api/chat no
// tenia cuota ni rate limit, y hasta E-21 ni siquiera se podia saber cuanto
// costaba. Las tres cosas juntas son un gasto cuyo unico techo es la buena fe.
//
// La decision de diseno que ordena todos estos tests: DEGRADAR, NO BLOQUEAR.
// Un cliente que paga y recibe "alcanzaste tu limite" pierde el producto
// entero por una variable de entorno.
// ══════════════════════════════════════════════════════════════════════════

const limites = { topeUsdMensual: 100, consultasPorMinuto: 20 };

const evaluar = (
  modoPedido: ModoDeAurum,
  usdDelMes: number | null,
  consultasUltimoMinuto: number | null = 0,
) => evaluarCuota({ modoPedido, consumo: { usdDelMes, consultasUltimoMinuto }, limites });

describe("el caso normal — muy por debajo del tope", () => {
  it("no toca nada y no dice nada", () => {
    const r = evaluar("DEEP", 5);
    expect(r.permitido).toBe(true);
    expect(r.modoEfectivo).toBe("DEEP");
    expect(r.degradado).toBe(false);
    expect(r.motivo).toBeNull();
    expect(r.cercaDelTope).toBe(false);
  });

  it("con cero gastado, tampoco", () => {
    expect(evaluar("DEEP", 0).motivo).toBeNull();
  });
});

describe("EL PUNTO: pasado el tope se degrada, no se bloquea", () => {
  it("DEEP cae a FLASH y la consulta SIGUE permitida", () => {
    const r = evaluar("DEEP", 150);
    expect(r.permitido).toBe(true);
    expect(r.modoEfectivo).toBe("FLASH");
    expect(r.degradado).toBe(true);
  });

  it("CORE tambien cae a FLASH", () => {
    const r = evaluar("CORE", 150);
    expect(r.modoEfectivo).toBe("FLASH");
    expect(r.degradado).toBe(true);
  });

  it("y SE LO DICE, nombrando el modo que pidio", () => {
    // Degradar en silencio es el patron que venimos arreglando toda la branch:
    // el usuario veria respuestas peores sin saber por que, y culparia al
    // producto en vez de al tope.
    const r = evaluar("DEEP", 150);
    expect(r.motivo).toContain("DEEP");
    expect(r.motivo).toMatch(/modo rapido|modo rápido/i);
    expect(r.motivo).toMatch(/seguís teniendo|seguis teniendo/i);
  });

  it("justo EN el tope ya degrada: el limite es alcanzarlo, no pasarlo", () => {
    expect(evaluar("DEEP", 100).degradado).toBe(true);
  });

  it("un centavo por debajo todavia no", () => {
    expect(evaluar("DEEP", 99.99).degradado).toBe(false);
  });

  it("si YA venia en FLASH, no figura degradado — no se le bajo nada", () => {
    // Marcarlo como degradado haria que la UI mostrara "te bajamos el modo" a
    // alguien al que no le bajaron nada.
    const r = evaluar("FLASH", 150);
    expect(r.modoEfectivo).toBe("FLASH");
    expect(r.degradado).toBe(false);
    expect(r.motivo).toBeTruthy(); // pero igual explica por que
  });
});

describe("avisa ANTES de degradar", () => {
  it("al 70% avisa sin tocar el modo", () => {
    const r = evaluar("DEEP", 70);
    expect(r.modoEfectivo).toBe("DEEP");
    expect(r.degradado).toBe(false);
    expect(r.cercaDelTope).toBe(true);
    expect(r.motivo).toContain("70");
  });

  it("al 69% todavia no dice nada", () => {
    expect(evaluar("DEEP", 69).motivo).toBeNull();
  });

  it("el aviso adelanta que despues sigue andando, no que se corta", () => {
    // Que el modo se caiga de un request al siguiente sin senal previa se lee
    // como que el producto se rompio.
    const r = evaluar("DEEP", 85);
    expect(r.motivo).toMatch(/sigue andando/i);
    expect(r.motivo).toContain("85");
  });
});

describe("el freno del loop va primero que el tope", () => {
  it("pasado el rate limit, NO se contesta", () => {
    // Aca si se bloquea: no es un cliente trabajando, es codigo en loop.
    const r = evaluar("FLASH", 0, 20);
    expect(r.permitido).toBe(false);
  });

  it("y el mensaje dice cuantas fueron y que hacer", () => {
    const r = evaluar("FLASH", 0, 25);
    expect(r.motivo).toContain("25");
    expect(r.motivo).toMatch(/esperá|espera/i);
  });

  it("19 consultas todavia pasan", () => {
    expect(evaluar("FLASH", 0, 19).permitido).toBe(true);
  });

  it("gana sobre el tope: si esta en loop, eso es lo urgente", () => {
    // El tope mensual todavia no se entero del loop — se va a enterar en unos
    // minutos, cuando ya gasto.
    const r = evaluar("DEEP", 500, 50);
    expect(r.permitido).toBe(false);
    expect(r.motivo).toMatch(/último minuto|ultimo minuto/i);
  });
});

describe("fail-open: sin medicion se deja pasar", () => {
  it("usd en null no degrada nada", () => {
    // Bloquear el producto porque una query de telemetria fallo es peor que el
    // gasto que evita. Misma regla que E-13 para las credenciales.
    const r = evaluar("DEEP", null);
    expect(r.permitido).toBe(true);
    expect(r.modoEfectivo).toBe("DEEP");
    expect(r.motivo).toBeNull();
  });

  it("pero lo MARCA, porque una caida de la base tambien es gasto sin techo", () => {
    expect(evaluar("DEEP", null).medicionDisponible).toBe(false);
  });

  it("cuando si se midio, queda marcado como disponible", () => {
    expect(evaluar("DEEP", 10).medicionDisponible).toBe(true);
  });

  it("consultas en null tampoco bloquea", () => {
    expect(evaluar("DEEP", 10, null).permitido).toBe(true);
  });
});

describe("los limites salen del entorno, con defaults sanos", () => {
  const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;

  it("sin variables, usa los defaults", () => {
    const l = limitesDeAurum(env({}));
    expect(l.topeUsdMensual).toBe(TOPE_USD_MENSUAL_POR_DEFECTO);
    expect(l.consultasPorMinuto).toBe(CONSULTAS_POR_MINUTO_POR_DEFECTO);
  });

  it("las lee cuando estan", () => {
    const l = limitesDeAurum(env({ AURUM_TOPE_USD_MENSUAL: "250", AURUM_CONSULTAS_POR_MINUTO: "5" }));
    expect(l.topeUsdMensual).toBe(250);
    expect(l.consultasPorMinuto).toBe(5);
  });

  it("UN VALOR MAL ESCRITO CAE AL DEFAULT, no a NaN", () => {
    // Un NaN haria que toda comparacion diera false y el tope no existiera:
    // el modo de falla mas silencioso posible para un control de gasto.
    const l = limitesDeAurum(env({ AURUM_TOPE_USD_MENSUAL: "cien" }));
    expect(l.topeUsdMensual).toBe(TOPE_USD_MENSUAL_POR_DEFECTO);
  });

  it("un cero o un negativo tampoco pasan", () => {
    expect(limitesDeAurum(env({ AURUM_TOPE_USD_MENSUAL: "0" })).topeUsdMensual).toBe(
      TOPE_USD_MENSUAL_POR_DEFECTO,
    );
    expect(limitesDeAurum(env({ AURUM_CONSULTAS_POR_MINUTO: "-3" })).consultasPorMinuto).toBe(
      CONSULTAS_POR_MINUTO_POR_DEFECTO,
    );
  });

  it("un string vacio en Vercel cae al default", () => {
    expect(limitesDeAurum(env({ AURUM_TOPE_USD_MENSUAL: "" })).topeUsdMensual).toBe(
      TOPE_USD_MENSUAL_POR_DEFECTO,
    );
  });

  it("un tope subido de verdad corre el umbral", () => {
    const l = limitesDeAurum(env({ AURUM_TOPE_USD_MENSUAL: "1000" }));
    const r = evaluarCuota({
      modoPedido: "DEEP",
      consumo: { usdDelMes: 150, consultasUltimoMinuto: 0 },
      limites: l,
    });
    expect(r.degradado).toBe(false);
  });
});
