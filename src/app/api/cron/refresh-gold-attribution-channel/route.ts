// ══════════════════════════════════════════════════════════════════════════
// GET /api/cron/refresh-gold-attribution-channel — Gold por CANAL
// ══════════════════════════════════════════════════════════════════════════
// Recomputa gold_attribution_channel (revenue de atribución por org×día×CANAL)
// para la ventana reciente, leyendo pixel_attributions (Bronze). Es el gemelo por
// canal de refresh-gold-attribution: existe para que, con PIXEL_USE_CHANNELS ON,
// el serve lea Gold (rápido) en vez de escanear pa.touchpoints en vivo (que en 30d
// de la org grande se pasa del timeout → mock en 0).
//
// PER-ORG: la resolución de canal depende de las reglas de la org (channel_rule),
// así que carga las reglas de cada org y materializa con SU channelCase. Resumible
// por orgCursor (una org grande puede comerse el budget). El total es idéntico al
// de gold_attribution_source (test de paridad). attribution.ts INTACTO.
//
//   • Off-switch: ATTRIBUTION_ROLLUP_ENABLED=false lo apaga (mismo que el de source).
//   • Corre por DEFAULT para que la tabla esté fresca ANTES de flipear
//     PIXEL_USE_GOLD_CHANNEL (el flag que controla la LECTURA del serve).
//   • Resiliente: si gold_attribution_channel o channel_rule no existen, no rompe.
//   • ?full=1 → backfill de toda la historia. ?orgCursor=N → reanuda.
//
// Auth: ?key=<ADMIN_API_KEY>.
// ══════════════════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { buildGoldAttributionChannelUpsert } from "@/data/gold/gold-attribution-channel-transform";
import { buildTouchpointChannelCase } from "@/lib/pixel/touchpoint-channel-sql";
import { LOAD_CHANNEL_RULES_SQL, rowToChannelRule, type ChannelRuleRow } from "@/lib/pixel/channel-rules-store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAYS_BACK = 4; // ventana incremental + margen de borde
const BUDGET_MS = 250_000; // bajo el cap real de 300s

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (process.env.ATTRIBUTION_ROLLUP_ENABLED === "false") {
    return NextResponse.json({ skipped: true, reason: "ATTRIBUTION_ROLLUP_ENABLED=false" });
  }

  const startedAt = Date.now();
  const full = url.searchParams.get("full") === "1";
  const since = full
    ? "1970-01-01T00:00:00Z"
    : new Date(Date.now() - DAYS_BACK * 86_400_000).toISOString();
  const start = Math.max(0, parseInt(url.searchParams.get("orgCursor") || "0", 10) || 0);

  try {
    // Orgs con órdenes atribuidas en la ventana (o todas, si backfill).
    const orgsRes: any = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT "organizationId" org FROM pixel_attributions
       WHERE "organizationId" IS NOT NULL AND "createdAt" >= $1::timestamptz ORDER BY 1`,
      since,
    );
    const orgs: string[] = orgsRes.map((o: any) => o.org);

    const done: Array<{ org: string; rows: number }> = [];
    let i = start;
    for (; i < orgs.length; i++) {
      if (Date.now() - startedAt > BUDGET_MS) break;
      const org = orgs[i];
      // Reglas de la org (globales + propias) → mismo CASE que el panel y el serve.
      let channelCase: string;
      try {
        const rules = ((await prisma.$queryRawUnsafe(LOAD_CHANNEL_RULES_SQL, org)) as ChannelRuleRow[]).map(rowToChannelRule);
        channelCase = buildTouchpointChannelCase(rules, "tp");
      } catch {
        channelCase = buildTouchpointChannelCase([], "tp"); // channel_rule ausente → passthrough
      }
      const n = await prisma.$executeRawUnsafe(buildGoldAttributionChannelUpsert(channelCase), org, since);
      done.push({ org, rows: Number(n) });
    }
    const remaining = i < orgs.length;
    return NextResponse.json({
      ok: true,
      mode: full ? "backfill" : "incremental",
      since,
      orgsTotal: orgs.length,
      procesadas: done.length,
      done,
      done_all: !remaining,
      resume: remaining ? `?orgCursor=${i}${full ? "&full=1" : ""}` : null,
      durationMs: Date.now() - startedAt,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message).slice(0, 300), durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
