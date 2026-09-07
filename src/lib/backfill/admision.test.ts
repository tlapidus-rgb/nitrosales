import { describe, it, expect } from "vitest";
import {
  parseVentana,
  dentroDeVentana,
  horaArgentina,
  decidirAdmision,
  seguirEnElLoop,
  maxConcurrentes,
  latenciaMaxMs,
  MAX_CONCURRENTES_DEFAULT,
  LATENCIA_MAX_MS_DEFAULT,
} from "./admision";

// ══════════════════════════════════════════════════════════════════════════
// E-08 — el alta de un cliente nuevo no puede tumbar a los que ya están
// ══════════════════════════════════════════════════════════════════════════
// `backfill-runner` corre cada minuto con maxDuration=300 → hasta 5 lambdas
// solapadas, cada una tomando un job distinto y corriéndolos en paralelo contra
// la misma base. El backfill de Arredo (252.701 órdenes) tumbó Neon repetidas
// veces así.
//
// Acá se testea la lógica de admisión pura. El claim atómico, que es la otra
// mitad del arreglo, se testea contra Postgres en `job-claim.test.ts`.
// ══════════════════════════════════════════════════════════════════════════

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;

describe("parseVentana", () => {
  it("lee el formato desde-hasta", () => {
    expect(parseVentana(env({ BACKFILL_VENTANA: "1-7" }))).toEqual({ desde: 1, hasta: 7 });
    expect(parseVentana(env({ BACKFILL_VENTANA: " 22 - 6 " }))).toEqual({ desde: 22, hasta: 6 });
  });

  it("sin configurar = sin restricción", () => {
    expect(parseVentana(env({}))).toBeNull();
    expect(parseVentana(env({ BACKFILL_VENTANA: "" }))).toBeNull();
  });

  it("un valor mal escrito NO congela el backfill: se trata como sin restricción", () => {
    // Es la decisión importante del parser. Si un typo lo dejara "siempre fuera
    // de ventana", el alta de un cliente se quedaría en QUEUED para siempre y
    // nadie se enteraría hasta que el cliente reclame.
    for (const v of ["mañana", "1a7", "25-3", "1-99", "-", "7", "1-7-9", "-1-7"]) {
      expect(parseVentana(env({ BACKFILL_VENTANA: v }))).toBeNull();
    }
  });

  it("desde == hasta se trata como sin restricción, no como ventana vacía", () => {
    expect(parseVentana(env({ BACKFILL_VENTANA: "3-3" }))).toBeNull();
  });
});

describe("dentroDeVentana", () => {
  /** Un instante cuya hora ARGENTINA es la pedida. AR es UTC-3 todo el año. */
  const aLaHoraAr = (h: number) =>
    new Date(Date.UTC(2026, 8, 15, (h + 3) % 24, 30, 0));

  it("sin ventana, siempre pasa", () => {
    for (let h = 0; h < 24; h++) expect(dentroDeVentana(aLaHoraAr(h), null)).toBe(true);
  });

  it("el helper del test arma bien la hora argentina", () => {
    for (const h of [0, 3, 12, 23]) expect(horaArgentina(aLaHoraAr(h))).toBe(h);
  });

  it("ventana normal 1-7: adentro de 1 a 6, afuera el resto", () => {
    const v = { desde: 1, hasta: 7 };
    for (const h of [1, 2, 5, 6]) expect(dentroDeVentana(aLaHoraAr(h), v)).toBe(true);
    for (const h of [0, 7, 8, 15, 23]) expect(dentroDeVentana(aLaHoraAr(h), v)).toBe(false);
  });

  it("ventana que da la vuelta al día 22-6: cubre la medianoche", () => {
    const v = { desde: 22, hasta: 6 };
    for (const h of [22, 23, 0, 3, 5]) expect(dentroDeVentana(aLaHoraAr(h), v)).toBe(true);
    for (const h of [6, 7, 12, 21]) expect(dentroDeVentana(aLaHoraAr(h), v)).toBe(false);
  });
});

