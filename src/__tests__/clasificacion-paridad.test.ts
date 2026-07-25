import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { touchpointSourceCase } from "@/lib/pixel/touchpoint-source-sql";
import { canonicalMarketingSource } from "@/lib/pixel/source-classification";

// ══════════════════════════════════════════════════════════════════════════
// PARIDAD DE CLASIFICACIÓN (Fase 1 canales, 2026-07-25)
// ══════════════════════════════════════════════════════════════════════════
// Los dos clasificadores de source TIENEN que dar el mismo canal para el mismo
// {source, medium}. Bug (b): `touchpointSourceCase` (lado ATRIBUCIÓN/revenue) NO
// aplicaba los alias (adwords→google, fb→meta) mientras `canonicalMarketingSource`
// / first-source SÍ. El mismo tráfico se agrupaba distinto según qué query
// respondía — los $406M de `adwords` en TeVe aparecían como canal separado de
// Google. Antes de este fix, este test FALLABA (SQL='adwords', JS='google').
//
// Se EJECUTA el CASE SQL en PGlite (clasificación pura, sin `hll`) y se compara
// contra el clasificador JS, que es la referencia. Ambos derivan de los mismos
// `*_UTM_ALIASES`, así que la paridad los ata: si divergen, alguien rompió la
// fuente única.
// ══════════════════════════════════════════════════════════════════════════

const CASES: Array<{ source: string | null; medium: string | null }> = [
  { source: "adwords", medium: "cpc" }, // alias → google (EL bug)
  { source: "ADWORDS", medium: "cpc" }, // + mayúsculas
  { source: "google_ads", medium: "cpc" },
  { source: "fb", medium: "paid" }, // alias → meta
  { source: "fb_ads", medium: "cpc" },
  { source: "ig", medium: "paid" }, // alias → instagram
  { source: "facebook", medium: "cpc" }, // NO alias → 'facebook'
  { source: "google", medium: "organic" }, // → google_organic
  { source: "bing", medium: "organic" }, // → bing_organic
  { source: "instagram", medium: "social" }, // no es buscador → 'instagram'
  { source: "gocuotas", medium: "cpc" }, // passthrough → 'gocuotas'
  { source: "connectif", medium: "email" }, // passthrough
  { source: "  Meta_Ads  ", medium: "cpc" }, // trim + case → meta
  { source: "", medium: null }, // vacío → direct
  { source: null, medium: null }, // null → direct
];

describe("paridad touchpoint (SQL) == canonicalMarketingSource (JS)", () => {
  it("los dos clasificadores dan el MISMO canal para cada source+medium", async () => {
    const db = new PGlite();
    await db.query(`CREATE TABLE tp (id int PRIMARY KEY, data jsonb)`);
    for (let i = 0; i < CASES.length; i++) {
      await db.query(`INSERT INTO tp (id, data) VALUES ($1, $2::jsonb)`, [
        i,
        JSON.stringify({ source: CASES[i].source, medium: CASES[i].medium }),
      ]);
    }
    const sql = touchpointSourceCase("data");
    const res = await db.query<{ id: number; ch: string }>(
      `SELECT id, (${sql}) AS ch FROM tp ORDER BY id`
    );
    const mismatches: string[] = [];
    for (const row of res.rows) {
      const c = CASES[row.id];
      const js = canonicalMarketingSource(c.source, c.medium);
      if (row.ch !== js) {
        mismatches.push(
          `source=${JSON.stringify(c.source)} medium=${JSON.stringify(
            c.medium
          )}: SQL='${row.ch}' JS='${js}'`
        );
      }
    }
    expect(mismatches, mismatches.join(" | ")).toEqual([]);
    await db.close();
  });

  it("el fix concreto: adwords y fb dejan de ser canales propios", async () => {
    const db = new PGlite();
    await db.query(`CREATE TABLE tp (id int PRIMARY KEY, data jsonb)`);
    await db.query(
      `INSERT INTO tp VALUES (1,'{"source":"adwords","medium":"cpc"}'::jsonb),
                            (2,'{"source":"fb","medium":"paid"}'::jsonb)`
    );
    const sql = touchpointSourceCase("data");
    const res = await db.query<{ id: number; ch: string }>(
      `SELECT id,(${sql}) ch FROM tp ORDER BY id`
    );
    expect(res.rows[0].ch).toBe("google"); // antes: 'adwords' (los $406M sueltos)
    expect(res.rows[1].ch).toBe("meta"); // antes: 'fb'
    await db.close();
  });
});
