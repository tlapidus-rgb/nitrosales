import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  buildChannelRuleCase,
  SEED_CHANNEL_RULES,
  type ChannelRule,
} from "@/lib/pixel/channel-rules";
import {
  CHANNEL_RULE_DDL,
  INSERT_CHANNEL_RULE_SQL,
  LOAD_CHANNEL_RULES_SQL,
  ruleInsertParams,
  rowToChannelRule,
  type ChannelRuleRow,
} from "@/lib/pixel/channel-rules-store";

// ══════════════════════════════════════════════════════════════════════════
// PERSISTENCIA + carga de reglas por org (Opción C, Fase 3)
// ══════════════════════════════════════════════════════════════════════════
// Ejecuta el ciclo completo en PGlite: crear tabla, sembrar globales, agregar una
// regla de la org (la TV de TeVe = decisión 4), cargar globales+org y resolver.
// Verifica que la regla de la ORG gane sobre las globales, y que otra org sin esa
// regla no la vea.
// ══════════════════════════════════════════════════════════════════════════

const EXPRS = {
  source: `COALESCE(NULLIF(LOWER(TRIM(data->>'source')), ''), 'direct')`,
  medium: `LOWER(TRIM(COALESCE(data->>'medium', '')))`,
  campaign: `LOWER(TRIM(COALESCE(data->>'campaign', '')))`,
};

const TEVE = "org-teve";
const OTRA = "org-otra";

const TV_RULE: ChannelRule = {
  id: "teve-tv",
  organizationId: TEVE,
  priority: 15,
  source: { match: "exact", pattern: "tv" },
  channel: "TV",
};

async function setup(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(CHANNEL_RULE_DDL); // tabla + índice
  for (const r of SEED_CHANNEL_RULES) {
    await db.query(INSERT_CHANNEL_RULE_SQL, ruleInsertParams(r));
  }
  await db.query(INSERT_CHANNEL_RULE_SQL, ruleInsertParams(TV_RULE));
  return db;
}

async function resolveFor(db: PGlite, orgId: string, inputs: Array<Record<string, unknown>>) {
  const loaded = await db.query<ChannelRuleRow>(LOAD_CHANNEL_RULES_SQL, [orgId]);
  const rules = loaded.rows.map(rowToChannelRule);
  const sql = buildChannelRuleCase(rules, EXPRS);
  await db.exec(`DROP TABLE IF EXISTS t; CREATE TABLE t (id int PRIMARY KEY, data jsonb)`);
  for (let i = 0; i < inputs.length; i++) {
    await db.query(`INSERT INTO t VALUES ($1, $2::jsonb)`, [i, JSON.stringify(inputs[i])]);
  }
  const res = await db.query<{ id: number; ch: string }>(
    `SELECT id, (${sql}) AS ch FROM t ORDER BY id`
  );
  return res.rows.map((r) => r.ch);
}

describe("channel_rule store — reglas por org sobre las globales", () => {
  it("la regla de la ORG gana; las globales siguen aplicando", async () => {
    const db = await setup();
    const out = await resolveFor(db, TEVE, [
      { source: "tv", medium: "" }, // regla org TeVe → TV
      { source: "fb", medium: "paid" }, // global → Meta Ads
      { source: "adwords", medium: "cpc" }, // global → Google Ads
    ]);
    expect(out).toEqual(["TV", "Meta Ads", "Google Ads"]);
    await db.close();
  });

  it("otra org NO ve la regla de TeVe: 'tv' cae en passthrough", async () => {
    const db = await setup();
    const out = await resolveFor(db, OTRA, [{ source: "tv", medium: "" }]);
    expect(out).toEqual(["tv"]); // sin regla → passthrough (sin mapear)
    await db.close();
  });

  it("el seed es idempotente (re-sembrar no duplica)", async () => {
    const db = await setup();
    for (const r of SEED_CHANNEL_RULES) {
      await db.query(INSERT_CHANNEL_RULE_SQL, ruleInsertParams(r)); // segunda vez
    }
    const n = await db.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM channel_rule`);
    expect(n.rows[0].c).toBe(SEED_CHANNEL_RULES.length + 1); // globales + la de TeVe
    await db.close();
  });
});
