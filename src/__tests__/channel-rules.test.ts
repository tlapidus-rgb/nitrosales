import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  buildChannelRuleCase,
  buildIsMappedCase,
  SEED_CHANNEL_RULES,
} from "@/lib/pixel/channel-rules";

// ══════════════════════════════════════════════════════════════════════════
// MOTOR DE RESOLUCIÓN DE CANAL (Opción C, Fase 2)
// ══════════════════════════════════════════════════════════════════════════
// Ejecuta el CASE SQL generado por buildChannelRuleCase (con las reglas seed
// globales) en PGlite y verifica que las 4 decisiones de Tomy resuelvan al canal
// correcto. Es SQL puro (sin hll), así que PGlite lo corre.
// ══════════════════════════════════════════════════════════════════════════

// Espejo de la normalización que hará el rollup/preview: source vacío → 'direct'.
const EXPRS = {
  source: `COALESCE(NULLIF(LOWER(TRIM(data->>'source')), ''), 'direct')`,
  medium: `LOWER(TRIM(COALESCE(data->>'medium', '')))`,
  campaign: `LOWER(TRIM(COALESCE(data->>'campaign', '')))`,
};

interface Case {
  source: string | null;
  medium?: string | null;
  expect: string;
  desc: string;
}

const CASES: Case[] = [
  // Decisión 1+2 — Meta unificado, pago vs orgánico
  { source: "fb", medium: "paid", expect: "Meta Ads", desc: "fb pago → Meta Ads" },
  { source: "facebook", medium: "cpc", expect: "Meta Ads", desc: "facebook cpc → Meta Ads (pago gana a orgánico por prioridad)" },
  { source: "facebook", medium: "social", expect: "Facebook Orgánico", desc: "facebook social → orgánico" },
  { source: "instagram", medium: "paid", expect: "Meta Ads", desc: "instagram pago → Meta Ads (centralizado)" },
  { source: "ig", medium: "paid", expect: "Meta Ads", desc: "ig (alias) pago → Meta Ads (P2)" },
  { source: "instagram_ads", medium: "cpc", expect: "Meta Ads", desc: "instagram_ads → Meta Ads (P2)" },
  { source: "instagram", medium: "social", expect: "Instagram Orgánico", desc: "instagram social → orgánico" },
  { source: "an", medium: "paid", expect: "Meta Ads", desc: "Audience Network → Meta Ads" },
  { source: "th", medium: "paid", expect: "Meta Ads", desc: "Threads → Meta Ads" },
  // Decisión 1 — Google
  { source: "adwords", medium: "cpc", expect: "Google Ads", desc: "adwords → Google Ads (los $406M)" },
  { source: "ADWORDS", medium: "cpc", expect: "Google Ads", desc: "ADWORDS mayúsculas → Google Ads" },
  { source: "google", medium: "cpc", expect: "Google Ads", desc: "google cpc → Google Ads" },
  { source: "google", medium: "organic", expect: "Google Orgánico", desc: "google organic → orgánico" },
  // Decisión 3 — pasarelas como canal propio
  { source: "gocuotas", medium: "cpc", expect: "GoCuotas", desc: "gocuotas → canal propio" },
  { source: "mercadopago", medium: "", expect: "Mercado Pago", desc: "mercadopago → canal propio" },
  { source: "MODO", medium: "", expect: "MODO", desc: "MODO (case) → canal propio" },
  // Básicos + passthrough
  { source: "direct", medium: "", expect: "Directo", desc: "direct → Directo" },
  { source: "", medium: "", expect: "Directo", desc: "vacío → Directo" },
  { source: null, medium: null, expect: "Directo", desc: "null → Directo" },
  { source: "algo_desconocido", medium: "x", expect: "algo_desconocido", desc: "desconocido → passthrough (sin mapear)" },
];

describe("channel-rules — resolución de canal (seed globales)", () => {
  it("las 4 decisiones de Tomy resuelven al canal correcto", async () => {
    const db = new PGlite();
    await db.query(`CREATE TABLE t (id int PRIMARY KEY, data jsonb)`);
    for (let i = 0; i < CASES.length; i++) {
      await db.query(`INSERT INTO t (id, data) VALUES ($1, $2::jsonb)`, [
        i,
        JSON.stringify({ source: CASES[i].source, medium: CASES[i].medium ?? null }),
      ]);
    }
    const sql = buildChannelRuleCase(SEED_CHANNEL_RULES, EXPRS);
    const res = await db.query<{ id: number; ch: string }>(
      `SELECT id, (${sql}) AS ch FROM t ORDER BY id`
    );
    const fails: string[] = [];
    for (const row of res.rows) {
      const c = CASES[row.id];
      if (row.ch !== c.expect) {
        fails.push(`${c.desc}: esperaba '${c.expect}', dio '${row.ch}'`);
      }
    }
    expect(fails, "\n" + fails.join("\n")).toEqual([]);
    await db.close();
  });

  it("el orden por prioridad importa: pago siempre gana sobre orgánico", async () => {
    const db = new PGlite();
    await db.query(`CREATE TABLE t (id int PRIMARY KEY, data jsonb)`);
    // mismo source, distinto medium → distinto canal
    await db.query(
      `INSERT INTO t VALUES (1,'{"source":"facebook","medium":"cpc"}'::jsonb),
                           (2,'{"source":"facebook","medium":"social"}'::jsonb)`
    );
    const sql = buildChannelRuleCase(SEED_CHANNEL_RULES, EXPRS);
    const res = await db.query<{ id: number; ch: string }>(
      `SELECT id,(${sql}) ch FROM t ORDER BY id`
    );
    expect(res.rows[0].ch).toBe("Meta Ads");
    expect(res.rows[1].ch).toBe("Facebook Orgánico");
    await db.close();
  });

  it("buildIsMappedCase distingue resuelto de passthrough (sin mapear)", async () => {
    const db = new PGlite();
    await db.query(`CREATE TABLE t (id int PRIMARY KEY, data jsonb)`);
    await db.query(
      `INSERT INTO t VALUES
        (1,'{"source":"fb","medium":"paid"}'::jsonb),
        (2,'{"source":"algo_raro","medium":"x"}'::jsonb),
        (3,'{"source":"direct"}'::jsonb)`
    );
    const sql = buildIsMappedCase(SEED_CHANNEL_RULES, EXPRS);
    const res = await db.query<{ id: number; mapped: boolean }>(
      `SELECT id, ${sql} AS mapped FROM t ORDER BY id`
    );
    expect(res.rows.map((r) => r.mapped)).toEqual([true, false, true]); // 2 = sin mapear
    await db.close();
  });
});
