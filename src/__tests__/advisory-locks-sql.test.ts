import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// ══════════════════════════════════════════════════════════════════════════
// Los advisory locks de admisión tienen que TOMAR un lock de verdad
// ══════════════════════════════════════════════════════════════════════════
// Dos admisiones se serializan con un advisory lock de transacción:
//   · LOCK_AURUM_SQL        — una por organización, antes de leer el consumo de
//                             Aurum y reservar (si no, un burst pasa el tope).
//   · BLOQUEAR_ADMISION_SQL — una global, antes de contar jobs RUNNING y
//                             reclamar el próximo backfill.
//
// Los tests de admisión comparan la query contra la MISMA constante
// (`sql === LOCK_AURUM_SQL`), así que si alguien cambia su contenido por
// `SELECT 1` siguen verdes y la serialización desaparece sin ruido. Acá se
// ejecuta la constante contra Postgres real (PGlite) y se mira `pg_locks`.
//
// LO QUE ESTO NO PRUEBA: que una segunda transacción ESPERE. PGlite es una sola
// conexión y serializa sus transacciones por su cuenta, así que no hay dos
// sesiones que puedan competir por el lock. Lo que sí se afirma es lo que hace
// que la espera ocurra en Postgres de verdad: el lock queda tomado dentro de la
// transacción, en la clave esperada, y se suelta al terminarla (con el pooler de
// Neon en modo transacción, un lock de SESIÓN quedaría pegado a una conexión
// ajena).
// ══════════════════════════════════════════════════════════════════════════

vi.mock("@/lib/db/client", () => ({ prisma: {} }));
import { LOCK_AURUM_SQL } from "@/lib/aurum/admision";
import { BLOQUEAR_ADMISION_SQL } from "@/lib/backfill/job-manager";

type Lock = { classid: string; objid: string; objsubid: number; mode: string; granted: boolean };

let db: PGlite;
beforeAll(async () => { db = await PGlite.create(); });
afterAll(async () => { await db.close(); });

const LOCKS_DE_ESTA_SESION = `
  SELECT classid::text, objid::text, objsubid, mode, granted
    FROM pg_locks
   WHERE locktype = 'advisory' AND pid = pg_backend_pid()
   ORDER BY classid, objid`;

/** Corre `sql` como lo corre producción (mismos parámetros) y devuelve los
 *  advisory locks que la sesión tiene DENTRO de esa transacción. */
async function locksTomadosPor(sql: string, params: unknown[]): Promise<Lock[]> {
  return db.transaction(async tx => {
    await tx.query(sql, params);
    return (await tx.query<Lock>(LOCKS_DE_ESTA_SESION)).rows;
  });
}

/** `pg_locks.objid` es un oid (sin signo); `hashtext` devuelve int4 con signo. */
async function objidDe(orgId: string): Promise<string> {
  const r = await db.query<{ objid: string }>("SELECT (hashtext($1)::bigint & 4294967295)::text AS objid", [orgId]);
  return r.rows[0].objid;
}

describe("LOCK_AURUM_SQL", () => {
  it("toma un advisory lock exclusivo de transacción en la clave de la organización", async () => {
    expect(await locksTomadosPor(LOCK_AURUM_SQL, ["org-a"])).toEqual([
      { classid: "160022", objid: await objidDe("org-a"), objsubid: 2, mode: "ExclusiveLock", granted: true },
    ]);
  });

  it("serializa por organización: misma org, misma clave; otra org, otra clave", async () => {
    const [a1] = await locksTomadosPor(LOCK_AURUM_SQL, ["org-a"]);
    const [a2] = await locksTomadosPor(LOCK_AURUM_SQL, ["org-a"]);
    const [b] = await locksTomadosPor(LOCK_AURUM_SQL, ["org-b"]);
    expect(a2).toEqual(a1);
    expect(b.objid).not.toBe(a1.objid);
  });

  it("suelta el lock al cerrar la transacción", async () => {
    await locksTomadosPor(LOCK_AURUM_SQL, ["org-a"]);
    expect((await db.query(LOCKS_DE_ESTA_SESION)).rows).toEqual([]);
  });
});

describe("BLOQUEAR_ADMISION_SQL", () => {
  it("toma el advisory lock global de admisión de backfill, en otro espacio que Aurum", async () => {
    expect(await locksTomadosPor(BLOQUEAR_ADMISION_SQL, [])).toEqual([
      { classid: "160021", objid: "1", objsubid: 2, mode: "ExclusiveLock", granted: true },
    ]);
  });

  it("suelta el lock al cerrar la transacción", async () => {
    await locksTomadosPor(BLOQUEAR_ADMISION_SQL, []);
    expect((await db.query(LOCKS_DE_ESTA_SESION)).rows).toEqual([]);
  });
});
