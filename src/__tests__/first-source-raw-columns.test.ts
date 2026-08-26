import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  buildFirstSourceBatchSql,
  buildFirstSourceRawBackfillSql,
} from "@/lib/pixel/first-source-batch";

// ══════════════════════════════════════════════════════════════════════════
// F3.1 canales — la dim guarda el CRUDO del primer toque (Opción C)
// ══════════════════════════════════════════════════════════════════════════
// El batch escribe source_raw/medium_raw/campaign_raw del MISMO evento que fija
// el first_source (el primer toque de marketing, no una vuelta de pago). El
// canal se resuelve DESPUÉS sobre estos crudos vía channel_rule, sin reprocesar
// pixel_events cuando cambia una regla.
// ══════════════════════════════════════════════════════════════════════════

const ORG = "org1";
const BATCH = buildFirstSourceBatchSql();

const DDL = `
CREATE TABLE pixel_visitors (
  id text PRIMARY KEY, "organizationId" text NOT NULL,
  "lastSeenAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pixel_events (
  id text PRIMARY KEY, "organizationId" text NOT NULL, "visitorId" text NOT NULL,
  "sessionId" text, timestamp timestamptz NOT NULL, type text NOT NULL,
  "utmParams" jsonb, "clickIds" jsonb, referrer text, "pageUrl" text
);
CREATE TABLE pixel_visitor_first_source (
  "organizationId" text NOT NULL, "visitorId" text NOT NULL, first_source text NOT NULL,
  source_raw text, medium_raw text, campaign_raw text,
  PRIMARY KEY ("organizationId","visitorId")
);
CREATE TABLE pixel_visitor_no_source (
  "organizationId" text NOT NULL, "visitorId" text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("organizationId","visitorId")
);`;

let seq = 0;
async function evt(
  db: PGlite,
  visitor: string,
  minsAgo: number,
  utm: Record<string, string> | null,
  opts: { clickIds?: object; referrer?: string; pageUrl?: string } = {}
) {
  await db.query(
    `INSERT INTO pixel_events (id,"organizationId","visitorId","sessionId",timestamp,type,"utmParams","clickIds",referrer,"pageUrl")
     VALUES ($1,$2,$3,'s1', now() - make_interval(mins=>$4::int), 'PAGE_VIEW', $5::jsonb, $6::jsonb, $7, $8)`,
    [
      `e${++seq}`, ORG, visitor, minsAgo,
      utm ? JSON.stringify(utm) : null,
      opts.clickIds ? JSON.stringify(opts.clickIds) : null,
      opts.referrer ?? "", opts.pageUrl ?? "https://tienda.com/",
    ]
  );
}

async function freshDb() {
  const db = await PGlite.create();
  await db.exec(DDL);
  return db;
}
const addVisitor = (db: PGlite, v: string) =>
  db.query(`INSERT INTO pixel_visitors (id,"organizationId") VALUES ($1,$2)`, [v, ORG]);
const runBatch = (db: PGlite) => db.query(BATCH, [ORG, 45, 100]);
const dimRow = (db: PGlite, v: string) =>
  db
    .query(
      `SELECT first_source, source_raw, medium_raw, campaign_raw
       FROM pixel_visitor_first_source WHERE "visitorId"=$1`,
      [v]
    )
    .then((r) => r.rows[0] as any);

describe("F3.1 — crudos del primer toque en la dim", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("guarda utm source/medium/campaign crudos del toque elegido", async () => {
    await addVisitor(db, "v1");
    // adwords: las reglas seed lo matchean CRUDO (Google Ads sin depender del medium)
    await evt(db, "v1", 100, { source: "adwords", medium: "cpc", campaign: "Summer" });
    await runBatch(db);
    const r = await dimRow(db, "v1");
    expect(r.source_raw).toBe("adwords");
    expect(r.medium_raw).toBe("cpc");
    expect(r.campaign_raw).toBe("Summer"); // sin normalizar
  });

  it("campaign preserva mayúsculas (AXN/TNT para el sub-canal TV)", async () => {
    await addVisitor(db, "v1");
    await evt(db, "v1", 100, { source: "tv", campaign: "AXN" });
    await runBatch(db);
    expect((await dimRow(db, "v1")).campaign_raw).toBe("AXN");
  });

  it("sin utm_source pero con fbclid: source_raw cae al resuelto (meta)", async () => {
    await addVisitor(db, "v1");
    await evt(db, "v1", 100, null, { clickIds: { fbclid: "abc" } });
    await runBatch(db);
    const r = await dimRow(db, "v1");
    expect(r.first_source).toBe("meta");
    expect(r.source_raw).toBe("meta"); // fallback al resuelto, no NULL
    // fbclid NO deriva medium='paid' (Fase B): FB/IG lo ponen en clicks orgánicos
    // también → no prueba pago. medium queda '' (no vino utm_medium).
    expect(r.medium_raw).toBe("");
    expect(r.campaign_raw).toBeNull();
  });

  it("los crudos salen del MISMO evento que fija el first_source (el primero)", async () => {
    await addVisitor(db, "v1");
    // el primero manda: adwords; un toque posterior (facebook) no debe pisar
    await evt(db, "v1", 100, { source: "adwords", medium: "cpc", campaign: "A" });
    await evt(db, "v1", 50, { source: "facebook", medium: "social", campaign: "B" });
    await runBatch(db);
    const r = await dimRow(db, "v1");
    expect(r.source_raw).toBe("adwords");
    expect(r.campaign_raw).toBe("A");
  });

  it("medium/campaign vacíos → medium_raw '' y campaign_raw NULL", async () => {
    await addVisitor(db, "v1");
    await evt(db, "v1", 100, { source: "google", medium: "", campaign: "" });
    await runBatch(db);
    const r = await dimRow(db, "v1");
    expect(r.source_raw).toBe("google");
    expect(r.medium_raw).toBe("");
    expect(r.campaign_raw).toBeNull();
  });

  it("el backfill rellena crudos de filas viejas (source_raw NULL), idempotente", async () => {
    await addVisitor(db, "v1");
    await evt(db, "v1", 100, { source: "adwords", medium: "cpc", campaign: "X" });
    // Simular fila VIEJA: first_source seteado, crudos en NULL (como en prod).
    await db.query(
      `INSERT INTO pixel_visitor_first_source ("organizationId","visitorId",first_source)
       VALUES ($1,'v1','google')`,
      [ORG]
    );
    let r = await dimRow(db, "v1");
    expect(r.source_raw).toBeNull(); // antes del backfill

    const BACKFILL = buildFirstSourceRawBackfillSql();
    await db.query(BACKFILL, [ORG]);
    r = await dimRow(db, "v1");
    expect(r.source_raw).toBe("adwords"); // el crudo del primer toque
    expect(r.medium_raw).toBe("cpc");
    expect(r.first_source).toBe("google"); // NO se toca

    // Idempotente: correrlo de nuevo no rompe ni cambia.
    await db.query(BACKFILL, [ORG]);
    expect((await dimRow(db, "v1")).source_raw).toBe("adwords");
  });
});
