import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  channelCasesFromRules,
  buildChannelRollupStatement,
} from "@/lib/pixel/channel-rollup";
import { SEED_CHANNEL_RULES } from "@/lib/pixel/channel-rules";

// ══════════════════════════════════════════════════════════════════════════
// F3.2 — el rollup resuelve el canal sobre los crudos de la dim
// ══════════════════════════════════════════════════════════════════════════
// El HLL del rollup no se puede cubrir en PGlite (no trae la extensión) → eso
// se verifica en la branch de Neon. Acá se ejecuta la RESOLUCIÓN del canal (el
// CASE de channel_rule) contra filas de dim reales de TeVe: es donde vive la
// correctitud del negocio.
// ══════════════════════════════════════════════════════════════════════════

const { channelCase, subChannelCase } = channelCasesFromRules(SEED_CHANNEL_RULES);

// Casos tomados de la foto real de TeVe (test-canales, 2026-07-27).
const CASES: Array<{
  source: string | null;
  medium: string | null;
  campaign: string | null;
  channel: string;
  sub: string;
}> = [
  { source: "adwords", medium: "search", campaign: null, channel: "Google Ads", sub: "" }, // medium=search, NO cpc → igual entra por fuente
  { source: "facebook", medium: "paid", campaign: null, channel: "Meta Ads", sub: "" },
  { source: "facebook", medium: "paid-social", campaign: null, channel: "Meta Ads", sub: "" },
  { source: "meta", medium: "paid", campaign: null, channel: "Meta Ads", sub: "" },
  { source: "gocuotas", medium: null, campaign: null, channel: "GoCuotas", sub: "" },
  { source: "google", medium: "organic", campaign: null, channel: "Google Orgánico", sub: "" },
  // Sin regla → passthrough (cae en "sin mapear"), el canal es el source crudo.
  { source: "iconmarketing", medium: null, campaign: null, channel: "iconmarketing", sub: "" },
  { source: "tiktok", medium: "paid", campaign: null, channel: "tiktok", sub: "" }, // no sembrado aún
];

describe("F3.2 — resolución de canal sobre la dim (reglas seed)", () => {
  it("resuelve el canal correcto para cada (source,medium,campaign) real", async () => {
    const db = new PGlite();
    await db.query(
      `CREATE TABLE d (id int PRIMARY KEY, source_raw text, medium_raw text, campaign_raw text)`
    );
    for (let i = 0; i < CASES.length; i++) {
      await db.query(
        `INSERT INTO d VALUES ($1,$2,$3,$4)`,
        [i, CASES[i].source, CASES[i].medium, CASES[i].campaign]
      );
    }
    const res = await db.query<{ id: number; ch: string; sub: string }>(
      `SELECT id, COALESCE(${channelCase}, 'sin_clasificar') AS ch,
              COALESCE(${subChannelCase}, '') AS sub
       FROM d ORDER BY id`
    );
    const bad: string[] = [];
    for (const row of res.rows) {
      const c = CASES[row.id];
      if (row.ch !== c.channel || row.sub !== c.sub) {
        bad.push(
          `src=${c.source} med=${c.medium}: got (${row.ch}/${row.sub}) want (${c.channel}/${c.sub})`
        );
      }
    }
    expect(bad, bad.join(" | ")).toEqual([]);
    await db.close();
  });

  it("TV desglosa por señal: source=tv → 'TV' con sub-canal = campaña (AXN)", async () => {
    // La regla TV vive en channel_rule por-org (no en la seed global). La
    // simulamos para verificar el mecanismo del sub-canal.
    const tvRule = {
      id: "org-tv",
      organizationId: "teve",
      priority: 5,
      source: { match: "exact" as const, pattern: "tv" },
      channel: "TV",
      subFrom: "campaign" as const,
    };
    const cases = channelCasesFromRules([tvRule]);
    const db = new PGlite();
    await db.query(
      `CREATE TABLE d (id int PRIMARY KEY, source_raw text, medium_raw text, campaign_raw text)`
    );
    await db.query(`INSERT INTO d VALUES (1,'tv','qr','AXN'),(2,'tv','qr','TNT')`);
    const res = await db.query<{ id: number; ch: string; sub: string }>(
      `SELECT id, COALESCE(${cases.channelCase},'x') ch, COALESCE(${cases.subChannelCase},'') sub
       FROM d ORDER BY id`
    );
    expect(res.rows[0]).toMatchObject({ ch: "TV", sub: "AXN" }); // mayúsculas preservadas
    expect(res.rows[1]).toMatchObject({ ch: "TV", sub: "TNT" });
    await db.close();
  });

  it("el statement del rollup tiene el grain y el upsert correctos", () => {
    const sql = buildChannelRollupStatement(channelCase, subChannelCase, "TRUE");
    expect(sql).toContain("INSERT INTO pixel_daily_channel");
    expect(sql).toContain("COALESCE(" + channelCase); // canal con fallback
    expect(sql).toContain("GROUP BY 1,2,3,4");
    expect(sql).toContain(
      'ON CONFLICT ("organizationId",day,channel,sub_channel) DO UPDATE'
    );
    expect(sql).toContain("LEFT JOIN pixel_visitor_first_source d");
  });
});
