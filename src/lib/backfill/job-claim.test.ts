import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { RECLAMAR_PROXIMO_JOB_SQL } from "./job-manager";

// ══════════════════════════════════════════════════════════════════════════
// E-08 — dos invocaciones no pueden quedarse con el mismo job
// ══════════════════════════════════════════════════════════════════════════
// `backfill-runner` corre cada minuto con maxDuration=300, y además
// `approve-backfill` lo dispara al instante con waitUntil. O sea que hay dos
// disparadores que pueden coincidir en el mismo segundo.
//
// El código viejo hacía `pickNextJob()` (SELECT) y después `markJobRunning()`
// (UPDATE), en dos queries. Entre una y otra, otra invocación podía correr el
// mismo SELECT y salir con el MISMO job. El "lock" por frescura de
// `lastChunkAt` no servía para un job en QUEUED: todavía no tenía ninguno.
// Resultado: el mismo chunk procesado dos veces, en paralelo, contra Neon.
//
// Se corre contra Postgres de verdad (PGlite) y no contra strings de SQL,
// porque lo que hay que probar es la semántica del UPDATE con subquery, no que
// el texto diga `FOR UPDATE SKIP LOCKED`.
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

async function nuevaDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.query(ESQUEMA);
  return db;
}

async function encolar(
  db: PGlite,
  id: string,
  opts: {
    org?: string;
    creadoHaceMs?: number;
    status?: string;
    /** Último chunk EXITOSO. Es el reloj de "avanza", el que mira el reaper. */
    ultimoChunkHaceMs?: number | null;
    /**
     * Última vez que alguien lo tocó. Es el reloj de "está tomado", el que mira
     * el claim para decidir si está libre. Por defecto acompaña al chunk, que
     * es lo que pasa en un job sano; se separa a propósito en los casos donde
     * la diferencia entre los dos relojes es justo lo que se prueba.
     */
    tocadoHaceMs?: number | null;
  } = {},
) {
  const hace = (ms: number | null | undefined) =>
    ms === undefined || ms === null ? null : new Date(Date.now() - ms);
  const creado = new Date(Date.now() - (opts.creadoHaceMs ?? 0));
  const ultimoChunk = hace(opts.ultimoChunkHaceMs);
  const tocado =
    opts.tocadoHaceMs !== undefined ? hace(opts.tocadoHaceMs) : ultimoChunk;
  await db.query(
    `INSERT INTO "backfill_jobs"
       ("id","organizationId","platform","status","monthsRequested","fromDate","toDate","createdAt","lastChunkAt","updatedAt")
     VALUES ($1,$2,'VTEX',$3,12,NOW(),NOW(),$4,$5,$6)`,
    [id, opts.org ?? "org1", opts.status ?? "QUEUED", creado, ultimoChunk, tocado],
  );
}

/** Una invocación del runner reclamando trabajo. */
async function reclamar(db: PGlite): Promise<any | null> {
  const corte = new Date(Date.now() - COOLDOWN_MS);
  const r = await db.query<any>(RECLAMAR_PROXIMO_JOB_SQL, [corte]);
  return r.rows[0] || null;
}

describe("E-08 — el claim es atómico", () => {
  it("EL BUG: dos invocaciones seguidas NO se llevan el mismo job", async () => {
    const db = await nuevaDb();
    await encolar(db, "j1");

    const primera = await reclamar(db);
    const segunda = await reclamar(db);

    expect(primera?.id).toBe("j1");
    // Con el SELECT+UPDATE viejo, la segunda se llevaba j1 también.
    expect(segunda).toBeNull();
    await db.close();
  });

  it("el claim deja el job listo para que nadie más lo toque", async () => {
    const db = await nuevaDb();
    await encolar(db, "j1");

    const j = await reclamar(db);

    expect(j.status).toBe("RUNNING");
    // El claim marca `updatedAt` — "esto está tomado" — así que entre el claim
    // y el primer chunk el job NO parece libre.
    expect(j.updatedAt).not.toBeNull();
    expect(j.startedAt).not.toBeNull();
    // Y NO toca `lastChunkAt`, que es el reloj de "avanza". Si el claim lo
    // pisara, un job que falla siempre se refrescaría el latido solo cada vez
    // que lo re-toman, y el reaper no llegaría nunca a los 30 minutos.
    // Ver `job-reaper.test.ts` → "el reaper y el claim, juntos".
    expect(j.lastChunkAt).toBeNull();
    await db.close();
  });

  it("dos jobs, dos invocaciones: una cada uno, ninguno repetido", async () => {
    const db = await nuevaDb();
    await encolar(db, "viejo", { creadoHaceMs: 60_000 });
    await encolar(db, "nuevo", { creadoHaceMs: 1_000 });

    const a = await reclamar(db);
    const b = await reclamar(db);
    const c = await reclamar(db);

    expect(a.id).toBe("viejo"); // FIFO por createdAt
    expect(b.id).toBe("nuevo");
    expect(c).toBeNull();
    await db.close();
  });
});

