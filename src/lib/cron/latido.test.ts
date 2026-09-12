import { describe, it, expect } from "vitest";
import { cadaCuantosMinutos, cronesAtrasados } from "./latido";
import type { Latido } from "./latido";

// ══════════════════════════════════════════════════════════════════════════
// E-20 — "el cron deja de existir"
// ══════════════════════════════════════════════════════════════════════════
// El modo de falla más caro de la historia de este producto no es que un cron
// explote —eso deja un 5XX— sino que deje de correr. `refresh-pixel-first-source`
// estuvo CINCO SEMANAS fuera de vercel.json y nadie se enteró.
//
// `checkPipelineFreshness` lo detecta de rebote, mirando si las tablas que el
// cron escribe se quedaron viejas. Eso deja afuera a todos los crons cuyo
// trabajo no termina en una tabla vigilada — que son justo los que le hablan al
// cliente: digest, anomalies, ads-utm-audit, control-alerts, alertas-clientes.
// ══════════════════════════════════════════════════════════════════════════

describe("cadaCuantosMinutos", () => {
  it("cada minuto", () => {
    expect(cadaCuantosMinutos("* * * * *")).toBe(1);
  });

  it("con paso", () => {
    expect(cadaCuantosMinutos("*/5 * * * *")).toBe(5);
    expect(cadaCuantosMinutos("*/15 * * * *")).toBe(15);
  });

  it("una vez por hora, y dos veces por hora", () => {
    expect(cadaCuantosMinutos("41 * * * *")).toBe(60);
    expect(cadaCuantosMinutos("11,41 * * * *")).toBe(30);
  });

  it("una vez por día", () => {
    expect(cadaCuantosMinutos("0 9 * * *")).toBe(24 * 60);
  });

  it("semanal", () => {
    // El digest: lunes a las 10.
    expect(cadaCuantosMinutos("0 10 * * 1")).toBe(7 * 24 * 60);
  });

  it("lo que no entiende devuelve null, en vez de inventar una cadencia", () => {
    // Inventar significaría alertar de más sobre un cron que quizá está bien.
    expect(cadaCuantosMinutos("0 0 1 * *")).not.toBeNull(); // mensual sí se entiende
    expect(cadaCuantosMinutos("raro")).toBeNull();
    expect(cadaCuantosMinutos("0 9-17 * * *")).toBeNull(); // rango: no se soporta
    expect(cadaCuantosMinutos("")).toBeNull();
  });
});

const AHORA = new Date("2026-09-12T12:00:00Z");
const haceMin = (m: number) => new Date(AHORA.getTime() - m * 60_000);

const latido = (cron: string, min: number | null, ok: boolean | null = true): Latido => ({
  cron,
  ultimaCorrida: min === null ? null : haceMin(min),
  ultimaOk: ok,
  ultimoError: ok === false ? "boom" : null,
});

describe("cronesAtrasados", () => {
  it("un cron que corre a tiempo no se reporta", () => {
    const r = cronesAtrasados([latido("warm-cache", 3)], { "warm-cache": "*/5 * * * *" }, AHORA);
    expect(r).toEqual([]);
  });

  it("EL CASO DE LAS CINCO SEMANAS: un cron desagendado se detecta", () => {
    const r = cronesAtrasados(
      [latido("refresh-pixel-first-source", 5 * 7 * 24 * 60)],
      { "refresh-pixel-first-source": "0 9 * * *" },
      AHORA,
    );
    expect(r).toHaveLength(1);
    expect(r[0].motivo).toBe("atrasado");
    expect(r[0].detalle).toContain("vercel.json");
  });

  it("tolera una corrida perdida sin gritar", () => {
    // Tres veces la cadencia: un deploy o un skip de Vercel no puede encender
    // una alarma, porque una alarma que salta sola deja de leerse.
    const r = cronesAtrasados([latido("x", 100)], { x: "0 * * * *" }, AHORA);
    expect(r).toEqual([]);
  });

  it("pero a las cuatro cadencias sí", () => {
    const r = cronesAtrasados([latido("x", 250)], { x: "0 * * * *" }, AHORA);
    expect(r).toHaveLength(1);
  });

  it("un cron de cada minuto no se reporta por un retraso de segundos", () => {
    // Vercel no garantiza puntualidad al minuto. Sin el piso, el cron del
    // backfill-runner estaría en rojo permanente.
    const r = cronesAtrasados([latido("runner", 5)], { runner: "* * * * *" }, AHORA);
    expect(r).toEqual([]);
  });

  it("nunca latió NO es lo mismo que caído", () => {
    // Si lo tratáramos como caído, el primer deploy encendería todas las
    // alarmas a la vez y nadie las volvería a mirar.
    const r = cronesAtrasados([], { x: "0 * * * *" }, AHORA);
    expect(r).toHaveLength(1);
    expect(r[0].motivo).toBe("nunca-latio");
    expect(r[0].haceMin).toBeNull();
  });

  it("un cron que corre pero falla también se reporta, con el error", () => {
    const r = cronesAtrasados([latido("x", 5, false)], { x: "0 * * * *" }, AHORA);
    expect(r).toHaveLength(1);
    expect(r[0].motivo).toBe("ultima-fallo");
    expect(r[0].detalle).toContain("boom");
  });

  it("atrasado gana sobre falló: primero hay que saber que no corre", () => {
    const r = cronesAtrasados([latido("x", 9999, false)], { x: "0 * * * *" }, AHORA);
    expect(r[0].motivo).toBe("atrasado");
  });

  it("un schedule que no se entiende no genera alerta", () => {
    const r = cronesAtrasados([], { x: "0 9-17 * * *" }, AHORA);
    expect(r).toEqual([]);
  });

  it("varios crons: se reportan sólo los que están mal", () => {
    const r = cronesAtrasados(
      [latido("bien", 2), latido("mal", 9999), latido("roto", 2, false)],
      { bien: "*/5 * * * *", mal: "*/5 * * * *", roto: "*/5 * * * *" },
      AHORA,
    );
    expect(r.map((c) => c.cron).sort()).toEqual(["mal", "roto"]);
  });

  it("un latido de un cron que ya no está en vercel.json se ignora", () => {
    // Si alguien saca un cron a propósito, su latido viejo no puede alertar
    // para siempre.
    const r = cronesAtrasados([latido("borrado", 9999)], {}, AHORA);
    expect(r).toEqual([]);
  });
});
