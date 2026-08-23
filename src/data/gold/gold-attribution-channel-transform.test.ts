import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  buildGoldAttributionChannelUpsert,
  buildGoldAttributionChannelBackfill,
} from "./gold-attribution-channel-transform";
import { buildGoldAttributionSourceBackfill } from "./gold-attribution-source-transform";
import { buildTouchpointChannelCase } from "@/lib/pixel/touchpoint-channel-sql";
import { readFileSync } from "fs";
import { join } from "path";

// ══════════════════════════════════════════════════════════════════════════
// gold_attribution_channel = espejo de gold_attribution_source por CANAL.
// Lo CRÍTICO: re-agrupar source→canal NO puede mover la plata. Este test corre
// los DOS transforms sobre los mismos datos y verifica que el total de cada
// componente de revenue es IDÉNTICO (no se pierde ni duplica un peso).
// ══════════════════════════════════════════════════════════════════════════

const REVENUE_COLS = [
  "last_click_revenue", "first_click_revenue", "linear_revenue",
  "nitro_single", "nitro_first2", "nitro_last2", "nitro_first_n", "nitro_last_n", "nitro_middle_n",
];

async function setupDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.query(`CREATE TABLE orders (
    id text PRIMARY KEY, "organizationId" text, "orderDate" timestamptz,
    "totalValue" numeric, status text, "trafficSource" text, "externalId" text,
    source text, channel text
  )`);
  await db.query(`CREATE TABLE pixel_attributions (
    id text PRIMARY KEY, "orderId" text, "organizationId" text,
    "attributedValue" numeric, "touchpointCount" int, touchpoints jsonb,
    model text, "createdAt" timestamptz
  )`);
  // gold tables desde los schemas reales (así el test valida el DDL también).
  // Saca comentarios `--` (hay `;` dentro de comentarios que romperían el split).
  const g = (f: string) => readFileSync(join(__dirname, f), "utf8").replace(/--.*$/gm, "");
  for (const stmt of g("gold-attribution-source.schema.sql").split(";").map((s) => s.trim()).filter(Boolean))
    await db.query(stmt);
  for (const stmt of g("gold-attribution-channel.schema.sql").split(";").map((s) => s.trim()).filter(Boolean))
    await db.query(stmt);

  // 3 órdenes válidas-web con journeys distintos (org1).
  const orders = [
    ["o1", "org1", 100, "DELIVERED"],
    ["o2", "org1", 300, "DELIVERED"],
    ["o3", "org1", 50, "SHIPPED"],
  ];
  for (const [id, org, val, st] of orders)
    // externalId NO nulo: `NULL NOT LIKE 'FVG-%'` = NULL (excluye la fila) — en prod
    // las órdenes tienen externalId real.
    await db.query(
      `INSERT INTO orders (id, "organizationId", "orderDate", "totalValue", status, "externalId") VALUES ($1,$2,now(),$3,$4,$5)`,
      [id, org, val, st, `ext-${id}`]
    );
  const attrs: Array<[string, string, number, number, string]> = [
    // 2-touch: facebook·cpc → google·organic
    ["o1", "org1", 100, 2, `[{"source":"facebook","medium":"cpc"},{"source":"google","medium":"organic"}]`],
    // 3-touch: meta·paid → instagram·social → google·cpc
    ["o2", "org1", 300, 3, `[{"source":"meta","medium":"paid"},{"source":"instagram","medium":"social"},{"source":"google","medium":"cpc"}]`],
    // 1-touch: tiktok·cpc
    ["o3", "org1", 50, 1, `[{"source":"tiktok","medium":"cpc"}]`],
  ];
  for (let i = 0; i < attrs.length; i++) {
    const [oid, org, v, n, tp] = attrs[i];
    await db.query(
      `INSERT INTO pixel_attributions VALUES ($1,$2,$3,$4,$5,$6::jsonb,'NITRO',now())`,
      [`a${i}`, oid, org, v, n, tp]
    );
  }
  return db;
}

async function totals(db: PGlite, table: string): Promise<Record<string, number>> {
  const sel = REVENUE_COLS.map((c) => `COALESCE(SUM(${c}),0)::float AS ${c}`).join(", ");
  const r = await db.query<any>(`SELECT ${sel} FROM ${table}`);
  return r.rows[0];
}

describe("gold_attribution_channel — paridad de total con gold_attribution_source", () => {
  it("passthrough (sin reglas): el total de cada componente es IDÉNTICO al de source", async () => {
    const db = await setupDb();
    await db.query(buildGoldAttributionSourceBackfill());
    // Sin reglas → el canal es el source passthrough.
    const passthrough = buildTouchpointChannelCase([], "tp");
    await db.query(buildGoldAttributionChannelBackfill(passthrough), ["org1"]);

    const cs = await db.query<any>(`SELECT COUNT(*)::int n FROM gold_attribution_source`);
    expect(cs.rows[0].n).toBeGreaterThan(0); // sanity: los datos de prueba pasan el filtro válido-web
    const src = await totals(db, "gold_attribution_source");
    const chn = await totals(db, "gold_attribution_channel");
    for (const c of REVENUE_COLS) {
      expect(chn[c], `${c}: canal ${chn[c]} != source ${src[c]}`).toBeCloseTo(src[c], 6);
    }
    await db.close();
  });

  it("con reglas reales: cambia el bucket pero el total NO se mueve", async () => {
    const db = await setupDb();
    await db.query(buildGoldAttributionSourceBackfill());
    // Regla: meta+paid → "Meta Ads"; facebook/instagram/google/tiktok se agrupan distinto.
    const rules = [
      { id: "r1", organizationId: "org1", priority: 10, source: { match: "in" as const, pattern: "meta|facebook|instagram" }, medium: { match: "in" as const, pattern: "paid|cpc" }, channel: "Meta Ads" },
      { id: "r2", organizationId: "org1", priority: 20, source: { match: "exact" as const, pattern: "google" }, channel: "Google" },
    ];
    const channelCase = buildTouchpointChannelCase(rules, "tp");
    await db.query(buildGoldAttributionChannelBackfill(channelCase), ["org1"]);

    const src = await totals(db, "gold_attribution_source");
    const chn = await totals(db, "gold_attribution_channel");
    for (const c of REVENUE_COLS) {
      expect(chn[c], `${c}: canal ${chn[c]} != source ${src[c]}`).toBeCloseTo(src[c], 6);
    }
    // Y efectivamente re-agrupó (hay una fila "Meta Ads").
    const ch = await db.query<{ channel: string }>(`SELECT DISTINCT channel FROM gold_attribution_channel`);
    expect(ch.rows.map((r) => r.channel)).toContain("Meta Ads");
    await db.close();
  });
});

describe("gold_attribution_channel — transform estructura", () => {
  const upsert = buildGoldAttributionChannelUpsert("tp->>'source'");
  const backfill = buildGoldAttributionChannelBackfill("tp->>'source'");
  it("grano por canal + ON CONFLICT actualiza todas las columnas", () => {
    expect(upsert).toContain("ON CONFLICT (organization_id, day, channel) DO UPDATE");
    expect(upsert).toContain("GROUP BY organization_id, day, channel");
  });
  it("scopea por org ($1); incremental filtra por fecha ($2); backfill solo org", () => {
    expect(upsert).toContain('pa."organizationId" = $1');
    expect(upsert).toContain('o."orderDate" >= $2::timestamptz');
    expect(backfill).toContain('pa."organizationId" = $1');
    expect(backfill).not.toContain("$2");
  });
});
