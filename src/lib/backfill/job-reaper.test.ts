import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { RECLAMAR_PROXIMO_JOB_SQL, MATAR_JOBS_SIN_PROGRESO_SQL } from "./job-manager";

// ══════════════════════════════════════════════════════════════════════════
// E-08 bis — un job roto no puede bloquear el alta de TODOS los clientes
// ══════════════════════════════════════════════════════════════════════════
// Encontrado en la revisión del 2026-09-07. `failJob` estaba importado en el
// runner y no se llamaba desde ningún lado, así que un job cuyo chunk falla
// siempre (credenciales de VTEX vencidas, plataforma no soportada) se quedaba
// RUNNING para siempre.
//
// Y peor: `updateJobProgress` refrescaba `lastChunkAt` ANTES de mirar el error,
// o sea que el job roto mantenía su latido vivo. Con el límite de concurrencia
// en 1 (el default que trajo E-08), ese job zombie hacía que cada tick del cron
// devolviera `admitido:false, otro-backfill-corriendo` — con HTTP 200 — y el
// alta de cualquier otro cliente no arrancaba nunca. El freno que se puso para
// proteger la base terminaba tumbando el onboarding entero.
//
// Se testea contra Postgres de verdad porque lo que importa es la semántica del
// UPDATE, no que el SQL diga ciertas palabras.
// ══════════════════════════════════════════════════════════════════════════

const ESQUEMA = `CREATE TABLE "backfill_jobs" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "monthsRequested" INTEGER NOT NULL,
  "fromDate" TIMESTAMPTZ NOT NULL,
  "toDate" TIMESTAMPTZ NOT NULL,
  "cursor" JSONB DEFAULT '{}',
  "processedCount" INTEGER DEFAULT 0,
  "totalEstimate" INTEGER,
  "progressPct" INTEGER DEFAULT 0,
  "lastError" TEXT,
  "startedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "lastChunkAt" TIMESTAMPTZ,
  "onboardingRequestId" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
)`;

const COOLDOWN_MS = 2 * 60 * 1000;
const SIN_PROGRESO_MS = 30 * 60 * 1000;
const MIN = 60_000;

async function nuevaDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.query(ESQUEMA);
  return db;
}

async function job(
  db: PGlite,
  id: string,
  o: {
    org?: string;
    status?: string;
    empezoHaceMin?: number;
    ultimoChunkHaceMin?: number | null;
  } = {},
) {
  const empezo =
    o.empezoHaceMin === undefined ? null : new Date(Date.now() - o.empezoHaceMin * MIN);
  const chunk =
    o.ultimoChunkHaceMin === undefined || o.ultimoChunkHaceMin === null
      ? null
      : new Date(Date.now() - o.ultimoChunkHaceMin * MIN);
  await db.query(
    `INSERT INTO "backfill_jobs"
       ("id","organizationId","platform","status","monthsRequested","fromDate","toDate","startedAt","lastChunkAt")
     VALUES ($1,$2,'VTEX',$3,12,NOW(),NOW(),$4,$5)`,
    [id, o.org ?? "orgA", o.status ?? "QUEUED", empezo, chunk],
  );
}

/** Lo que el límite de concurrencia cuenta como "corriendo ahora mismo". */
async function activos(db: PGlite): Promise<number> {
  const r = await db.query<any>(
    `SELECT COUNT(*)::int AS n FROM "backfill_jobs"
      WHERE "status" = 'RUNNING' AND "lastChunkAt" IS NOT NULL AND "lastChunkAt" >= $1`,
    [new Date(Date.now() - COOLDOWN_MS)],
  );
  return Number(r.rows[0].n);
}

async function reaper(db: PGlite): Promise<string[]> {
  const r = await db.query<any>(MATAR_JOBS_SIN_PROGRESO_SQL, [
    new Date(Date.now() - SIN_PROGRESO_MS),
    30,
  ]);
  return r.rows.map((x: any) => x.id);
}

async function reclamar(db: PGlite): Promise<any | null> {
  const r = await db.query<any>(RECLAMAR_PROXIMO_JOB_SQL, [
    new Date(Date.now() - COOLDOWN_MS),
  ]);
  return r.rows[0] ?? null;
}

async function estado(db: PGlite, id: string): Promise<string> {
  const r = await db.query<any>(`SELECT status FROM "backfill_jobs" WHERE id = $1`, [id]);
  return r.rows[0]?.status;
}

