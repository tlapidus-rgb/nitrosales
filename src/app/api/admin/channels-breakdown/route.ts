// ══════════════════════════════════════════════════════════════════════════
// GET /api/admin/channels-breakdown?min=20
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
// ⚠️ ORG: sale de la SESIÓN (getOrganizationId, que respeta el "view-as" de los
// internos), NUNCA de un ?orgId= del cliente — si no, un cliente podría espiar los
// canales de otra org (IDOR). Gate isInternalUser() hasta que el panel entre al nav
// del cliente (F4): ahí se cambia por "sesión válida + permiso de sección".
// ══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { getOrganizationId } from "@/lib/auth-guard";
import { buildChannelRuleCase, buildIsMappedCase } from "@/lib/pixel/channel-rules";
import {
  LOAD_CHANNEL_RULES_SQL,
  rowToChannelRule,
  type ChannelRuleRow,
} from "@/lib/pixel/channel-rules-store";
import { DIM_RULE_EXPRS } from "@/lib/pixel/channel-rollup";
import { sourceDisplayName } from "@/lib/pixel/source-display-name";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await isInternalUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let orgId: string;
  try {
    orgId = await getOrganizationId(); // sesión / view-as — nunca del cliente
  } catch {
    return NextResponse.json({ error: "Sin organización en la sesión" }, { status: 403 });
  }
  const url = new URL(req.url);
  const min = Math.max(1, parseInt(url.searchParams.get("min") || "20", 10) || 20);

  try {
    return await breakdown(orgId, min);
  } catch (e: any) {
    // Gate isInternalUser() → es seguro devolver el detalle. Sirve para diagnosticar
    // (ej. "relation channel_rule does not exist" = falta correr el SQL en ESTA DB).
    console.error("[channels-breakdown] error:", e);
    return NextResponse.json(
      { error: "Error al resolver canales", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

async function breakdown(orgId: string, min: number) {
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
  // La "izquierda" del panel: el usuario ve el NOMBRE limpio (Tomy), y el
  // `codigo` crudo viaja para armar la regla al mapearlo.
  const sinMapearUI = sinMapear.map((s) => ({
    codigo: s.codigo,
    nombre: sourceDisplayName(s.codigo),
    visitantes: s.visitantes,
  }));

  // Cobertura REAL: `mapeados_regla` = visitantes cuyo origen lo resuelve una
  // REGLA (no passthrough). Antes el % contaba los passthrough como "mapeados"
  // (resuelven a sí mismos, no son sin_clasificar) → daba ~100% aunque hubiera
  // decenas de orígenes sin mapear. `${isMapped}` es la misma condición que
  // separa la bandeja, así el número refleja el trabajo pendiente de verdad.
  const meta = (await prisma.$queryRawUnsafe(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE d.source_raw IS NULL)::int AS sin_backfill,
       COUNT(*) FILTER (WHERE d.source_raw IS NOT NULL)::int AS con_crudo,
       COUNT(*) FILTER (WHERE d.source_raw IS NOT NULL AND (${isMapped}))::int AS mapeados_regla
     FROM pixel_visitor_first_source d WHERE d."organizationId" = $1`,
    orgId
  )) as Array<{ total: number; sin_backfill: number; con_crudo: number; mapeados_regla: number }>;

  const conCrudo = meta[0]?.con_crudo ?? 0;
  const mapeadosRegla = meta[0]?.mapeados_regla ?? 0;

  return NextResponse.json({
    orgId,
    rules: rules.length,
    total: meta[0]?.total ?? 0,
    sinBackfill: meta[0]?.sin_backfill ?? 0, // filas sin source_raw (F3.1 pendiente)
    mapeadoPct: conCrudo > 0 ? Math.round((mapeadosRegla / conCrudo) * 1000) / 10 : 0,
    channels,
    sinMapear: sinMapearUI,
  });
}