describe("defaults: lo que puede demorar va prendido, la política va apagada", () => {
  it("hay un límite de concurrencia aunque nadie configure nada", () => {
    expect(maxConcurrentes(env({}))).toBe(MAX_CONCURRENTES_DEFAULT);
    expect(MAX_CONCURRENTES_DEFAULT).toBe(1);
  });

  it("hay un freno por latencia aunque nadie configure nada", () => {
    expect(latenciaMaxMs(env({}))).toBe(LATENCIA_MAX_MS_DEFAULT);
  });

  it("la ventana horaria, en cambio, NO se activa sola", () => {
    // Prenderla por default cambiaría el comportamiento del alta sin que nadie
    // lo haya pedido: un alta aprobada a las 3 de la tarde arrancaría de noche.
    expect(parseVentana(env({}))).toBeNull();
  });

  it("valores inválidos caen al default en vez de dejar todo en cero", () => {
    for (const v of ["0", "-3", "abc", ""]) {
      expect(maxConcurrentes(env({ BACKFILL_MAX_CONCURRENTES: v }))).toBe(1);
      expect(latenciaMaxMs(env({ BACKFILL_LATENCIA_MAX_MS: v }))).toBe(LATENCIA_MAX_MS_DEFAULT);
    }
  });

  it("un valor válido sí manda", () => {
    expect(maxConcurrentes(env({ BACKFILL_MAX_CONCURRENTES: "3" }))).toBe(3);
    expect(latenciaMaxMs(env({ BACKFILL_LATENCIA_MAX_MS: "500" }))).toBe(500);
  });
});

describe("decidirAdmision", () => {
  const base = {
    now: new Date(Date.UTC(2026, 8, 15, 7, 0, 0)), // 04:00 AR
    ventana: null as null | { desde: number; hasta: number },
    jobsActivos: 0,
    maxConcurrentes: 1,
    latenciaMs: 50,
    latenciaMaxMs: 2000,
  };

  it("con todo en orden, admite", () => {
    expect(decidirAdmision(base)).toEqual({ admitido: true });
  });

  it("EL CASO DE ARREDO: si ya hay un backfill corriendo, no arranca otro", () => {
    const d = decidirAdmision({ ...base, jobsActivos: 1 });
    expect(d.admitido).toBe(false);
    expect(d).toMatchObject({ motivo: "otro-backfill-corriendo" });
  });

  it("DOS CLIENTES LA MISMA SEMANA: el segundo espera, no compite", () => {
    // Es el escenario que el plan pide cubrir explícitamente.
    const primero = decidirAdmision({ ...base, jobsActivos: 0 });
    expect(primero.admitido).toBe(true);
    const segundo = decidirAdmision({ ...base, jobsActivos: 1 });
    expect(segundo.admitido).toBe(false);
  });

  it("si la base está lenta, frena", () => {
    const d = decidirAdmision({ ...base, latenciaMs: 2500 });
    expect(d.admitido).toBe(false);
    expect(d).toMatchObject({ motivo: "base-lenta", detalle: { latenciaMs: 2500 } });
  });

  it("justo en el umbral todavía pasa (el freno es estricto mayor)", () => {
    expect(decidirAdmision({ ...base, latenciaMs: 2000 }).admitido).toBe(true);
    expect(decidirAdmision({ ...base, latenciaMs: 2001 }).admitido).toBe(false);
  });

  it("fuera de la ventana horaria, frena", () => {
    // 04:00 AR con ventana 9-18.
    const d = decidirAdmision({ ...base, ventana: { desde: 9, hasta: 18 } });
    expect(d.admitido).toBe(false);
    expect(d).toMatchObject({ motivo: "fuera-de-ventana", detalle: { horaAr: 4 } });
  });

  it("?ignorarVentana=1 saltea la ventana pero NO los frenos de capacidad", () => {
    const v = { desde: 9, hasta: 18 };
    expect(decidirAdmision({ ...base, ventana: v, ignorarVentana: true }).admitido).toBe(true);
    // El override es para "necesito que arranque ahora", no para atropellar la base.
    expect(
      decidirAdmision({ ...base, ventana: v, ignorarVentana: true, jobsActivos: 1 }).admitido,
    ).toBe(false);
    expect(
      decidirAdmision({ ...base, ventana: v, ignorarVentana: true, latenciaMs: 9000 }).admitido,
    ).toBe(false);
  });

  it("el motivo que devuelve es el que realmente frenó", () => {
    // Con varias condiciones en rojo, gana la política antes que la capacidad:
    // así el operador ve primero lo que él configuró.
    const d = decidirAdmision({
      ...base,
      ventana: { desde: 9, hasta: 18 },
      jobsActivos: 5,
      latenciaMs: 9000,
    });
    expect(d).toMatchObject({ motivo: "fuera-de-ventana" });
  });
});

describe("seguirEnElLoop — entre chunk y chunk", () => {
  it("sólo mira la latencia", () => {
    expect(seguirEnElLoop({ latenciaMs: 100, latenciaMaxMs: 2000 }).admitido).toBe(true);
  });

  it("si la base se degrada mientras corremos, suelta", () => {
    const d = seguirEnElLoop({ latenciaMs: 5000, latenciaMaxMs: 2000 });
    expect(d.admitido).toBe(false);
    expect(d).toMatchObject({ motivo: "base-lenta" });
  });
});
