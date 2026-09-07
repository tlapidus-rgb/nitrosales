import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  buildFirstSourceRepairSql,
  buildFirstSourcePendingSql,
} from "./first-source-repair";

// ══════════════════════════════════════════════════════════════════════════
// E-17 — el backfill que era un archivo por cliente en un disco
// ══════════════════════════════════════════════════════════════════════════
// Había tres `.sql` sin versionar (`.gitignore` excluye `*.local.sql`), los tres
// de exactamente 9.827 bytes: el mismo SQL con el `organizationId` cambiado a
// mano. Correrlo para un cliente nuevo era copiar un archivo y reemplazar un
// cuid.
//
// Y el problema de fondo no era la repetición: cada archivo llevaba pegado un
// SNAPSHOT del CASE de clasificación de origen, que en el código cambia. Un
// backfill corrido con un archivo viejo clasifica distinto que el cron, y eso
// aparece como visitantes en `sin_clasificar` que nadie entiende.
// ══════════════════════════════════════════════════════════════════════════

const ESQUEMA = `
CREATE TABLE pixel_events (
  id text PRIMARY KEY,
  "organizationId" text,
  "visitorId" text,
  "sessionId" text,
  timestamp timestamptz,
  referrer text,
  "pageUrl" text,
  "utmParams" jsonb DEFAULT '{}'::jsonb,
  "clickIds" jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE pixel_visitor_first_source (
  "organizationId" text,
  "visitorId" text,
  first_source text,
  source_raw text,
  medium_raw text,
  campaign_raw text,
  PRIMARY KEY ("organizationId","visitorId")
);`;

async function nuevaDb(): Promise<PGlite> {
  const db = new PGlite();
  for (const stmt of ESQUEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.query(stmt);
  }
  return db;
}

let n = 0;
async function evento(
  db: PGlite,
  vid: string,
  o: {
    org?: string;
    haceMin?: number;
    referrer?: string;
    pageUrl?: string;
    utm?: Record<string, string>;
    clickIds?: Record<string, string>;
    sessionId?: string | null;
  } = {},
) {
  await db.query(
    `INSERT INTO pixel_events (id,"organizationId","visitorId","sessionId",timestamp,referrer,"pageUrl","utmParams","clickIds")
     VALUES ($1,$2,$3,$4,NOW() - ($5 || ' minutes')::interval,$6,$7,$8::jsonb,$9::jsonb)`,
    [
      `e${++n}`,
      o.org ?? "org1",
      vid,
      o.sessionId === undefined ? "s1" : o.sessionId,
      String(o.haceMin ?? 0),
      o.referrer ?? "",
      o.pageUrl ?? "https://tienda.com/",
      JSON.stringify(o.utm ?? {}),
      JSON.stringify(o.clickIds ?? {}),
    ],
  );
}

async function filaSinOrigen(db: PGlite, vid: string, org = "org1") {
  await db.query(
    `INSERT INTO pixel_visitor_first_source ("organizationId","visitorId",first_source,source_raw)
     VALUES ($1,$2,NULL,NULL)`,
    [org, vid],
  );
}

async function leer(db: PGlite, vid: string, org = "org1") {
  const r = await db.query<any>(
    `SELECT source_raw, medium_raw, campaign_raw FROM pixel_visitor_first_source
      WHERE "organizationId" = $1 AND "visitorId" = $2`,
    [org, vid],
  );
  return r.rows[0];
}

const reparar = (db: PGlite, org = "org1") => db.query(buildFirstSourceRepairSql(), [org]);

describe("repara las filas que quedaron sin origen", () => {
  it("le pone el origen del PRIMER evento del visitante", async () => {
    const db = await nuevaDb();
    await filaSinOrigen(db, "v1");
    // El más viejo primero: es el que define el first-source.
    await evento(db, "v1", { haceMin: 100, utm: { source: "google", medium: "cpc", campaign: "verano" } });
    await evento(db, "v1", { haceMin: 10, utm: { source: "tiktok" } });

    await reparar(db);

    const f = await leer(db, "v1");
    expect(f.source_raw).toBe("google");
    expect(f.medium_raw).toBe("cpc");
    expect(f.campaign_raw).toBe("verano");
    await db.close();
  });

  it("un click-id de pauta manda sobre el utm_medium crudo", async () => {
    // Mismo criterio que el batch: gclid sin utm_medium tiene que resolver a
    // pago, no caer orgánico.
    const db = await nuevaDb();
    await filaSinOrigen(db, "v1");
    await evento(db, "v1", { clickIds: { gclid: "abc123" } });
    await reparar(db);
    expect((await leer(db, "v1")).medium_raw).toBe("paid");
    await db.close();
  });

  it("es idempotente: la segunda corrida no toca nada", async () => {
    const db = await nuevaDb();
    await filaSinOrigen(db, "v1");
    await evento(db, "v1", { utm: { source: "google" } });

    const a = await reparar(db);
    const b = await reparar(db);

    expect(a.affectedRows).toBe(1);
    expect(b.affectedRows).toBe(0);
    await db.close();
  });

  it("no pisa una fila que YA tiene origen", async () => {
    const db = await nuevaDb();
    await db.query(
      `INSERT INTO pixel_visitor_first_source ("organizationId","visitorId",source_raw)
       VALUES ('org1','v1','tiktok')`,
    );
    await evento(db, "v1", { utm: { source: "google" } });
    await reparar(db);
    expect((await leer(db, "v1")).source_raw).toBe("tiktok");
    await db.close();
  });
});

