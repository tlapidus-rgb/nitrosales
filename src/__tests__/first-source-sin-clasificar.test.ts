import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  buildFirstSourceBatchSql,
  buildHasPendingSql,
  buildUnresolvedByOrgSql,
} from "@/lib/pixel/first-source-batch";

// ══════════════════════════════════════════════════════════════════════════
// REGRESIÓN — los dos caminos por los que un visitante quedaba 'sin_clasificar'
// ══════════════════════════════════════════════════════════════════════════
// Reclamo del cliente (2026-07-22, vía Tomy): "Sin clasificar" era uno de los
// canales con más visitas. Medido en prod: 3-5% del total por org, repartido en
// dos poblaciones que en la UI se ven idénticas:
//   · marcados en pixel_visitor_no_source  (Arredo 3.241 · EMDJ 6.308 · TeVe 252)
//   · sin fila en NINGUNA tabla            (Arredo 20.092 · EMDJ 9.076 · TeVe 3.841)
//
// La investigación descartó lo primero que parecía: el CASE de clasificación
// está BIEN (test A). Los dos defectos reales estaban en el control del proceso,
// no en la lógica de negocio.
//
// Estos tests ejecutan el SQL de producción contra un Postgres real.
// ══════════════════════════════════════════════════════════════════════════

const ORG = "org1";
const BATCH = buildFirstSourceBatchSql();
const PENDING = buildHasPendingSql();
const UNRESOLVED = buildUnresolvedByOrgSql();

const DDL = `
CREATE TABLE pixel_visitors (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "lastSeenAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pixel_events (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "visitorId" text NOT NULL,
  "sessionId" text,
  timestamp timestamptz NOT NULL,
  type text NOT NULL,
  "utmParams" jsonb,
  "clickIds" jsonb,
  referrer text,
  "pageUrl" text
);
CREATE TABLE pixel_visitor_first_source (
  "organizationId" text NOT NULL, "visitorId" text NOT NULL, first_source text NOT NULL,
  PRIMARY KEY ("organizationId","visitorId")
);
CREATE TABLE pixel_visitor_no_source (
  "organizationId" text NOT NULL, "visitorId" text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("organizationId","visitorId")
);
`;

let seq = 0;

async function addVisitor(db: PGlite, id: string, lastSeenDaysAgo = 0) {
  await db.query(
    `INSERT INTO pixel_visitors (id,"organizationId","lastSeenAt")
     VALUES ($1,$2, now() - make_interval(days => $3::int))`,
    [id, ORG, lastSeenDaysAgo]
  );
}

async function addEvent(
  db: PGlite,
  visitor: string,
  opts: {
    minutesAgo?: number;
    type?: string;
    utmSource?: string | null;
    referrer?: string | null;
    pageUrl?: string | null;
  } = {}
) {
  await db.query(
    `INSERT INTO pixel_events (id,"organizationId","visitorId","sessionId",timestamp,type,"utmParams","clickIds",referrer,"pageUrl")
     VALUES ($1,$2,$3,'s1', now() - make_interval(mins => $4::int), $5, $6::jsonb, NULL, $7, $8)`,
    [
      `e${++seq}`,
      ORG,
      visitor,
      opts.minutesAgo ?? 30,
      opts.type ?? "PAGE_VIEW",
      opts.utmSource ? JSON.stringify({ source: opts.utmSource }) : null,
      opts.referrer ?? "",
      opts.pageUrl ?? "https://tienda.com/producto/123",
    ]
  );
}

/** Simula que el visitante vuelve al sitio: mueve `lastSeenAt` a ahora. */
const touchVisitor = (db: PGlite, v: string) =>
  db.query(`UPDATE pixel_visitors SET "lastSeenAt" = now() WHERE id=$1`, [v]);

const runBatch = (db: PGlite, windowDays = 45, limit = 100) =>
  db.query(BATCH, [ORG, windowDays, limit]).then((r) => r.rows[0] as any);

const firstSourceOf = (db: PGlite, v: string) =>
  db
    .query(`SELECT first_source FROM pixel_visitor_first_source WHERE "visitorId"=$1`, [v])
    .then((r) => (r.rows[0] as any)?.first_source ?? null);

const hasPending = (db: PGlite, days: number) =>
  db.query(PENDING, [ORG, days]).then((r) => (r.rows[0] as any).more as boolean);

const unresolved = (db: PGlite, days: number) =>
  db.query(UNRESOLVED, [days]).then((r) => ((r.rows[0] as any)?.unresolved ?? 0) as number);

async function freshDb() {
  const db = await PGlite.create();
  await db.exec(DDL);
  return db;
}

