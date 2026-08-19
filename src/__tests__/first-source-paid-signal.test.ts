import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PAID_CLICK_ID_PREDICATE } from "@/lib/pixel/first-source-sql";
import { channelCasesFromRules } from "@/lib/pixel/channel-rollup";
import { SEED_CHANNEL_RULES } from "@/lib/pixel/channel-rules";

// ══════════════════════════════════════════════════════════════════════════
// Fase B (metodología 2-ejes, docs/CANALES-METODOLOGIA.md)
// ══════════════════════════════════════════════════════════════════════════
// La señal FUERTE de pago es el click-id (fbclid/gclid/ttclid/…), que vive en el
// ingest. El ingest ahora deriva `medium_raw='paid'` cuando está presente → el
// canal resuelve a "…Ads" para TODAS las plataformas. Antes: gclid/ttclid sin
// utm_medium caían en "Google/TikTok Orgánico" (el source 'google'/'tiktok' es
// ambiguo y sin medium pago defaultea a orgánico). Este test simula el ingest
// (misma expresión que first-source-batch) y resuelve el canal, end-to-end.
// ══════════════════════════════════════════════════════════════════════════

const { channelCase } = channelCasesFromRules(SEED_CHANNEL_RULES);

describe("Fase B — click-id de pauta → medium 'paid' → canal Ads", () => {
  it("gclid/ttclid/fbclid/msclkid sin utm_medium resuelven a Ads (no orgánico)", async () => {
    const db = new PGlite();
    await db.query(
      `CREATE TABLE e (id int, source_raw text, "clickIds" jsonb, utm_medium text)`
    );
    const rows: Array<[number, string, string, string | null, string]> = [
      // id, source, clickIds, utm_medium, canal esperado
      [1, "google", `{"gclid":"X"}`, null, "Google Ads"], // ← antes "Google Orgánico"
      [2, "tiktok", `{"ttclid":"X"}`, null, "TikTok Ads"], // ← antes "TikTok Orgánico"
      [3, "facebook", `{"fbclid":"X"}`, null, "Meta Ads"], // ← antes "Facebook Orgánico"
      [4, "bing", `{"msclkid":"X"}`, null, "Microsoft Ads"],
      [5, "google", `{}`, "organic", "Google Orgánico"], // sin click-id → orgánico real
      [6, "facebook", `{}`, null, "Facebook Orgánico"], // referrer orgánico, sin click-id
    ];
    for (const [id, s, cid, med] of rows) {
      await db.query(`INSERT INTO e VALUES ($1,$2,$3::jsonb,$4)`, [id, s, cid, med]);
    }
    const res = await db.query<{ id: number; medium_raw: string; ch: string }>(`
      WITH d AS (
        SELECT id, source_raw, NULL::text AS campaign_raw,
               CASE WHEN ${PAID_CLICK_ID_PREDICATE} THEN 'paid'
                    ELSE LOWER(COALESCE(utm_medium, '')) END AS medium_raw
        FROM e
      )
      SELECT id, medium_raw, COALESCE(${channelCase}, 'sin_clasificar') AS ch
      FROM d ORDER BY id
    `);
    const bad = res.rows
      .filter((r) => r.ch !== rows[r.id - 1][4])
      .map((r) => `id=${r.id} (med=${r.medium_raw}): got ${r.ch}, want ${rows[r.id - 1][4]}`);
    expect(bad, bad.join(" | ")).toEqual([]);
    // Sanity: los 4 con click-id derivan 'paid'; los 2 sin click-id NO.
    expect(res.rows.filter((r) => r.medium_raw === "paid").map((r) => r.id)).toEqual([1, 2, 3, 4]);
    await db.close();
  });
});