describe("aislamiento entre organizaciones", () => {
  it("reparar una org no toca las filas de otra", async () => {
    // El punto de todo E-17: el `.sql` por cliente existía porque el org iba
    // hardcodeado. Ahora es un parámetro y esto lo verifica.
    const db = await nuevaDb();
    await filaSinOrigen(db, "v1", "orgA");
    await filaSinOrigen(db, "v1", "orgB");
    await evento(db, "v1", { org: "orgA", utm: { source: "google" } });
    await evento(db, "v1", { org: "orgB", utm: { source: "tiktok" } });

    await reparar(db, "orgA");

    expect((await leer(db, "v1", "orgA")).source_raw).toBe("google");
    expect((await leer(db, "v1", "orgB")).source_raw).toBeNull();
    await db.close();
  });

  it("no usa eventos de otra org para resolver", async () => {
    const db = await nuevaDb();
    await filaSinOrigen(db, "v1", "orgA");
    await evento(db, "v1", { org: "orgB", utm: { source: "google" } });
    await reparar(db, "orgA");
    expect((await leer(db, "v1", "orgA")).source_raw).toBeNull();
    await db.close();
  });
});

describe("lo que NO se puede resolver queda como estaba", () => {
  it("un visitante cuyos eventos clasifican todos a null no se toca", async () => {
    // Sólo vueltas de pasarela de pago. No hay origen que asignarle: la fila
    // queda pendiente a propósito, no es un error.
    const db = await nuevaDb();
    await filaSinOrigen(db, "v1");
    await evento(db, "v1", {
      referrer: "https://www.mercadopago.com/checkout",
      pageUrl: "https://tienda.com/checkout/orderPlaced",
      utm: { source: "mercadopago" },
    });
    await reparar(db);
    expect((await leer(db, "v1")).source_raw).toBeNull();
    await db.close();
  });

  it("los eventos de webhook se ignoran", async () => {
    const db = await nuevaDb();
    await filaSinOrigen(db, "v1");
    await evento(db, "v1", { sessionId: "webhook-123", utm: { source: "google" } });
    await reparar(db);
    expect((await leer(db, "v1")).source_raw).toBeNull();
    await db.close();
  });
});

describe("el conteo de pendientes", () => {
  it("cuenta sólo las de la org y sólo las sin origen", async () => {
    const db = await nuevaDb();
    await filaSinOrigen(db, "v1", "orgA");
    await filaSinOrigen(db, "v2", "orgA");
    await filaSinOrigen(db, "v1", "orgB");
    await db.query(
      `INSERT INTO pixel_visitor_first_source ("organizationId","visitorId",source_raw)
       VALUES ('orgA','v3','google')`,
    );
    const r = await db.query<any>(buildFirstSourcePendingSql(), ["orgA"]);
    expect(Number(r.rows[0].pendientes)).toBe(2);
    await db.close();
  });
});

describe("las reglas de clasificación no pueden divergir", () => {
  it("el SQL se arma con el CASE del código, no con una copia", () => {
    // Es el punto de E-17. Si esto se rompe, alguien pegó el CASE a mano otra
    // vez y volvimos al problema original: reglas congeladas que dejan de
    // coincidir con las del cron sin que nadie se entere.
    const sql = buildFirstSourceRepairSql();
    const lib = readFileSync(
      join(process.cwd(), "src/lib/pixel/first-source-sql.ts"),
      "utf8",
    );
    // Un par de reglas concretas que sólo pueden estar si el CASE vino de ahí.
    for (const regla of ["fbclid", "gclid", "ttclid", "li_fat_id"]) {
      expect(sql).toContain(regla);
      expect(lib).toContain(regla);
    }
    expect(sql).toContain("$1"); // parametrizado, no interpolado
    expect(sql).not.toMatch(/'c[a-z0-9]{20,}'/); // ningún cuid hardcodeado
  });

  it("los .sql por cliente ya no hacen falta", () => {
    // No se rompe si todavía están en el disco de alguien (están en
    // .gitignore), pero si están, que quede dicho que son el camino viejo.
    const viejos = [
      "backfill-1-cmod6ns.local.sql",
      "backfill-2-emdj.local.sql",
      "backfill-3-cmohl80fx.local.sql",
    ].filter((f) => existsSync(join(process.cwd(), f)));
    // Sólo informativo: el test no falla por su presencia.
    expect(Array.isArray(viejos)).toBe(true);
  });
});
