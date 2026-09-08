import { describe, it, expect, vi, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// ══════════════════════════════════════════════════════════════════════════
// E-19 — la detección se diluía en proporción al crecimiento
// ══════════════════════════════════════════════════════════════════════════
// `checkPipelineFreshness` hacía `SELECT MAX(columna) FROM tabla`, sin `WHERE` y
// sin `GROUP BY`. Medía la tabla ENTERA.
//
// Con un cliente eso funciona. Con veinte, si diecinueve refrescan bien y uno
// queda congelado, el `MAX` global sigue siendo de hace diez minutos y **el
// chequeo da verde**. Cuantos más clientes, menos probable que uno roto se note:
// la vigilancia se embotaba exactamente con el crecimiento que el plan busca.
//
// Agrupando por organización pasa lo contrario — se afila con cada cliente.
// Y de paso el mail puede decir QUÉ cliente, que antes había que ir a buscar.
//
// Se corre contra Postgres de verdad porque lo que hay que probar es el
// `GROUP BY` y la detección de la columna, no que el SQL diga ciertas palabras.
// ══════════════════════════════════════════════════════════════════════════

let db: PGlite;

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => (await db.query(sql, args)).rows,
  },
}));

const { checkPipelineFreshness } = await import("./freshness");

const TARGET = [
  { table: "gold_daily_revenue", column: "gold_updated_at", maxHours: 6, refreshedBy: "cron-x" },
] as const;

const HORA = 3600_000;

async function nuevaDb(colOrg: string | null) {
  db = new PGlite();
  const col = colOrg ? `"${colOrg}" text,` : "";
  await db.query(`CREATE TABLE gold_daily_revenue (${col} gold_updated_at timestamptz)`);
}

async function fila(org: string | null, haceHoras: number, colOrg = "organization_id") {
  if (org === null) {
    await db.query(
      `INSERT INTO gold_daily_revenue (gold_updated_at) VALUES (NOW() - ($1 || ' hours')::interval)`,
      [String(haceHoras)],
    );
    return;
  }
  await db.query(
    `INSERT INTO gold_daily_revenue ("${colOrg}", gold_updated_at)
     VALUES ($1, NOW() - ($2 || ' hours')::interval)`,
    [org, String(haceHoras)],
  );
}

describe("EL BUG: un cliente congelado entre muchos sanos", () => {
  beforeEach(() => nuevaDb("organization_id"));

  it("con 19 orgs frescas y 1 congelada, ahora SÍ se detecta", async () => {
    for (let i = 0; i < 19; i++) await fila(`org${i}`, 0.1);
    await fila("orgCongelada", 48);

    const [r] = await checkPipelineFreshness(TARGET);

    // Con el MAX global, `hours` habría sido 0.1 y `stale` false.
    expect(r.stale).toBe(true);
    expect(r.porOrg).toBe(true);
    expect(r.orgsStale).toEqual([{ org: "orgCongelada", hours: 48 }]);
  });

  it("el atraso reportado es el de la PEOR org, no el de la mejor", async () => {
    // Con el MAX global era literalmente al revés: la org más fresca tapaba a
    // todas las demás.
    await fila("orgA", 0.1);
    await fila("orgB", 30);
    const [r] = await checkPipelineFreshness(TARGET);
    expect(r.hoursStale).toBe(30);
  });

  it("todas frescas, ninguna alerta", async () => {
    for (let i = 0; i < 5; i++) await fila(`org${i}`, 1);
    const [r] = await checkPipelineFreshness(TARGET);
    expect(r.stale).toBe(false);
    expect(r.orgsStale).toEqual([]);
  });

  it("varias congeladas salen todas", async () => {
    await fila("orgA", 0.1);
    await fila("orgB", 10);
    await fila("orgC", 20);
    const [r] = await checkPipelineFreshness(TARGET);
    expect(r.orgsStale!.map((o) => o.org).sort()).toEqual(["orgB", "orgC"]);
  });

  it("justo en el umbral no alerta; un pelo por encima sí", async () => {
    await fila("orgA", 5.9);
    expect((await checkPipelineFreshness(TARGET))[0].stale).toBe(false);
    await fila("orgB", 6.5);
    expect((await checkPipelineFreshness(TARGET))[0].stale).toBe(true);
  });
});

