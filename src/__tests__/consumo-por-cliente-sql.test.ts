import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  ORDENES_POR_ORG,
  SKUS_POR_ORG,
  INTEGRACIONES_POR_ORG,
  EVENTOS_PIXEL_POR_ORG,
  USUARIOS_POR_ORG,
  AURUM_AGRUPADO,
  AURUM_DEL_MES_DE_UNA_ORG,
  AURUM_ULTIMO_MINUTO_DE_UNA_ORG,
} from "@/lib/costos/consultas";
import { costoDeAurum } from "@/lib/costos/consumo-por-cliente";

// ══════════════════════════════════════════════════════════════════════════
// E-21 — el SQL del reporte de consumo, EJECUTADO
// ══════════════════════════════════════════════════════════════════════════
// Este reporte termina en una factura. Assertear subcadenas del SQL no alcanza:
// un cast mal puesto, un GROUP BY que agrupa de mas o un filtro que cuenta
// ordenes canceladas no se ven leyendo el string — se ven corriendo la query.
//
// Corre contra Postgres real (PGlite), igual que silver-orders-sql.test.ts.
// ══════════════════════════════════════════════════════════════════════════

const DDL = `
CREATE TABLE orders (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "orderDate" timestamptz NOT NULL,
  status text NOT NULL,
  "totalValue" numeric NOT NULL
);
CREATE TABLE products (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true
);
CREATE TABLE connections (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL,
  status text NOT NULL
);
CREATE TABLE users (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL
);
CREATE TABLE pixel_daily_aggregates (
  "organizationId" text NOT NULL,
  day date NOT NULL,
  total_events bigint NOT NULL DEFAULT 0,
  PRIMARY KEY ("organizationId", day)
);
CREATE TABLE aurum_usage_logs (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL,
  mode text NOT NULL,
  model text NOT NULL,
  "inputTokens" int NOT NULL DEFAULT 0,
  "outputTokens" int NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
`;

const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000);
const DESDE = diasAtras(30);

async function db() {
  const d = await PGlite.create();
  await d.exec(DDL);
  return d;
}

const filas = async <T>(d: PGlite, sql: string, params: unknown[] = []): Promise<T[]> =>
  (await d.query<T>(sql, params)).rows;

type Conteo = { organizationId: string; n: number };

describe("ordenes — respeta el contrato de venta valida", () => {
  it("cuenta las concretadas y agrupa por organizacion", async () => {
    const d = await db();
    await d.query(
      `INSERT INTO orders VALUES
        ('o1','orgA',$1,'INVOICED',1000),
        ('o2','orgA',$1,'APPROVED',2000),
        ('o3','orgB',$1,'INVOICED',500)`,
      [diasAtras(5)],
    );
    const r = await filas<Conteo>(d, ORDENES_POR_ORG, [DESDE]);
    const m = new Map(r.map((x) => [x.organizationId, Number(x.n)]));
    expect(m.get("orgA")).toBe(2);
    expect(m.get("orgB")).toBe(1);
  });

  it("NO cuenta canceladas, pendientes ni devueltas", async () => {
    // Si las contara, se le facturaria al cliente por ventas que no existieron.
    const d = await db();
    await d.query(
      `INSERT INTO orders VALUES
        ('o1','orgA',$1,'CANCELLED',1000),
        ('o2','orgA',$1,'PENDING',1000),
        ('o3','orgA',$1,'RETURNED',1000),
        ('o4','orgA',$1,'INVOICED',1000)`,
      [diasAtras(5)],
    );
    const r = await filas<Conteo>(d, ORDENES_POR_ORG, [DESDE]);
    expect(Number(r[0].n)).toBe(1);
  });

  it("tampoco cuenta una orden de valor cero", async () => {
    const d = await db();
    await d.query(`INSERT INTO orders VALUES ('o1','orgA',$1,'INVOICED',0)`, [diasAtras(5)]);
    expect(await filas(d, ORDENES_POR_ORG, [DESDE])).toEqual([]);
  });

  it("y respeta el periodo: una orden vieja queda afuera", async () => {
    const d = await db();
    await d.query(
      `INSERT INTO orders VALUES ('o1','orgA',$1,'INVOICED',1000),('o2','orgA',$2,'INVOICED',1000)`,
      [diasAtras(5), diasAtras(90)],
    );
    const r = await filas<Conteo>(d, ORDENES_POR_ORG, [DESDE]);
    expect(Number(r[0].n)).toBe(1);
  });

  it("una org sin ordenes NO aparece — el endpoint la lee como cero real", async () => {
    const d = await db();
    expect(await filas(d, ORDENES_POR_ORG, [DESDE])).toEqual([]);
  });
});

