import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// ══════════════════════════════════════════════════════════════════════════
// E-02 — el orden de las organizaciones en el backfill de rollups
// ══════════════════════════════════════════════════════════════════════════
// El bug: la lista salía `ORDER BY 1` sobre `organizationId`. Los cuid son
// ordenables por tiempo de creación, así que eso ordenaba de cliente MÁS VIEJO a
// MÁS NUEVO. Cuando el presupuesto se acababa a mitad de la lista, el que
// quedaba sin procesar era SIEMPRE el mismo: el cliente recién firmado. Abría la
// app y la veía vacía, todos los días, hasta que alguien mirara.
//
// El orden nuevo es por atraso del rollup (más atrasado primero). Es
// auto-correctivo: la org que se saltea una corrida queda más atrasada y pasa
// primera en la siguiente. No necesita persistir un cursor entre invocaciones —
// que es la parte cara hoy, porque ~30 tablas de producción ya viven fuera de
// `schema.prisma` y agregar una más es exactamente lo que el plan dice evitar.
//
// La query se prueba contra Postgres de verdad (PGlite) y no con un mock: lo que
// puede fallar acá es el SQL (NULLS FIRST, el LEFT JOIN, el GROUP BY), no la
// lógica de JS.
// ══════════════════════════════════════════════════════════════════════════

// Copia textual de la query de `runRollupBackfill`. Si una cambia y la otra no,
// este test deja de proteger nada — por eso está el guard de abajo.
const ORDER_QUERY = `SELECT f."organizationId" org, MAX(a.day) AS last_day
       FROM (SELECT DISTINCT "organizationId" FROM pixel_visitor_first_source) f
       LEFT JOIN pixel_daily_aggregates a ON a."organizationId" = f."organizationId"
      GROUP BY f."organizationId"
      ORDER BY MAX(a.day) ASC NULLS FIRST, f."organizationId" ASC`;

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE pixel_visitor_first_source ("organizationId" text);
    CREATE TABLE pixel_daily_aggregates ("organizationId" text, day date);
  `);
});

async function orden(): Promise<string[]> {
  const r = await db.query<{ org: string }>(ORDER_QUERY);
  return r.rows.map((x) => x.org);
}

describe("E-02 — orden de organizaciones por atraso del rollup", () => {
  it("la org SIN rollup va primera (es el cliente recién onboardeado)", async () => {
    // cuid_a es el más viejo, cuid_z el más nuevo. Con el orden viejo (ORDER BY 1)
    // cuid_z quedaba último SIEMPRE.
    await db.exec(`
      INSERT INTO pixel_visitor_first_source VALUES ('cuid_a'),('cuid_m'),('cuid_z');
      INSERT INTO pixel_daily_aggregates VALUES
        ('cuid_a','2026-09-04'), ('cuid_m','2026-09-04');
    `);

    const o = await orden();
    expect(o[0]).toBe("cuid_z");
    // Y con el orden viejo habría sido el último:
    expect([...o].sort()).toEqual(["cuid_a", "cuid_m", "cuid_z"]);
  });

  it("entre orgs con rollup, primero la más atrasada", async () => {
    await db.exec(`
      INSERT INTO pixel_visitor_first_source VALUES ('cuid_a'),('cuid_b'),('cuid_c');
      INSERT INTO pixel_daily_aggregates VALUES
        ('cuid_a','2026-09-04'),
        ('cuid_b','2026-09-01'),
        ('cuid_c','2026-09-03');
    `);

    expect(await orden()).toEqual(["cuid_b", "cuid_c", "cuid_a"]);
  });

  it("ES AUTO-CORRECTIVO: la que se saltea pasa primera en la corrida siguiente", async () => {
    // Dos orgs al día, una tercera recién entrada sin rollup.
    await db.exec(`
      INSERT INTO pixel_visitor_first_source VALUES ('cuid_a'),('cuid_b'),('cuid_nueva');
      INSERT INTO pixel_daily_aggregates VALUES
        ('cuid_a','2026-09-04'), ('cuid_b','2026-09-04');
    `);

    // Corrida 1: con presupuesto para UNA sola, se procesa la nueva.
    const corrida1 = (await orden())[0];
    expect(corrida1).toBe("cuid_nueva");
    await db.exec(
      `INSERT INTO pixel_daily_aggregates VALUES ('cuid_nueva','2026-09-04')`
    );

    // Corrida 2: ya no es la más atrasada — le toca a otra. Nadie monopoliza.
    const corrida2 = (await orden())[0];
    expect(corrida2).not.toBe("cuid_nueva");
  });

  it("empate de atraso → desempata por id, para que el orden sea determinista", async () => {
    await db.exec(`
      INSERT INTO pixel_visitor_first_source VALUES ('cuid_c'),('cuid_a'),('cuid_b');
      INSERT INTO pixel_daily_aggregates VALUES
        ('cuid_a','2026-09-04'), ('cuid_b','2026-09-04'), ('cuid_c','2026-09-04');
    `);

    expect(await orden()).toEqual(["cuid_a", "cuid_b", "cuid_c"]);
    // Determinista: dos llamadas dan lo mismo.
    expect(await orden()).toEqual(await orden());
  });

  it("no duplica organizaciones aunque tengan muchos días de rollup", async () => {
    await db.exec(`
      INSERT INTO pixel_visitor_first_source VALUES ('cuid_a'),('cuid_a'),('cuid_b');
      INSERT INTO pixel_daily_aggregates VALUES
        ('cuid_a','2026-09-01'), ('cuid_a','2026-09-02'), ('cuid_a','2026-09-03');
    `);

    const o = await orden();
    expect(o).toHaveLength(2);
    expect(new Set(o).size).toBe(2);
    // cuid_b no tiene rollup → va primera.
    expect(o[0]).toBe("cuid_b");
  });
});

describe("E-02 — guard: la query del test es la misma que la del código", () => {
  it("`rollup-backfill.ts` usa exactamente esta query de orden", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src", "lib", "pixel", "rollup-backfill.ts"),
      "utf8"
    );
    // Si alguien toca el ORDER BY del código sin tocar el test, esto avisa: si no,
    // el test seguiría en verde probando una query que ya no existe.
    expect(src).toContain(`ORDER BY MAX(a.day) ASC NULLS FIRST, f."organizationId" ASC`);
    expect(src).toContain(`LEFT JOIN pixel_daily_aggregates a`);
    // Y el orden viejo no debe volver.
    expect(src).not.toContain(
      `SELECT DISTINCT "organizationId" org FROM pixel_visitor_first_source ORDER BY 1`
    );
  });
});
