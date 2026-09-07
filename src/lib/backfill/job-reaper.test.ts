import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  RECLAMAR_PROXIMO_JOB_SQL,
  MATAR_JOBS_SIN_PROGRESO_SQL,
  esAltaCompleta,
} from "./job-manager";

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
    onboarding?: string;
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
       ("id","organizationId","platform","status","monthsRequested","fromDate","toDate","startedAt","lastChunkAt","onboardingRequestId")
     VALUES ($1,$2,'VTEX',$3,12,NOW(),NOW(),$4,$5,$6)`,
    [id, o.org ?? "orgA", o.status ?? "QUEUED", empezo, chunk, o.onboarding ?? null],
  );
}

/**
 * Adelanta el reloj `minutos`, moviendo la data hacia atrás.
 *
 * Los cortes se calculan siempre contra el `Date.now()` real, así que correr
 * las marcas de tiempo hacia atrás es equivalente a que pase el tiempo — y no
 * obliga a mockear el reloj de PGlite, que corre en su propio proceso WASM.
 */
async function avanzarReloj(db: PGlite, minutos: number) {
  await db.query(
    `UPDATE "backfill_jobs" SET
       "startedAt"   = "startedAt"   - ($1 || ' minutes')::interval,
       "lastChunkAt" = "lastChunkAt" - ($1 || ' minutes')::interval,
       "createdAt"   = "createdAt"   - ($1 || ' minutes')::interval,
       "updatedAt"   = "updatedAt"   - ($1 || ' minutes')::interval`,
    [String(minutos)],
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

// ══════════════════════════════════════════════════════════════════════════
// EL REAPER Y EL CLAIM, JUNTOS
// ══════════════════════════════════════════════════════════════════════════
// Todo lo de arriba prueba el UPDATE del reaper AISLADO: se inserta a mano un
// job con `lastChunkAt` de hace 3 horas y se verifica que muera. Nunca corre el
// claim en el medio.
//
// Y ahí estaba el agujero. El claim escribía `lastChunkAt = NOW()`, el cron
// corre CADA MINUTO y el cooldown para re-tomar un job es de 2. O sea que un
// job roto se re-reclamaba cada 2 minutos y se refrescaba el latido solo: nunca
// llegaba a los 30 minutos que el reaper exige. **El reaper no podía dispararse
// jamás**, y el job zombie seguía bloqueando la cola exactamente igual que
// antes de que lo escribiéramos. Los 8 tests de arriba pasaban en verde.
//
// Estos tests simulan el ciclo completo, tick por tick, y son la razón por la
// que ahora hay dos relojes: `updatedAt` (tomado) y `lastChunkAt` (avanza).
// ══════════════════════════════════════════════════════════════════════════

/**
 * El claim como estaba ANTES del arreglo. Está acá, y no importado, a propósito:
 * es la única forma de probar que este test distingue una versión de la otra.
 * Si alguien vuelve a meter `lastChunkAt` en el claim, el test de abajo falla.
 */
const CLAIM_VIEJO_QUE_PISABA_EL_LATIDO = `UPDATE "backfill_jobs" j
        SET "status" = 'RUNNING',
            "startedAt" = COALESCE(j."startedAt", NOW()),
            "lastChunkAt" = NOW(),
            "updatedAt" = NOW()
      WHERE j."id" = (
        SELECT c."id" FROM "backfill_jobs" c
         WHERE c."status" = 'QUEUED'
            OR (c."status" = 'RUNNING'
                AND (c."lastChunkAt" IS NULL OR c."lastChunkAt" < $1))
         ORDER BY CASE c."status" WHEN 'RUNNING' THEN 0 ELSE 1 END,
                  c."createdAt" ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING j.*`;

/**
 * Un tick del cron `backfill-runner`, en el mismo orden que el runner real:
 * primero el reaper, después el intento de tomar trabajo, y al final pasa un
 * minuto.
 */
async function tick(
  db: PGlite,
  o: { claimSql?: string; elChunkAnda?: boolean } = {},
): Promise<{ muertos: string[]; tomado: string | null }> {
  const muertos = await reaper(db);
  const r = await db.query<any>(o.claimSql ?? RECLAMAR_PROXIMO_JOB_SQL, [
    new Date(Date.now() - COOLDOWN_MS),
  ]);
  const tomado = r.rows[0]?.id ?? null;
  // Un chunk exitoso mueve `lastChunkAt`; uno que falla, no. Es lo que hace
  // `updateJobProgress` con `tocarLatido: !result.error`.
  if (tomado && o.elChunkAnda) {
    await db.query(`UPDATE "backfill_jobs" SET "lastChunkAt" = NOW() WHERE id = $1`, [
      tomado,
    ]);
  }
  await avanzarReloj(db, 1);
  return { muertos, tomado };
}

describe("el reaper y el claim, juntos", () => {
  it("EL BUG: con el claim viejo, un job roto sobrevive para siempre", async () => {
    // 60 ticks = una hora, con un corte de 30 minutos. No muere ninguno.
    const db = await nuevaDb();
    await job(db, "roto", { status: "QUEUED" });

    const muertos: string[] = [];
    let veces = 0;
    for (let m = 0; m < 60; m++) {
      const t = await tick(db, { claimSql: CLAIM_VIEJO_QUE_PISABA_EL_LATIDO });
      muertos.push(...t.muertos);
      if (t.tomado) veces++;
    }

    expect(veces).toBeGreaterThan(10); // se lo re-tomaba cada 2 minutos
    expect(muertos).toEqual([]); // …y por eso no moría nunca
    expect(await estado(db, "roto")).toBe("RUNNING");
    await db.close();
  });

  it("con el claim de ahora, el mismo job roto muere a los 30 minutos", async () => {
    const db = await nuevaDb();
    await job(db, "roto", { status: "QUEUED" });

    const muertos: string[] = [];
    let minutoDeLaMuerte = -1;
    for (let m = 0; m < 60; m++) {
      const t = await tick(db);
      if (t.muertos.length > 0 && minutoDeLaMuerte < 0) minutoDeLaMuerte = m;
      muertos.push(...t.muertos);
    }

    expect(muertos).toEqual(["roto"]);
    expect(await estado(db, "roto")).toBe("FAILED");
    // Ni antes de tiempo ni mucho después: el corte son 30 minutos.
    expect(minutoDeLaMuerte).toBeGreaterThanOrEqual(29);
    expect(minutoDeLaMuerte).toBeLessThanOrEqual(32);
    await db.close();
  });

  it("y el cliente que estaba esperando atrás arranca", async () => {
    // La consecuencia real del bug: con maxConcurrentes=1, el job roto de un
    // cliente le tapaba el alta a TODOS los demás.
    const db = await nuevaDb();
    await job(db, "roto", { org: "arredo", status: "QUEUED" });
    await job(db, "mundo", { org: "mundo", status: "QUEUED" });

    const tomados = new Set<string>();
    for (let m = 0; m < 40; m++) {
      const t = await tick(db, { elChunkAnda: false });
      if (t.tomado) tomados.add(t.tomado);
    }

    expect(await estado(db, "roto")).toBe("FAILED");
    expect(tomados.has("mundo")).toBe(true);
    await db.close();
  });

  it("un backfill sano de una hora NO lo mata el reaper", async () => {
    // El otro lado del filo: Arredo trajo 252.701 órdenes y puede tardar horas.
    // Mientras complete chunks, el latido se mueve y no se lo toca.
    const db = await nuevaDb();
    await job(db, "arredo", { status: "QUEUED" });

    const muertos: string[] = [];
    for (let m = 0; m < 60; m++) {
      const t = await tick(db, { elChunkAnda: true });
      muertos.push(...t.muertos);
    }

    expect(muertos).toEqual([]);
    expect(await estado(db, "arredo")).toBe("RUNNING");
    await db.close();
  });

  it("un job que avanza a los tirones tampoco se mata", async () => {
    // Chunks lentos: uno cada 20 minutos. Está vivo, sólo que despacio. El
    // criterio es "sin progreso", no "sin terminar".
    const db = await nuevaDb();
    await job(db, "lento", { status: "QUEUED" });

    const muertos: string[] = [];
    for (let m = 0; m < 90; m++) {
      const t = await tick(db, { elChunkAnda: m % 20 === 0 });
      muertos.push(...t.muertos);
    }

    expect(muertos).toEqual([]);
    await db.close();
  });
});

describe("un backfill fallado no es un alta completa", () => {
  // El complemento del reaper. Antes `areAllJobsComplete` contaba FAILED como
  // terminado, así que el reaper marcaba el job muerto → "todos terminaron" →
  // se disparaba post-backfill-finalize → el cliente quedaba activado con la
  // data a medias. Los dos bugs juntos convertían una caída de VTEX de media
  // hora en un onboarding dado por bueno.
  it("con un job FAILED, el alta NO se da por completa", () => {
    expect(esAltaCompleta({ total: 2, pendientes: 0, fallados: 1 })).toBe(false);
  });

  it("todos COMPLETED sí", () => {
    expect(esAltaCompleta({ total: 2, pendientes: 0, fallados: 0 })).toBe(true);
  });

  it("con jobs todavía corriendo, no", () => {
    expect(esAltaCompleta({ total: 2, pendientes: 1, fallados: 0 })).toBe(false);
  });

  it("sin ningún job tampoco: cero jobs no es un backfill exitoso", () => {
    expect(esAltaCompleta({ total: 0, pendientes: 0, fallados: 0 })).toBe(false);
  });

  it("todos fallados es el caso más obvio y el que más dolía", () => {
    expect(esAltaCompleta({ total: 3, pendientes: 0, fallados: 3 })).toBe(false);
  });
});