describe("sin_clasificar — los dos caminos que dejaban visitantes sin canal", () => {
  // ── Control: la lógica de clasificación NO era el problema ────────────────
  it("un PAGE_VIEW en página normal sin referrer resuelve a 'direct'", async () => {
    const db = await freshDb();
    await addVisitor(db, "v_directo");
    await addEvent(db, "v_directo");

    const r = await runBatch(db);

    expect(r.resolved).toBe(1);
    expect(r.marked).toBe(0);
    expect(await firstSourceOf(db, "v_directo")).toBe("direct");
  });

  // ── DEFECTO 1: el marcado "sin canal" no caducaba ─────────────────────────
  it("re-evalúa al visitante marcado sin canal que DESPUÉS vuelve y navega", async () => {
    const db = await freshDb();
    await addVisitor(db, "v_vuelve");
    // Primer contacto: sólo vuelta de pasarela → clasifica a NULL, se marca.
    await addEvent(db, "v_vuelve", {
      minutesAgo: 600,
      utmSource: "mercadopago",
      pageUrl: "https://tienda.com/checkout/orderPlaced",
    });

    expect((await runBatch(db)).marked).toBe(1);
    expect(await firstSourceOf(db, "v_vuelve")).toBe(null);

    // Vuelve al día siguiente y navega el sitio de verdad.
    await addEvent(db, "v_vuelve", { minutesAgo: 10 });
    await touchVisitor(db, "v_vuelve");

    const second = await runBatch(db);

    // Antes del fix: candidates=0 y se quedaba en 'sin_clasificar' PARA SIEMPRE.
    expect(second.candidates).toBe(1);
    expect(second.resolved).toBe(1);
    expect(await firstSourceOf(db, "v_vuelve")).toBe("direct");
  });

  // ── La mitad que protege al fix de arriba ─────────────────────────────────
  it("CONVERGE: el marcado que no volvió no se re-evalúa", async () => {
    const db = await freshDb();
    await addVisitor(db, "v_muerto");
    await addEvent(db, "v_muerto", { minutesAgo: 40, utmSource: "gocuotas" });

    expect((await runBatch(db)).marked).toBe(1);

    // Sin `DO UPDATE SET checked_at`, la caducidad del defecto 1 haría que este
    // visitante vuelva a ser candidato en CADA pasada y el backfill no termine
    // nunca — la no-convergencia que la tabla vino a arreglar.
    const second = await runBatch(db);
    expect(second.candidates).toBe(0);
    expect(await hasPending(db, 45)).toBe(false);

    // Y sigue convergido después de re-marcarlo varias veces.
    expect((await runBatch(db)).candidates).toBe(0);
  });

  it("CONVERGE: un visitante que vuelve dos veces sin canal no loopea", async () => {
    const db = await freshDb();
    await addVisitor(db, "v_pasarela");
    await addEvent(db, "v_pasarela", {
      minutesAgo: 600,
      utmSource: "mercadopago",
      pageUrl: "https://tienda.com/checkout/orderPlaced",
    });
    expect((await runBatch(db)).marked).toBe(1);

    // Vuelve, pero otra vez sólo pasa por el checkout → sigue sin canal.
    await addEvent(db, "v_pasarela", {
      minutesAgo: 5,
      utmSource: "mercadopago",
      pageUrl: "https://tienda.com/checkout/orderPlaced",
    });
    await touchVisitor(db, "v_pasarela");

    expect((await runBatch(db)).marked).toBe(1); // se re-evalúa y se re-marca
    expect((await runBatch(db)).candidates).toBe(0); // y vuelve a converger
    expect(await hasPending(db, 45)).toBe(false);
  });

  // ── DEFECTO 2: la métrica era ciega justo donde el proceso fallaba ────────
  it("los visitantes fuera de la ventana del batch SÍ figuran como sin resolver", async () => {
    const db = await freshDb();
    // Última actividad hace 10 días. El cron diario corre con days=3.
    await addVisitor(db, "v_viejo", 10);
    await addEvent(db, "v_viejo", { minutesAgo: 10 * 24 * 60, utmSource: "google" });

    const r = await runBatch(db, 3);
    expect(r.candidates).toBe(0); // el batch no lo alcanza, y está bien

    // `pending` sigue diciendo "no hay trabajo AHORA": correcto y acotado.
    expect(await hasPending(db, 3)).toBe(false);

    // Pero en el horizonte de reporte tiene que ser VISIBLE. Antes del fix no
    // existía esta medida y el visitante desaparecía de la selección y de la
    // métrica al mismo tiempo: el cron reportaba éxito con el trabajo sin hacer.
    expect(await unresolved(db, 90)).toBe(1);

    // Y una pasada ancha lo recupera: es la acción que la métrica dispara.
    expect((await runBatch(db, 90)).resolved).toBe(1);
    expect(await firstSourceOf(db, "v_viejo")).toBe("google");
    expect(await unresolved(db, 90)).toBe(0);
  });

  it("un visitante marcado sin canal NO cuenta como sin resolver dos veces", async () => {
    const db = await freshDb();
    await addVisitor(db, "v_ok");
    await addEvent(db, "v_ok", { utmSource: "google" });
    await addVisitor(db, "v_sin");
    await addEvent(db, "v_sin", { utmSource: "mercadopago" });

    await runBatch(db);

    // `unresolved` cuenta a todo el que no tiene canal asignado, incluido el
    // marcado: es lo que el cliente ve como 'sin_clasificar' en la UI, y esa
    // es la definición que tiene que medir.
    expect(await unresolved(db, 90)).toBe(1);
  });
});
