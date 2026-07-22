import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  buildFirstSourceBatchSql,
  buildHasPendingSql,
} from "@/lib/pixel/first-source-batch";

// ══════════════════════════════════════════════════════════════════════════
// SQL EJECUTADO DE VERDAD — el batch de first-source tiene que CONVERGER.
// ══════════════════════════════════════════════════════════════════════════
// Historia: este cron acumuló TRES bugs en un día, todos encontrados corriéndolo
// a mano contra prod, ninguno por la suite (query pesada, `pending` mal
// calculado, loop sin presupuesto). El cuarto fue que no convergía: los
// visitantes sin canal de marketing volvían a ser candidatos en cada pasada.
//
// Este test no mira subcadenas del SQL: lo ejecuta y verifica el invariante que
// importa — correrlo dos veces deja CERO candidatos.
// ══════════════════════════════════════════════════════════════════════════

const ORG = "org1";
const BATCH = buildFirstSourceBatchSql();
const PENDING = buildHasPendingSql();

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

interface EventSpec {
  visitor: string;
  minutesAgo: number;
  type?: string;
  utmSource?: string | null;
  referrer?: string | null;
  pageUrl?: string | null;
  sessionId?: string | null;
}

let eventSeq = 0;

async function seed(db: PGlite, visitors: string[], events: EventSpec[]) {
  for (const v of visitors) {
    await db.query(
      `INSERT INTO pixel_visitors (id,"organizationId","lastSeenAt") VALUES ($1,$2, now())`,
      [v, ORG]
    );
  }
  for (const e of events) {
    await db.query(
      `INSERT INTO pixel_events (id,"organizationId","visitorId","sessionId",timestamp,type,"utmParams","clickIds",referrer,"pageUrl")
       VALUES ($1,$2,$3,$4, now() - make_interval(mins => $5::int), $6, $7::jsonb, NULL, $8, $9)`,
      [
        // id único global: `seed` se llama más de una vez por test y un contador
        // local reiniciaba en 0 → colisión de PK.
        `e${++eventSeq}`,
        ORG,
        e.visitor,
        e.sessionId ?? "s1",
        e.minutesAgo,
        e.type ?? "PAGE_VIEW",
        e.utmSource ? JSON.stringify({ source: e.utmSource }) : null,
        e.referrer ?? "",
        e.pageUrl ?? "https://tienda.com/",
      ]
    );
  }
}

const runBatch = (db: PGlite, limit = 100) =>
  db.query(BATCH, [ORG, 45, limit]).then((r) => r.rows[0] as any);

const stillPending = (db: PGlite) =>
  db.query(PENDING, [ORG, 45]).then((r) => (r.rows[0] as any).more as boolean);

async function freshDb() {
  const db = await PGlite.create();
  await db.exec(DDL);
  return db;
}

describe("batch de first-source — ejecutado contra Postgres", () => {
  it("resuelve el canal del PRIMER touch, no de cualquiera", async () => {
    const db = await freshDb();
    await seed(db, ["v1"], [
      { visitor: "v1", minutesAgo: 100, utmSource: "google" }, // primero
      { visitor: "v1", minutesAgo: 10, utmSource: "meta_ads" }, // posterior
    ]);
    const r = await runBatch(db);
    expect(r.resolved).toBe(1);
    const row = await db.query(`SELECT first_source FROM pixel_visitor_first_source`);
    expect((row.rows[0] as any).first_source).toBe("google");
  });

  it("marca como SIN CANAL al visitante cuyos eventos clasifican todos a NULL", async () => {
    const db = await freshDb();
    // Solo vuelta de pasarela de pago → el CASE devuelve NULL.
    //
    // ⚠️ La URL de checkout es OBLIGATORIA para que esto sea una vuelta de pago
    // (2026-07-22). Un `utm_source` de pasarela sobre una página normal ya NO se
    // anula: es una LLEGADA desde la pasarela, que es un canal real. Sin esta
    // URL el test estaría fijando el bug que costó 8.751 visitantes.
    await seed(db, ["v_muerto"], [
      {
        visitor: "v_muerto",
        minutesAgo: 30,
        utmSource: "mercadopago",
        pageUrl: "https://tienda.com/checkout/orderPlaced",
      },
    ]);
    const r = await runBatch(db);
    expect(r.candidates).toBe(1);
    expect(r.resolved).toBe(0);
    expect(r.marked).toBe(1);
  });

  // ── EL INVARIANTE QUE MOTIVÓ TODO ──────────────────────────────────────────
  it("CONVERGE: la segunda pasada no tiene candidatos", async () => {
    const db = await freshDb();
    await seed(
      db,
      ["v_ok", "v_muerto"],
      [
        { visitor: "v_ok", minutesAgo: 50, utmSource: "google" },
        {
          visitor: "v_muerto",
          minutesAgo: 40,
          utmSource: "gocuotas",
          // Vuelta de pago: sin la URL de checkout esto sería una llegada.
          pageUrl: "https://tienda.com/checkout/orderPlaced",
        },
      ]
    );

    const first = await runBatch(db);
    expect(first.candidates).toBe(2);
    expect(first.resolved).toBe(1);
    expect(first.marked).toBe(1);

    // Sin la tabla marcador, `v_muerto` volvía acá para siempre y el pendiente
    // se clavaba en 1 corrida tras corrida (lo que pasaba con TeVe: 309→311→309).
    const second = await runBatch(db);
    expect(second.candidates).toBe(0);
    expect(second.resolved).toBe(0);
    expect(second.marked).toBe(0);
    expect(await stillPending(db)).toBe(false);
  });

  it("respeta el tope de candidatos por pasada y termina en dos vueltas", async () => {
    const db = await freshDb();
    const visitors = Array.from({ length: 5 }, (_, i) => `v${i}`);
    await seed(
      db,
      visitors,
      visitors.map((v, i) => ({ visitor: v, minutesAgo: 10 + i, utmSource: "google" }))
    );
    const a = await runBatch(db, 3);
    expect(a.candidates).toBe(3);
    expect(await stillPending(db)).toBe(true);
    const b = await runBatch(db, 3);
    expect(b.candidates).toBe(2);
    expect(await stillPending(db)).toBe(false);
  });

  it("ignora las sesiones sintéticas del webhook", async () => {
    const db = await freshDb();
    await seed(db, ["v_wh"], [
      { visitor: "v_wh", minutesAgo: 20, utmSource: "google", sessionId: "webhook-abc" },
    ]);
    const r = await runBatch(db);
    // Es candidato (existe en pixel_visitors) pero no tiene eventos elegibles →
    // se marca, no se resuelve. Y no vuelve a mirarse.
    expect(r.candidates).toBe(1);
    expect(r.resolved).toBe(0);
    expect(r.marked).toBe(1);
    expect(await stillPending(db)).toBe(false);
  });

  it("no re-escribe la fila de un visitante ya resuelto (first-touch inmutable)", async () => {
    const db = await freshDb();
    await seed(db, ["v1"], [{ visitor: "v1", minutesAgo: 60, utmSource: "google" }]);
    await runBatch(db);
    // Llega un evento nuevo de otro canal; el first-touch NO debe cambiar.
    await seed(db, [], [{ visitor: "v1", minutesAgo: 1, utmSource: "meta_ads" }]);
    await runBatch(db);
    const rows = await db.query(`SELECT first_source FROM pixel_visitor_first_source`);
    expect(rows.rows).toHaveLength(1);
    expect((rows.rows[0] as any).first_source).toBe("google");
  });
});
