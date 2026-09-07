import { describe, it, expect, vi, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// ══════════════════════════════════════════════════════════════════════════
// Starvation en la cola de schedules
// ══════════════════════════════════════════════════════════════════════════
// `loadAllPendingSchedules` trae las reglas vencidas ordenadas por `nextFireAt
// ASC NULLS FIRST`, y `alerts-scheduler` las evalúa en ese orden con un
// presupuesto de tiempo. La equidad del sistema depende de una sola cosa: que
// una regla evaluada SALGA de la cabeza de la cola.
//
// No salía. El `return null` de "esta regla no disparó" estaba ANTES del UPDATE
// de `nextFireAt`, así que una regla de schedule que no dispara nunca avanzaba
// su próxima fecha: quedaba vencida para siempre, se re-evaluaba en cada
// corrida y se quedaba PERMANENTEMENTE PRIMERA. Con varios clientes, un puñado
// de reglas que nunca disparan alcanza para que las de atrás no se evalúen
// jamás.
//
// El arreglo llevaba 20 líneas de comentario y su única cobertura eran tres
// `expect(fuente).toContain("nextFireAt")` — que pasan igual con un
// `const _ = "nextFireAt"`. Lo levantó la auditoría de calidad de tests del
// 2026-09-07. Esto pone dos reglas en una cola de verdad, evalúa la primera sin
// disparo y verifica que la segunda llegue a evaluarse.
// ══════════════════════════════════════════════════════════════════════════

let db: PGlite;

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => (await db.query(sql, args)).rows,
    $executeRawUnsafe: async (sql: string, ...args: unknown[]) =>
      (await db.query(sql, args)).affectedRows ?? 0,
  },
}));

/** Qué devuelve el primitive de cada regla. Se cambia por caso. */
let disparaPara: (key: string) => boolean = () => false;

vi.mock("./primitives", () => ({
  getPrimitive: (key: string) => ({
    module: "pixel",
    evaluate: async () => ({
      triggered: disparaPara(key),
      title: "algo pasó",
      message: "detalle",
    }),
  }),
}));

vi.mock("@/lib/email/send", () => ({ sendEmail: async () => ({ ok: true }) }));

const { loadAllPendingSchedules, evaluateRule } = await import("./engine");

const ESQUEMA = `CREATE TABLE "alert_rules" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "primitiveKey" TEXT NOT NULL,
  "params" JSONB DEFAULT '{}',
  "operator" JSONB,
  "schedule" JSONB DEFAULT '{"frequency":"daily","time":"09:00"}',
  "channels" TEXT[] DEFAULT '{}',
  "cooldownMinutes" INTEGER DEFAULT 0,
  "severity" TEXT DEFAULT 'info',
  "enabled" BOOLEAN DEFAULT true,
  "lastFiredAt" TIMESTAMPTZ,
  "nextFireAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
)`;

const MIN = 60_000;

async function regla(
  id: string,
  o: { vencidaHaceMin?: number; org?: string; key?: string } = {},
) {
  await db.query(
    `INSERT INTO "alert_rules"
       ("id","organizationId","userId","name","type","primitiveKey","nextFireAt")
     VALUES ($1,$2,'u1',$1,'schedule',$3,$4)`,
    [
      id,
      o.org ?? "org1",
      o.key ?? id,
      o.vencidaHaceMin === undefined ? null : new Date(Date.now() - o.vencidaHaceMin * MIN),
    ],
  );
}

async function nextFireAtDe(id: string): Promise<Date | null> {
  const r = await db.query<any>(`SELECT "nextFireAt" AS n FROM "alert_rules" WHERE id = $1`, [id]);
  return r.rows[0]?.n ? new Date(r.rows[0].n) : null;
}

beforeEach(async () => {
  db = new PGlite();
  await db.query(ESQUEMA);
  disparaPara = () => false;
});