describe("la otra convención de nombre de columna", () => {
  it("detecta organizationId en camelCase (los rollups del pixel)", async () => {
    // Silver/Gold usan `organization_id`; los rollups del pixel usan
    // `"organizationId"`. Se detecta en vez de hardcodear: una lista a mano se
    // desincroniza en silencio, y el modo de falla sería volver al chequeo
    // global sin que nadie lo note — o sea el bug de vuelta.
    await nuevaDb("organizationId");
    await fila("orgA", 0.1, "organizationId");
    await fila("orgB", 40, "organizationId");

    const [r] = await checkPipelineFreshness(TARGET);
    expect(r.porOrg).toBe(true);
    expect(r.orgsStale).toEqual([{ org: "orgB", hours: 40 }]);
  });
});

describe("degradación", () => {
  it("sin columna de organización cae al modo global, no se rompe", async () => {
    // Es el comportamiento anterior. Degradar es preferible a no medir nada.
    await nuevaDb(null);
    await fila(null, 40);
    const [r] = await checkPipelineFreshness(TARGET);
    expect(r.porOrg).toBe(false);
    expect(r.stale).toBe(true);
    expect(r.hoursStale).toBe(40);
  });

  it("una tabla que no existe no es una alerta", async () => {
    db = new PGlite();
    const [r] = await checkPipelineFreshness(TARGET);
    expect(r.missing).toBe(true);
    expect(r.stale).toBe(false);
  });

  it("una tabla vacía tampoco alerta", async () => {
    await nuevaDb("organization_id");
    const [r] = await checkPipelineFreshness(TARGET);
    expect(r.stale).toBe(false);
    expect(r.hoursStale).toBeNull();
  });

  it("un error que NO es 'la tabla no existe' se reporta, no se traga", async () => {
    // Antes había un `catch {}` que marcaba todo como `missing: true`, o sea
    // "no es una alerta". Un `statement_timeout` de la query agrupada —que es
    // bastante más cara que el MAX de antes— salía por esa puerta: el módulo
    // que existe para avisar que algo dejó de correr se rompía y decía que todo
    // estaba bien.
    await nuevaDb("organization_id");
    // Una columna que no existe: error de Postgres, pero NO 42P01.
    const [r] = await checkPipelineFreshness([
      { table: "gold_daily_revenue", column: "columna_que_no_existe", maxHours: 6, refreshedBy: "cron-x" },
    ]);
    expect(r.missing).toBe(false);
    expect(r.stale).toBe(true);
    expect(r.error).toBeTruthy();
  });
});

describe("el chequeo no puede matar al cron que lo hospeda", () => {
  // Corre adentro de `warm-cache`, que ya se comió hasta 220 s de su
  // `maxDuration` de 300 antes de llegar acá. Si esto se pasa, Vercel mata la
  // función y warm-cache no devuelve nada — y ahí vive `maybeSelfHealRollups`,
  // o sea que el monitoreo tumbaría al cron que recupera los rollups.
  it("con el presupuesto agotado corta y devuelve lo que alcanzó a medir", async () => {
    await nuevaDb("organization_id");
    await fila("orgA", 40);
    const muchos = Array.from({ length: 12 }, () => TARGET[0]);
    // Presupuesto de 0 ms: no llega a medir ninguna.
    const r = await checkPipelineFreshness(muchos, { presupuestoMs: 0 });
    expect(r.length).toBeLessThan(muchos.length);
  });

  it("lo que no se llegó a medir NO se reporta como atrasado", async () => {
    // Decir "el cron está caído" porque nos quedamos sin tiempo mandaría a
    // buscar un problema que no existe.
    await nuevaDb("organization_id");
    await fila("orgA", 40);
    const r = await checkPipelineFreshness([TARGET[0], TARGET[0]], { presupuestoMs: 0 });
    expect(r.filter((x) => x.stale)).toEqual([]);
  });

  it("con presupuesto de sobra las mide todas", async () => {
    await nuevaDb("organization_id");
    await fila("orgA", 40);
    const r = await checkPipelineFreshness([TARGET[0], TARGET[0]], { presupuestoMs: 30_000 });
    expect(r).toHaveLength(2);
    expect(r[0].stale).toBe(true);
  });
});
