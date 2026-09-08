import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { JOBS_ATASCADOS_SQL } from "./checks";

// ══════════════════════════════════════════════════════════════════════════
// El check de jobs de backfill atascados, ejecutado
// ══════════════════════════════════════════════════════════════════════════
// Este check se verificaba con greps de fragmentos de su propio SQL
// (`expect(CHECKS).toContain("'QUEUED','RUNNING'")`) desde
// `observabilidad-altas.test.ts`. La auditoría de calidad de tests del
// 2026-09-07 lo señaló: es el mismo tipo de query que en `job-reaper` sí se
// corre contra Postgres, y acá no, sin motivo aparente.
//
// ── Y ADEMÁS HABÍA UN AGUJERO ────────────────────────────────────────────
// Miraba sólo QUEUED y RUNNING. Eso alcanzaba mientras un job FAILED no le
// importara a nadie — pero desde que `esAltaCompleta` dejó de contar FAILED
// como terminado, **un job fallado es justo lo que retiene el onboarding en
// BACKFILLING**. O sea que el estado más urgente de mirar era el único que este
// check no veía, y el único aviso quedaba a las 12 h, sin decir qué job ni con
// qué error.
// ══════════════════════════════════════════════════════════════════════════

// Dos `query()` separados: PGlite no acepta varias sentencias en uno solo.
const TABLA_JOBS = `CREATE TABLE "backfill_jobs" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "lastError" TEXT,
  "startedAt" TIMESTAMPTZ,
  "lastChunkAt" TIMESTAMPTZ,
  "onboardingRequestId" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
)`;

const TABLA_ALTAS = `CREATE TABLE "onboarding_requests" (
  "id" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL
)`;

const HORA = 3600_000;
const CORTE_H = 3;

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.query(TABLA_JOBS);
  await db.query(TABLA_ALTAS);
});

async function alta(id: string, status: string) {
  await db.query(`INSERT INTO "onboarding_requests" ("id","status") VALUES ($1,$2)`, [
    id,
    status,
  ]);
}

async function job(
  id: string,
  o: { status: string; haceHoras?: number; alta?: string; error?: string },
) {
  const desde = new Date(Date.now() - (o.haceHoras ?? 10) * HORA);
  await db.query(
    `INSERT INTO "backfill_jobs"
       ("id","organizationId","platform","status","lastError","startedAt","createdAt","onboardingRequestId")
     VALUES ($1,'org1','VTEX',$2,$3,$4,$4,$5)`,
    [id, o.status, o.error ?? null, desde, o.alta ?? null],
  );
}

async function atascados(): Promise<string[]> {
  const r = await db.query<any>(JOBS_ATASCADOS_SQL, [
    new Date(Date.now() - CORTE_H * HORA),
  ]);
  return r.rows.map((x: any) => x.id);
}

describe("lo que este check tiene que ver", () => {
  it("un job encolado hace horas: el control de admisión lo está frenando", async () => {
    // El runner devuelve HTTP 200 con `admitido:false`, así que ningún monitor
    // de status lo ve. Este check es el único que se entera.
    await job("j", { status: "QUEUED", haceHoras: 10 });
    expect(await atascados()).toEqual(["j"]);
  });

  it("un job corriendo hace horas sin avanzar", async () => {
    await job("j", { status: "RUNNING", haceHoras: 10 });
    expect(await atascados()).toEqual(["j"]);
  });

  it("EL AGUJERO: un job FALLADO que retiene un alta en curso", async () => {
    await alta("ob1", "BACKFILLING");
    await job("j", { status: "FAILED", haceHoras: 10, alta: "ob1", error: "VTEX 401" });
    expect(await atascados()).toEqual(["j"]);
  });

  it("y sale con el lastError al lado, que es lo único accionable", async () => {
    await alta("ob1", "BACKFILLING");
    await job("j", { status: "FAILED", haceHoras: 10, alta: "ob1", error: "VTEX 401" });
    const r = await db.query<any>(JOBS_ATASCADOS_SQL, [new Date(Date.now() - CORTE_H * HORA)]);
    expect(r.rows[0].lastError).toBe("VTEX 401");
  });
});

describe("lo que NO tiene que ver, para que esto no sea ruido", () => {
  it("un FALLADO de un alta ya resuelta no aparece", async () => {
    // Sin este filtro, un job fallado hace tres meses alertaría para siempre.
    await alta("ob1", "ACTIVE");
    await job("j", { status: "FAILED", haceHoras: 2000, alta: "ob1" });
    expect(await atascados()).toEqual([]);
  });

  it("un FALLADO sin onboarding tampoco: no está reteniendo a nadie", async () => {
    await job("j", { status: "FAILED", haceHoras: 2000 });
    expect(await atascados()).toEqual([]);
  });

  it("se apaga solo cuando el admin resuelve el alta", async () => {
    // La propiedad que hace que esto no acumule ruido: no hay que ir a
    // silenciar nada a mano.
    await alta("ob1", "BACKFILLING");
    await job("j", { status: "FAILED", haceHoras: 10, alta: "ob1" });
    expect(await atascados()).toEqual(["j"]);

    await db.query(`UPDATE "onboarding_requests" SET "status" = 'ACTIVE' WHERE id = 'ob1'`);
    expect(await atascados()).toEqual([]);
  });

  it("un job COMPLETADO nunca aparece", async () => {
    await alta("ob1", "BACKFILLING");
    await job("j", { status: "COMPLETED", haceHoras: 500, alta: "ob1" });
    expect(await atascados()).toEqual([]);
  });

  it("un job encolado recién no es un atasco", async () => {
    await job("j", { status: "QUEUED", haceHoras: 1 });
    expect(await atascados()).toEqual([]);
  });

  it("un RUNNING que completó un chunk hace poco tampoco", async () => {
    // El backfill de Arredo puede durar horas; mientras avance, está sano.
    await job("j", { status: "RUNNING", haceHoras: 10 });
    await db.query(`UPDATE "backfill_jobs" SET "lastChunkAt" = NOW() WHERE id = 'j'`);
    expect(await atascados()).toEqual([]);
  });
});

describe("el orden", () => {
  it("el más viejo primero: es por dónde hay que empezar a mirar", async () => {
    await alta("ob1", "BACKFILLING");
    await job("nuevo", { status: "QUEUED", haceHoras: 4 });
    await job("viejo", { status: "FAILED", haceHoras: 40, alta: "ob1" });
    await job("medio", { status: "RUNNING", haceHoras: 12 });
    expect(await atascados()).toEqual(["viejo", "medio", "nuevo"]);
  });

  it("sin jobs no explota", async () => {
    expect(await atascados()).toEqual([]);
  });
});