describe("las dimensiones de foto — SKUs, integraciones, usuarios", () => {
  it("SKUs cuenta solo los activos", async () => {
    const d = await db();
    await d.query(
      `INSERT INTO products VALUES ('p1','orgA',true),('p2','orgA',false),('p3','orgA',true)`,
    );
    const r = await filas<Conteo>(d, SKUS_POR_ORG);
    expect(Number(r[0].n)).toBe(2);
  });

  it("integraciones cuenta solo las ACTIVE", async () => {
    const d = await db();
    await d.query(
      `INSERT INTO connections VALUES ('c1','orgA','ACTIVE'),('c2','orgA','PENDING'),('c3','orgA','ACTIVE')`,
    );
    const r = await filas<Conteo>(d, INTEGRACIONES_POR_ORG);
    expect(Number(r[0].n)).toBe(2);
  });

  it("usuarios cuenta todos, y separa por organizacion", async () => {
    const d = await db();
    await d.query(`INSERT INTO users VALUES ('u1','orgA'),('u2','orgA'),('u3','orgB')`);
    const m = new Map(
      (await filas<Conteo>(d, USUARIOS_POR_ORG)).map((x) => [x.organizationId, Number(x.n)]),
    );
    expect(m.get("orgA")).toBe(2);
    expect(m.get("orgB")).toBe(1);
  });
});

describe("eventos de pixel — suma del rollup diario", () => {
  it("suma los dias del periodo", async () => {
    const d = await db();
    await d.query(
      `INSERT INTO pixel_daily_aggregates VALUES ('orgA',$1::date,100),('orgA',$2::date,250)`,
      [diasAtras(2), diasAtras(3)],
    );
    const r = await filas<Conteo>(d, EVENTOS_PIXEL_POR_ORG, [DESDE]);
    expect(Number(r[0].n)).toBe(350);
  });

  it("deja afuera los dias anteriores al periodo", async () => {
    const d = await db();
    await d.query(
      `INSERT INTO pixel_daily_aggregates VALUES ('orgA',$1::date,100),('orgA',$2::date,999)`,
      [diasAtras(2), diasAtras(120)],
    );
    const r = await filas<Conteo>(d, EVENTOS_PIXEL_POR_ORG, [DESDE]);
    expect(Number(r[0].n)).toBe(100);
  });

  it("EL CAST QUE IMPORTA: no revienta pasando los 2.100 millones", async () => {
    // `::int` es de 32 bits. Con ?dias=365 sobre un cliente pesado se pasa, y
    // el error lo comeria el catch: el numero se volveria `null` por un cast,
    // no por un problema real.
    const d = await db();
    await d.query(
      `INSERT INTO pixel_daily_aggregates VALUES ('orgA',$1::date,2000000000),('orgA',$2::date,2000000000)`,
      [diasAtras(2), diasAtras(3)],
    );
    const r = await filas<Conteo>(d, EVENTOS_PIXEL_POR_ORG, [DESDE]);
    expect(Number(r[0].n)).toBe(4_000_000_000);
  });
});