describe("EL BUG: un job zombie bloqueaba el alta de todos los clientes", () => {
  it("un job roto que no avanza deja de contar como activo", async () => {
    const db = await nuevaDb();
    // Arredo: empezó hace 3 horas, último chunk exitoso hace 3 horas.
    await job(db, "arredo", {
      org: "arredo",
      status: "RUNNING",
      empezoHaceMin: 180,
      ultimoChunkHaceMin: 180,
    });

    // Antes del arreglo el runner refrescaba `lastChunkAt` aunque el chunk
    // fallara, así que este job figuraba activo para siempre.
    expect(await activos(db)).toBe(0);

    expect(await reaper(db)).toEqual(["arredo"]);
    expect(await estado(db, "arredo")).toBe("FAILED");
    await db.close();
  });

  it("y una vez muerto, el alta del OTRO cliente arranca", async () => {
    const db = await nuevaDb();
    await job(db, "arredo", {
      org: "arredo",
      status: "RUNNING",
      empezoHaceMin: 180,
      ultimoChunkHaceMin: 180,
    });
    await job(db, "mundo", { org: "mundo", status: "QUEUED" });

    await reaper(db);
    expect(await activos(db)).toBe(0); // el límite de concurrencia ya no frena

    expect((await reclamar(db))?.id).toBe("mundo");
    await db.close();
  });
});

describe("el reaper no se lleva puesto un backfill sano", () => {
  it("un job largo que SIGUE avanzando no se toca", async () => {
    // El backfill de Arredo trajo 252.701 órdenes: puede durar horas. Mientras
    // complete chunks, `lastChunkAt` se refresca y nunca alcanza el corte. Por
    // eso el criterio es "sin progreso" y no "sin terminar".
    const db = await nuevaDb();
    await job(db, "largo", { status: "RUNNING", empezoHaceMin: 300, ultimoChunkHaceMin: 1 });
    expect(await reaper(db)).toEqual([]);
    expect(await estado(db, "largo")).toBe("RUNNING");
    expect(await activos(db)).toBe(1);
    await db.close();
  });

  it("un job recién tomado no se mata", async () => {
    const db = await nuevaDb();
    await job(db, "nuevo", { status: "RUNNING", empezoHaceMin: 0, ultimoChunkHaceMin: 0 });
    expect(await reaper(db)).toEqual([]);
    await db.close();
  });

  it("un RUNNING viejo que nunca completó un chunk SÍ se mata", async () => {
    // La lambda se murió entre el claim y el primer chunk.
    const db = await nuevaDb();
    await job(db, "huerfano", {
      status: "RUNNING",
      empezoHaceMin: 120,
      ultimoChunkHaceMin: null,
    });
    expect(await reaper(db)).toEqual(["huerfano"]);
    await db.close();
  });

  it("no toca QUEUED, COMPLETED ni FAILED", async () => {
    const db = await nuevaDb();
    await job(db, "q", { status: "QUEUED", empezoHaceMin: 999 });
    await job(db, "c", { status: "COMPLETED", empezoHaceMin: 999, ultimoChunkHaceMin: 999 });
    await job(db, "f", { status: "FAILED", empezoHaceMin: 999, ultimoChunkHaceMin: 999 });
    expect(await reaper(db)).toEqual([]);
    await db.close();
  });

  it("deja el motivo escrito, sin pisar el error original", async () => {
    // Quien mire después tiene que poder saber POR QUÉ no avanzaba.
    const db = await nuevaDb();
    await job(db, "z", { status: "RUNNING", empezoHaceMin: 180, ultimoChunkHaceMin: 180 });
    await db.query(`UPDATE "backfill_jobs" SET "lastError" = 'VTEX 401' WHERE id = 'z'`);
    await reaper(db);
    const r = await db.query<any>(`SELECT "lastError" FROM "backfill_jobs" WHERE id = 'z'`);
    expect(r.rows[0].lastError).toContain("VTEX 401");
    expect(r.rows[0].lastError).toContain("sin progreso");
    await db.close();
  });

  it("un job sin lastError previo tampoco rompe", async () => {
    const db = await nuevaDb();
    await job(db, "z", { status: "RUNNING", empezoHaceMin: 180, ultimoChunkHaceMin: 180 });
    await reaper(db);
    const r = await db.query<any>(`SELECT "lastError" FROM "backfill_jobs" WHERE id = 'z'`);
    expect(r.rows[0].lastError).toContain("sin progreso");
    await db.close();
  });
});
