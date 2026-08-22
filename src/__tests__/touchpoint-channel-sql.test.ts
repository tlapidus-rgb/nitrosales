import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { buildTouchpointChannelCase } from "@/lib/pixel/touchpoint-channel-sql";
import { SEED_CHANNEL_RULES, type ChannelRule } from "@/lib/pixel/channel-rules";
import { buildUserChannelRule } from "@/lib/pixel/user-channel-rule";

// ══════════════════════════════════════════════════════════════════════════
// Resolución de CANAL sobre touchpoints (capa de lectura del serve)
// ══════════════════════════════════════════════════════════════════════════
// Ejecuta el CASE generado sobre filas con forma de touchpoint (JSONB
// {source,medium,campaign}) y verifica el canal. Es SQL puro → PGlite lo corre.
// No toca la matemática de atribución: solo agrupa por canal.
// ══════════════════════════════════════════════════════════════════════════

interface Caso {
  source: string | null;
  medium?: string | null;
  campaign?: string | null;
  expect: string;
  desc: string;
}

const CASOS: Caso[] = [
  { source: "adwords", medium: "cpc", expect: "Google Ads", desc: "adwords/cpc → Google Ads" },
  { source: "meta", medium: "paid", expect: "Meta Ads", desc: "meta/paid → Meta Ads" },
  { source: "fb", medium: "paid", expect: "Meta Ads", desc: "fb/paid → Meta Ads" },
  { source: "google", medium: "organic", expect: "Google Orgánico", desc: "google/organic → orgánico" },
  { source: "gocuotas", medium: null, expect: "GoCuotas", desc: "gocuotas → canal propio" },
  { source: "direct", medium: null, expect: "Directo", desc: "direct → Directo" },
  { source: "", medium: null, expect: "Directo", desc: "vacío → Directo" },
  { source: null, medium: null, expect: "Directo", desc: "null → Directo" },
  { source: "cross", medium: "x", expect: "cross", desc: "desconocido → passthrough" },
  // Divergencia CONOCIDA vs la dim: attribution.ts clasifica el referrer de app
  // móvil como 'instagram', así que el touchpoint trae source='instagram' y esta
  // resolución lo manda a Instagram Orgánico (la dim lo tendría como 'referral').
  { source: "instagram", medium: "social", expect: "Instagram Orgánico", desc: "instagram/social (app móvil) → Instagram Orgánico" },
];

describe("touchpoint-channel-sql — canal sobre touchpoints (seed globales)", () => {
  it("resuelve el canal correcto para cada (source,medium)", async () => {
    const db = new PGlite();
    await db.query(`CREATE TABLE t (id int PRIMARY KEY, tp jsonb)`);
    for (let i = 0; i < CASOS.length; i++) {
      await db.query(`INSERT INTO t VALUES ($1, $2::jsonb)`, [
        i,
        JSON.stringify({ source: CASOS[i].source, medium: CASOS[i].medium ?? null, campaign: CASOS[i].campaign ?? null }),
      ]);
    }
    const sql = buildTouchpointChannelCase(SEED_CHANNEL_RULES, "t.tp");
    const res = await db.query<{ id: number; ch: string }>(
      `SELECT id, (${sql}) AS ch FROM t ORDER BY id`
    );
    const fails: string[] = [];
    for (const row of res.rows) {
      const c = CASOS[row.id];
      if (row.ch !== c.expect) fails.push(`${c.desc}: esperaba '${c.expect}', dio '${row.ch}'`);
    }
    expect(fails, "\n" + fails.join("\n")).toEqual([]);
    await db.close();
  });

  it("una regla de la ORG gana sobre el passthrough (mapeo del cliente)", async () => {
    const db = new PGlite();
    await db.query(`CREATE TABLE t (id int PRIMARY KEY, tp jsonb)`);
    await db.query(`INSERT INTO t VALUES (1, '{"source":"hotsale"}'::jsonb)`);
    const userRule = buildUserChannelRule({ organizationId: "org1", source: "hotsale", channel: "Hot Sale" });
    const rules: ChannelRule[] = [userRule, ...SEED_CHANNEL_RULES];
    const sql = buildTouchpointChannelCase(rules, "t.tp");
    const res = await db.query<{ ch: string }>(`SELECT (${sql}) ch FROM t`);
    expect(res.rows[0].ch).toBe("Hot Sale"); // sin la regla: passthrough 'hotsale'
    await db.close();
  });
});