describe("una regla que no dispara cede el turno", () => {
  it("EL BUG: evaluar sin disparar dejaba la regla vencida para siempre", async () => {
    await regla("no-dispara", { vencidaHaceMin: 60 });

    const antes = await nextFireAtDe("no-dispara");
    const alerta = await evaluateRule((await loadAllPendingSchedules())[0]);

    expect(alerta).toBeNull(); // no disparó, como esperábamos
    const despues = await nextFireAtDe("no-dispara");
    // Lo que importa: la fecha se movió, y hacia adelante.
    expect(despues!.getTime()).toBeGreaterThan(antes!.getTime());
    expect(despues!.getTime()).toBeGreaterThan(Date.now());
  });

  it("y con eso sale de la cola: la siguiente corrida ya no la trae", async () => {
    await regla("no-dispara", { vencidaHaceMin: 60 });

    await evaluateRule((await loadAllPendingSchedules())[0]);

    expect((await loadAllPendingSchedules()).map((r) => r.id)).toEqual([]);
  });

  it("EL DAÑO: la regla de atrás llega a evaluarse", async () => {
    // Dos clientes. El primero tiene una regla que nunca dispara y está más
    // vencida, así que sale primera siempre. Con el bug, la segunda no se
    // evaluaba nunca — ni en esta corrida ni en ninguna.
    await regla("tapon", { org: "cliente-viejo", vencidaHaceMin: 600 });
    await regla("tapada", { org: "cliente-nuevo", vencidaHaceMin: 5 });

    const evaluadas: string[] = [];
    // Tres corridas del scheduler con presupuesto para UNA regla cada una: es
    // la situación real, un cron que no llega a terminar la cola.
    for (let corrida = 0; corrida < 3; corrida++) {
      const cola = await loadAllPendingSchedules();
      if (cola.length === 0) break;
      evaluadas.push(cola[0].id);
      await evaluateRule(cola[0]);
    }

    // Con el bug esto era ["tapon", "tapon", "tapon"].
    expect(evaluadas).toContain("tapada");
  });

  it("el orden de la cola sigue siendo el más vencido primero", async () => {
    await regla("media", { vencidaHaceMin: 30 });
    await regla("vieja", { vencidaHaceMin: 300 });
    await regla("nueva", { vencidaHaceMin: 1 });

    expect((await loadAllPendingSchedules()).map((r) => r.id)).toEqual([
      "vieja",
      "media",
      "nueva",
    ]);
  });

  it("una regla que nunca disparó (nextFireAt NULL) va primera", async () => {
    await regla("vieja", { vencidaHaceMin: 999 });
    await regla("virgen");
    expect((await loadAllPendingSchedules())[0].id).toBe("virgen");
  });

  it("y al evaluarse sin disparar, la virgen también cede el turno", async () => {
    // El caso que más duele: `nextFireAt` NULL ordena PRIMERO, así que una
    // regla recién creada que no dispara se queda al frente de la cola desde el
    // minuto cero.
    await regla("virgen");
    await evaluateRule((await loadAllPendingSchedules())[0]);
    expect(await nextFireAtDe("virgen")).not.toBeNull();
    expect((await loadAllPendingSchedules()).map((r) => r.id)).toEqual([]);
  });

  it("se posterga poco, no al próximo período: sigue pudiendo disparar hoy", async () => {
    // A propósito NO se salta al próximo día. Una regla diaria que no dispara a
    // las 09:00 se re-chequea al rato y puede disparar; con el salto, recién
    // mañana. El arreglo de la cola no puede cambiar la semántica visible.
    await regla("r", { vencidaHaceMin: 60 });
    await evaluateRule((await loadAllPendingSchedules())[0]);
    const n = await nextFireAtDe("r");
    const enMinutos = (n!.getTime() - Date.now()) / MIN;
    expect(enMinutos).toBeGreaterThan(5);
    expect(enMinutos).toBeLessThan(60);
  });

  it("una regla que SÍ dispara no pasa por este camino", async () => {
    disparaPara = () => true;
    await regla("dispara", { vencidaHaceMin: 60 });
    const alerta = await evaluateRule((await loadAllPendingSchedules())[0]);
    expect(alerta).not.toBeNull();
  });

  it("con la cola vacía no hay nada que hacer", async () => {
    await regla("futura");
    await db.query(`UPDATE "alert_rules" SET "nextFireAt" = NOW() + interval '2 hours'`);
    expect(await loadAllPendingSchedules()).toEqual([]);
  });
});
