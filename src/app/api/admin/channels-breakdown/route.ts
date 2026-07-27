// ══════════════════════════════════════════════════════════════════════════
// GET /api/admin/channels-breakdown?orgId=X&key=Y&min=20
// ══════════════════════════════════════════════════════════════════════════
// Base de datos del panel de canales (F4). Resuelve el canal EN VIVO sobre la
// dimensión (source_raw/medium_raw/campaign_raw) con las reglas de la org, y
// devuelve:
//   · channels  — breakdown de visitantes por canal RESUELTO (exacto, sin hll).
//   · sinMapear — la "bandeja": orígenes que NINGUNA regla mapea, por volumen.
//                 Filosofía Tomy: NO son error — se muestran tal cual; la bandeja
//                 es la lista de variantes que quizás valga consolidar.
//
// Resuelve desde la DIM (no lee pixel_daily_channel) → no depende de que el
// rollup haya corrido, y es exacto (no aproximado por HLL). Ideal para el preview.
//
// Requiere que source_raw esté backfilleado (F3.1). Reporta cuántas filas no lo
// están (sin_backfill) para no confundir "no mapeado" con "no procesado".
//
// Gate: isInternalUser() o ?key=<ADMIN_API_KEY>.
// ══════════════════════════════════════════════════════════════════════════

import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { buildChannelRuleCase, buildIsMappedCase } from "@/lib/pixel/channel-rules";
import {
  LOAD_CHANNEL_RULES_SQL,
  rowToChannelRule,
  type ChannelRuleRow,
} from "@/lib/pixel/channel-rules-store";
import { DIM_RULE_EXPRS } from "@/lib/pixel/channel-rollup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const allowed =
    url.searchParams.get("key") === ADMIN_API_KEY || (await isInternalUser());
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgId = url.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });
  const min = Math.max(1, parseInt(url.searchParams.get("min") || "20", 10) || 20);

  // Reglas de la org (globales + propias) → CASE de canal + "está mapeado".
  const rows = (await prisma.$queryRawUnsafe(
    LOAD_CHANNEL_RULES_SQL,
    orgId
  )) as ChannelRuleRow[];
  const rules = rows.map(rowToChannelRule);
  const channelCase = buildChannelRuleCase(rules, DIM_RULE_EXPRS);
  const isMapped = buildIsMappedCase(rules, DIM_RULE_EXPRS);

  // Breakdown por canal resuelto (exacto, desde la dim).
  const channels = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(${channelCase}, 'sin_clasificar') AS channel, COUNT(*)::int AS visitantes
     FROM pixel_visitor_first_source d
     WHERE d."organizationId" = $1 AND d.source_raw IS NOT NULL
     GROUP BY 1 ORDER BY 2 DESC`,
    orgId
  )) as Array<{ channel: string; visitantes: number }>;

  // Bandeja "sin mapear": los que NINGUNA regla agarra (passthrough), por volumen.
  const sinMapear = (await prisma.$queryRawUnsafe(
    `SELECT d.source_raw AS codigo, COUNT(*)::int AS visitantes
     FROM pixel_visitor_first_source d
     WHERE d."organizationId" = $1 AND d.source_raw IS NOT NULL AND NOT (${isMapped})
     GROUP BY 1 HAVING COUNT(*) >= $2 ORDER BY 2 DESC`,
    orgId,
    min
  )) as Array<{ codigo: string; visitantes: number }>;

  // Cuántas filas no tienen crudo todavía (F3.1 sin backfillear) — para no
  // confundir "no mapeado" con "no procesado".
  const meta = (await prisma.$queryRawUnsafe(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE source_raw IS NULL)::int AS sin_backfill
     FROM pixel_visitor_first_source WHERE "organizationId" = $1`,
    orgId
  )) as Array<{ total: number; sin_backfill: number }>;

  const mapeados = channels
    .filter((c) => c.channel !== "sin_clasificar")
    .reduce((a, c) => a + c.visitantes, 0);
  const conCrudo = (meta[0]?.total ?? 0) - (meta[0]?.sin_backfill ?? 0);

  return NextResponse.json({
    orgId,
    rules: rules.length,
    total: meta[0]?.total ?? 0,
    sinBackfill: meta[0]?.sin_backfill ?? 0, // filas sin source_raw (F3.1 pendiente)
    mapeadoPct: conCrudo > 0 ? Math.round((mapeados / conCrudo) * 1000) / 10 : 0,
    channels,
    sinMapear,
  });
}