describe("Aurum — agregado por organizacion, modo y modelo", () => {
  const insertar = (
    d: PGlite,
    id: string,
    org: string,
    mode: string,
    model: string,
    i: number,
    o: number,
    dias = 2,
  ) =>
    d.query(`INSERT INTO aurum_usage_logs VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
      id,
      org,
      mode,
      model,
      i,
      o,
      diasAtras(dias),
    ]);

  it("agrupa y suma tokens, contando las llamadas", async () => {
    const d = await db();
    await insertar(d, "a1", "orgA", "FLASH", "claude-haiku-4-5", 100, 50);
    await insertar(d, "a2", "orgA", "FLASH", "claude-haiku-4-5", 200, 60);
    const r = await filas<any>(d, AURUM_AGRUPADO, [DESDE, 2000]);
    expect(r).toHaveLength(1);
    expect(Number(r[0].inputTokens)).toBe(300);
    expect(Number(r[0].outputTokens)).toBe(110);
    expect(Number(r[0].llamadas)).toBe(2);
  });

  it("NO mezcla modos ni modelos: el mix es lo que se factura", async () => {
    const d = await db();
    await insertar(d, "a1", "orgA", "FLASH", "claude-haiku-4-5", 100, 0);
    await insertar(d, "a2", "orgA", "DEEP", "claude-opus-4-5", 100, 0);
    const r = await filas<any>(d, AURUM_AGRUPADO, [DESDE, 2000]);
    expect(r).toHaveLength(2);
  });

  it("respeta el periodo", async () => {
    const d = await db();
    await insertar(d, "a1", "orgA", "FLASH", "claude-haiku-4-5", 100, 0, 2);
    await insertar(d, "a2", "orgA", "FLASH", "claude-haiku-4-5", 999, 0, 120);
    const r = await filas<any>(d, AURUM_AGRUPADO, [DESDE, 2000]);
    expect(Number(r[0].inputTokens)).toBe(100);
  });

  it("EL CAMINO COMPLETO: de filas de la base a dolares", async () => {
    // Un millon de tokens de entrada en Opus son 5 USD; en Haiku, 1.
    const d = await db();
    await insertar(d, "a1", "orgA", "DEEP", "claude-opus-4-5", 1_000_000, 0);
    await insertar(d, "a2", "orgA", "FLASH", "claude-haiku-4-5", 1_000_000, 0);
    const grupos = await filas<any>(d, AURUM_AGRUPADO, [DESDE, 2000]);
    const costo = costoDeAurum(
      grupos.map((g) => ({
        organizationId: g.organizationId,
        mode: g.mode,
        model: g.model,
        inputTokens: Number(g.inputTokens),
        outputTokens: Number(g.outputTokens),
        llamadas: Number(g.llamadas),
      })),
      {} as NodeJS.ProcessEnv,
    );
    expect(costo.queries).toBe(2);
    expect(costo.usdConocido).toBeCloseTo(6, 6);
    expect(costo.porModo).toEqual({ DEEP: 1, FLASH: 1 });
    expect(costo.modelosSinPrecio).toEqual([]);
  });

  it("el techo recorta, que es lo que el endpoint detecta para avisar", async () => {
    const d = await db();
    await insertar(d, "a1", "orgA", "FLASH", "m1", 1, 0);
    await insertar(d, "a2", "orgA", "FLASH", "m2", 1, 0);
    const r = await filas<any>(d, AURUM_AGRUPADO, [DESDE, 1]);
    expect(r).toHaveLength(1);
  });
});

describe("E-23 — las consultas de la cuota, ejecutadas", () => {
  const insertar = (
    d: PGlite,
    id: string,
    org: string,
    mode: string,
    model: string,
    i: number,
    o: number,
    haceSegundos: number,
  ) =>
    d.query(`INSERT INTO aurum_usage_logs VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
      id,
      org,
      mode,
      model,
      i,
      o,
      new Date(Date.now() - haceSegundos * 1000),
    ]);

  const arranqueDelMes = () => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
  };

  it("el gasto del mes es SOLO de la org que se pregunta", async () => {
    // Un tenant no puede quedar degradado por lo que gasto otro.
    const d = await db();
    await insertar(d, "a1", "orgA", "DEEP", "claude-opus-4-5", 1_000_000, 0, 60);
    await insertar(d, "a2", "orgB", "DEEP", "claude-opus-4-5", 9_000_000, 0, 60);
    const r = await filas<any>(d, AURUM_DEL_MES_DE_UNA_ORG, ["orgA", arranqueDelMes()]);
    expect(r).toHaveLength(1);
    expect(Number(r[0].inputTokens)).toBe(1_000_000);
  });

  it("agrupa por modelo, que es lo que permite pasarlo a dolares", async () => {
    const d = await db();
    await insertar(d, "a1", "orgA", "DEEP", "claude-opus-4-5", 1_000_000, 0, 60);
    await insertar(d, "a2", "orgA", "FLASH", "claude-haiku-4-5", 1_000_000, 0, 60);
    const grupos = await filas<any>(d, AURUM_DEL_MES_DE_UNA_ORG, ["orgA", arranqueDelMes()]);
    const costo = costoDeAurum(
      grupos.map((g) => ({
        organizationId: g.organizationId,
        mode: g.mode,
        model: g.model,
        inputTokens: Number(g.inputTokens),
        outputTokens: Number(g.outputTokens),
        llamadas: Number(g.llamadas),
      })),
      {} as NodeJS.ProcessEnv,
    );
    expect(costo.usdConocido).toBeCloseTo(6, 6); // 5 de Opus + 1 de Haiku
  });

  it("el mes pasado NO cuenta: el tope se reinicia solo", async () => {
    const d = await db();
    const haceCuarentaDias = 40 * 86400;
    await insertar(d, "a1", "orgA", "DEEP", "claude-opus-4-5", 9_000_000, 0, haceCuarentaDias);
    const r = await filas<any>(d, AURUM_DEL_MES_DE_UNA_ORG, ["orgA", arranqueDelMes()]);
    expect(r).toEqual([]);
  });

  it("el ultimo minuto cuenta lo de recien y nada mas", async () => {
    const d = await db();
    await insertar(d, "a1", "orgA", "FLASH", "claude-haiku-4-5", 1, 0, 10);
    await insertar(d, "a2", "orgA", "FLASH", "claude-haiku-4-5", 1, 0, 30);
    await insertar(d, "a3", "orgA", "FLASH", "claude-haiku-4-5", 1, 0, 300);
    const r = await filas<{ n: number }>(d, AURUM_ULTIMO_MINUTO_DE_UNA_ORG, [
      "orgA",
      new Date(Date.now() - 60_000),
    ]);
    expect(Number(r[0].n)).toBe(2);
  });

  it("y tampoco mezcla organizaciones", async () => {
    const d = await db();
    await insertar(d, "a1", "orgA", "FLASH", "claude-haiku-4-5", 1, 0, 10);
    await insertar(d, "a2", "orgB", "FLASH", "claude-haiku-4-5", 1, 0, 10);
    const r = await filas<{ n: number }>(d, AURUM_ULTIMO_MINUTO_DE_UNA_ORG, [
      "orgA",
      new Date(Date.now() - 60_000),
    ]);
    expect(Number(r[0].n)).toBe(1);
  });

  it("sin consumo devuelve 0, no vacio — asi el fail-open no se confunde", async () => {
    // COUNT(*) sin GROUP BY siempre devuelve una fila. Si devolviera vacio, el
    // lector lo leeria como null y trataria "no gasto nada" como "no se pudo
    // medir", que son cosas opuestas.
    const d = await db();
    const r = await filas<{ n: number }>(d, AURUM_ULTIMO_MINUTO_DE_UNA_ORG, [
      "orgA",
      new Date(Date.now() - 60_000),
    ]);
    expect(r).toHaveLength(1);
    expect(Number(r[0].n)).toBe(0);
  });
});
