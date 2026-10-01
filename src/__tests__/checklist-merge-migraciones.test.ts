import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// ══════════════════════════════════════════════════════════════════════════
// /api/admin/checklist-merge contra Postgres de verdad
// ══════════════════════════════════════════════════════════════════════════
// El criterio (`evaluarChecklist`) tiene sus tests; éste prueba que la RUTA
// pregunte bien: que las consultas al catálogo (to_regclass, pg_attribute) y los permisos
// detecten las cinco migraciones sin correr, y que después de correr los
// `.sql` reales digan que están. Un checklist que consulta mal es peor que no
// tenerlo: da "listo" con autoridad.
// ══════════════════════════════════════════════════════════════════════════

const m = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => (await m.db.query(sql, args)).rows,
  },
}));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => true }));

import { GET } from "@/app/api/admin/checklist-merge/route";
import { MIGRACIONES_REQUERIDAS } from "@/lib/merge/checklist";

beforeAll(async () => {
  m.db = await PGlite.create();
  // Las tablas previas que las migraciones alteran o referencian, como en main.
  await m.db.exec(`
    CREATE TABLE organizations (id text PRIMARY KEY);
    CREATE TABLE orders (id text PRIMARY KEY);
    CREATE TABLE backfill_jobs (id text PRIMARY KEY);
  `);
});
afterAll(async () => m.db.close());

const pedir = async () => {
  const res = await GET(new Request("http://local/api/admin/checklist-merge") as any);
  return (await res.json()) as { listo: boolean; pasos: Array<{ clave: string; estado: string }> };
};
const estados = (r: Awaited<ReturnType<typeof pedir>>) =>
  Object.fromEntries(
    MIGRACIONES_REQUERIDAS.map((mig) => [mig.clave, r.pasos.find((p) => p.clave === mig.clave)?.estado]),
  );

it("sin las migraciones, las cinco salen como faltantes y no dice listo", async () => {
  const r = await pedir();
  expect(estados(r)).toEqual(Object.fromEntries(MIGRACIONES_REQUERIDAS.map((mig) => [mig.clave, "falta"])));
  expect(r.listo).toBe(false);
});

it("con los .sql reales aplicados, las cinco salen bien (como superusuario; los permisos, abajo)", async () => {
  for (const mig of MIGRACIONES_REQUERIDAS) await m.db.exec(readFileSync(mig.archivo, "utf8"));
  const r = await pedir();
  expect(estados(r)).toEqual(Object.fromEntries(MIGRACIONES_REQUERIDAS.map((mig) => [mig.clave, "ok"])));
});

it("una columna con el nombre parecido no cuenta: busca el nombre exacto", async () => {
  // Postgres guarda en minúsculas los identificadores sin comillas. Una
  // migración escrita sin comillas crearía `leasetoken`, y el código (que usa
  // "leaseToken") fallaría igual.
  await m.db.exec(`ALTER TABLE backfill_jobs DROP COLUMN "leaseToken"; ALTER TABLE backfill_jobs ADD COLUMN leasetoken text;`);
  const r = await pedir();
  expect(estados(r)["mig-backfill-lease"]).toBe("falta");
});

it("tablas creadas por OTRO rol y sin GRANT: dice 'mal' (permisos), no 'falta' (migración)", async () => {
  // El caso real: la persona corre las migraciones en la consola con un rol, y
  // la app se conecta con otro. Con information_schema las tablas aparecían
  // como inexistentes y el checklist mandaba a re-correr una migración que no
  // cambia nada.
  const anterior = m.db;
  m.db = await PGlite.create();
  try {
    await m.db.exec(`
      CREATE TABLE organizations (id text PRIMARY KEY);
      CREATE TABLE orders (id text PRIMARY KEY);
      CREATE TABLE backfill_jobs (id text PRIMARY KEY);
      CREATE ROLE app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON orders, backfill_jobs TO app;
    `);
    for (const mig of MIGRACIONES_REQUERIDAS) await m.db.exec(readFileSync(mig.archivo, "utf8"));
    await m.db.exec(`SET ROLE app`);

    const sinGrant = estados(await pedir());
    expect(sinGrant).toEqual({
      "mig-orders-enrichment": "ok",
      "mig-backfill-lease": "ok",
      "mig-ml-sync-progress": "mal",
      "mig-ml-reconcile-progress": "mal",
      "mig-creator-password-attempts": "mal",
    });

    // Con los GRANT que pide cada paso, pasan a ok.
    await m.db.exec(`RESET ROLE;
      GRANT SELECT, INSERT, UPDATE ON ml_sync_progress, ml_reconcile_progress TO app;
      GRANT SELECT, INSERT, UPDATE ON creator_password_attempts TO app;
      SET ROLE app;`);
    // A la de creadores le falta DELETE a propósito: tiene que seguir mal.
    expect(estados(await pedir())["mig-creator-password-attempts"]).toBe("mal");
    expect(estados(await pedir())["mig-ml-sync-progress"]).toBe("ok");

    await m.db.exec(`RESET ROLE; GRANT DELETE ON creator_password_attempts TO app; SET ROLE app;`);
    expect(Object.values(estados(await pedir())).every((e) => e === "ok")).toBe(true);
  } finally {
    await m.db.close();
    m.db = anterior;
  }
});
