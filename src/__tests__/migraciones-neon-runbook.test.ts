import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { MIGRACIONES_REQUERIDAS } from "@/lib/merge/checklist";

// ══════════════════════════════════════════════════════════════════════════
// El script que una persona corre en la consola de Neon antes del merge
// ══════════════════════════════════════════════════════════════════════════
// `docs/revision-2026-09/08-MIGRACIONES-NEON.sql` copia las cinco migraciones
// para que se puedan correr desde la consola. Una copia se desfasa: si alguien
// cambia un `.sql` y no el script, en producción queda la versión vieja y nadie
// se entera. Además el script trae una verificación que tiene que funcionar
// tanto antes como después de migrar — un chequeo que tira error justo cuando
// falta la tabla no sirve — y que tiene que ver los permisos del rol de la app,
// no los de quien está en la consola.
// ══════════════════════════════════════════════════════════════════════════

const RUNBOOK = "docs/revision-2026-09/08-MIGRACIONES-NEON.sql";
const runbook = readFileSync(RUNBOOK, "utf8");

/** Sentencias SQL sin comentarios y con los espacios normalizados. */
const sentencias = (sql: string) =>
  sql
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ""))
    .join(" ")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

const seccion = (desde: string, hasta?: string) => {
  const ini = runbook.indexOf(desde);
  const fin = hasta ? runbook.indexOf(hasta) : runbook.length;
  if (ini < 0 || fin < 0) throw new Error(`no encontré la sección ${desde}`);
  return runbook.slice(ini, fin);
};
const PASOS = ["-- ── PASO 1", "-- ── PASO 2", "-- ── PASO 3"].map((p, n, a) =>
  seccion(p, a[n + 1] ?? "-- ── PASO 4"),
);
const VERIFICACION = seccion("-- ── PASO 4", "-- ── AL MOMENTO DEL MERGE");
const AL_MERGEAR = seccion("-- ── AL MOMENTO DEL MERGE");

const TABLAS_PREVIAS = `
  CREATE TABLE organizations (id text PRIMARY KEY);
  CREATE TABLE orders (id text PRIMARY KEY);
  CREATE TABLE backfill_jobs (id text PRIMARY KEY, status text);
`;

type Fila = { objeto: string; ok: boolean };
async function verificar(db: PGlite, sql = VERIFICACION): Promise<Fila[]> {
  const res = await db.exec(sql);
  return res[res.length - 1].rows as Fila[];
}
async function base() {
  const db = await PGlite.create();
  await db.exec(TABLAS_PREVIAS);
  return db;
}
/** Como lo corre la persona: un paso por vez. */
async function migrar(db: PGlite) {
  for (const paso of PASOS) await db.exec(paso);
}

describe("el script no se desfasa de las migraciones", () => {
  const delScript = new Set(sentencias(runbook));
  it.each(MIGRACIONES_REQUERIDAS.map((m) => m.archivo))("%s está copiado textual", (archivo) => {
    for (const s of sentencias(readFileSync(archivo, "utf8"))) {
      expect(delScript.has(s), `falta o cambió en el script: ${s.slice(0, 80)}`).toBe(true);
    }
  });

  it("el ALTER de orders va solo, en el último paso de escritura", () => {
    // Si comparte paso con otros, puede quedar en la misma transacción que
    // espera otros locks, con `orders` tomada mientras tanto.
    expect(PASOS[2]).toMatch(/ALTER TABLE orders/);
    expect(sentencias(PASOS[2]).filter((s) => !/^SET /.test(s))).toHaveLength(1);
    expect(PASOS[0] + PASOS[1]).not.toMatch(/ALTER TABLE orders/);
  });

  it("cada paso de escritura trae su lock_timeout", () => {
    for (const paso of PASOS) expect(paso).toMatch(/SET lock_timeout = '3s';/);
  });
});

describe("el script, corrido contra Postgres", () => {
  it("antes de migrar, la verificación no tira error y marca las nueve en false", async () => {
    const db = await base();
    const filas = await verificar(db);
    expect(filas).toHaveLength(9);
    expect(filas.filter((f) => f.ok), JSON.stringify(filas)).toEqual([]);
    await db.close();
  });

  it("corrido paso por paso, la verificación da las nueve en true", async () => {
    const db = await base();
    await migrar(db);
    const filas = await verificar(db);
    expect(filas).toHaveLength(9);
    expect(filas.filter((f) => !f.ok), "estos quedaron en false").toEqual([]);
    await db.close();
  });

  it("corrido entero de un saque también funciona (aunque no es lo recomendado)", async () => {
    const db = await base();
    const res = await db.exec(runbook);
    const filas = res.find((r) => r.fields.some((c) => c.name === "objeto"))!.rows as Fila[];
    expect(filas.every((f) => f.ok)).toBe(true);
    await db.close();
  });

  it("se puede correr dos veces: es idempotente", async () => {
    const db = await base();
    await migrar(db);
    await migrar(db);
    expect((await verificar(db)).every((f) => f.ok)).toBe(true);
    await db.close();
  });

  it("mira los permisos del rol que se le indica, no los de la consola", async () => {
    // La persona entra como dueño y la app puede usar otro rol. Con el rol de
    // la app en la primera línea, las tres tablas nuevas tienen que salir en
    // false hasta que se den los permisos.
    const db = await base();
    await migrar(db);
    await db.exec(`CREATE ROLE app`);
    const paraApp = VERIFICACION.replace("SELECT current_user::text AS nombre", "SELECT 'app'::text AS nombre");
    expect(paraApp).not.toBe(VERIFICACION);

    const sinGrant = (await verificar(db, paraApp)).filter((f) => f.objeto.startsWith("permisos"));
    expect(sinGrant).toHaveLength(3);
    expect(sinGrant.every((f) => f.ok === false)).toBe(true);

    await db.exec(`GRANT SELECT, INSERT, UPDATE ON ml_sync_progress, ml_reconcile_progress, creator_password_attempts TO app`);
    const sinDelete = await verificar(db, paraApp);
    expect(sinDelete.find((f) => f.objeto.endsWith("creator_password_attempts") && f.objeto.startsWith("permisos"))!.ok).toBe(false);
    expect(sinDelete.find((f) => f.objeto.endsWith("ml_sync_progress") && f.objeto.startsWith("permisos"))!.ok).toBe(true);

    await db.exec(`GRANT DELETE ON creator_password_attempts TO app`);
    expect((await verificar(db, paraApp)).every((f) => f.ok)).toBe(true);
    await db.close();
  });

  it("al mergear, cuenta los backfills en curso", async () => {
    const db = await base();
    await migrar(db);
    await db.exec(`INSERT INTO backfill_jobs (id, status) VALUES ('a','RUNNING'),('b','COMPLETED')`);
    const res = await db.exec(AL_MERGEAR);
    expect(Number((res.at(-1)!.rows[0] as any).backfills_en_curso)).toBe(1);
    await db.close();
  });
});