describe("E-08 — qué se considera libre y qué no", () => {
  it("un job RUNNING con chunk fresco NO se reclama", async () => {
    const db = await nuevaDb();
    await encolar(db, "j1", { status: "RUNNING", ultimoChunkHaceMs: 10_000 });
    expect(await reclamar(db)).toBeNull();
    await db.close();
  });

  it("un job RUNNING abandonado SÍ se recupera", async () => {
    // La lambda que lo tenía se murió. Sin esto, el job queda trabado para
    // siempre — y con el límite de concurrencia en 1, tranca la cola entera.
    const db = await nuevaDb();
    await encolar(db, "huerfano", { status: "RUNNING", ultimoChunkHaceMs: 5 * 60_000 });
    const j = await reclamar(db);
    expect(j?.id).toBe("huerfano");
    await db.close();
  });

  it("un RUNNING recién tomado que todavía no hizo un chunk NO se re-reclama", async () => {
    // Los dos relojes en desacuerdo, que es el caso que importa: nunca avanzó
    // (`lastChunkAt` null) pero lo tomaron hace 10 segundos. Sin mirar
    // `updatedAt`, otra invocación se lo llevaría y procesaría el mismo chunk
    // dos veces en paralelo.
    const db = await nuevaDb();
    await encolar(db, "recien", {
      status: "RUNNING",
      ultimoChunkHaceMs: null,
      tocadoHaceMs: 10_000,
    });
    expect(await reclamar(db)).toBeNull();
    await db.close();
  });

  it("un RUNNING abandonado antes del primer chunk SÍ se recupera", async () => {
    // La lambda se murió entre el claim y el primer chunk. Nadie lo tocó hace
    // 5 minutos, así que está libre aunque nunca haya avanzado.
    const db = await nuevaDb();
    await encolar(db, "j1", {
      status: "RUNNING",
      ultimoChunkHaceMs: null,
      tocadoHaceMs: 5 * 60_000,
    });
    expect((await reclamar(db))?.id).toBe("j1");
    await db.close();
  });

  it("recuperar uno abandonado tiene prioridad sobre empezar uno nuevo", async () => {
    // Terminar lo empezado antes que abrir otro frente: si no, con varios
    // clientes entrando, ninguno termina.
    const db = await nuevaDb();
    await encolar(db, "encolado", { creadoHaceMs: 999_999 });
    await encolar(db, "abandonado", {
      status: "RUNNING",
      ultimoChunkHaceMs: 5 * 60_000,
      creadoHaceMs: 1_000,
    });
    expect((await reclamar(db))?.id).toBe("abandonado");
    await db.close();
  });

  it("no toca jobs terminados ni fallados", async () => {
    const db = await nuevaDb();
    await encolar(db, "ok", { status: "COMPLETED" });
    await encolar(db, "mal", { status: "FAILED" });
    expect(await reclamar(db)).toBeNull();
    await db.close();
  });

  it("sin jobs, no explota", async () => {
    const db = await nuevaDb();
    expect(await reclamar(db)).toBeNull();
    await db.close();
  });
});

describe("E-08 — dos clientes nuevos la misma semana", () => {
  it("los jobs de las dos orgs se atienden de a uno y en orden de llegada", async () => {
    // El escenario que el plan pide cubrir explícitamente. Cada `reclamar` es
    // una invocación del runner; con maxConcurrentes=1 sólo una está viva a la
    // vez, pero lo que se prueba acá es que ninguna se pisa con otra.
    const db = await nuevaDb();
    await encolar(db, "A-vtex", { org: "orgA", creadoHaceMs: 40_000 });
    await encolar(db, "A-ml", { org: "orgA", creadoHaceMs: 30_000 });
    await encolar(db, "B-vtex", { org: "orgB", creadoHaceMs: 20_000 });
    await encolar(db, "B-ml", { org: "orgB", creadoHaceMs: 10_000 });

    const tomados: string[] = [];
    for (let i = 0; i < 5; i++) {
      const j = await reclamar(db);
      if (j) tomados.push(j.id);
    }

    expect(tomados).toEqual(["A-vtex", "A-ml", "B-vtex", "B-ml"]);
    expect(new Set(tomados).size).toBe(4); // ninguno repetido
    await db.close();
  });
});
