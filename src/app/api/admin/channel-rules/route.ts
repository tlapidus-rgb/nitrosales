// ══════════════════════════════════════════════════════════════════════════
// CRUD de reglas de canal del USUARIO (self-service, pivot v2 Tomy)
// ══════════════════════════════════════════════════════════════════════════
//   GET                     → lista las reglas de la org (globales + propias)
//   POST   {source,channel}  → mapea un origen a un canal (upsert)
//   DELETE ?source=Y | ?id=Z → borra un mapeo de la org
//
// Es la escritura que hace el panel cuando el usuario conecta "Icommarketing"
// con "Email Marketing". El rollup (pixel_daily_channel) resuelve con estas
// reglas → cambiar un mapeo NO reescanea pixel_events.
//
// ⚠️ ORG: SIEMPRE de la SESIÓN (getOrganizationId, que respeta el "view-as" de
// los internos). NO se acepta orgId del cliente — si no, uno podría escribir/leer/
// borrar reglas de otra org (IDOR). F4 HECHO: gate por permiso de sección "pixel"
// (read para GET, write para POST/DELETE) vía requirePermission — staff pasa por su
// bypass; el cliente con NitroPixel Analytics también.
// ══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requirePermission } from "@/lib/permission-guard";
import type { AccessLevel } from "@/lib/permissions";
import { getOrganizationId } from "@/lib/auth-guard";
import { ruleInsertParams, INSERT_CHANNEL_RULE_SQL, LOAD_CHANNEL_RULES_SQL, type ChannelRuleRow } from "@/lib/pixel/channel-rules-store";
import { buildUserChannelRule, userRuleId, UserRuleError } from "@/lib/pixel/user-channel-rule";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Gate por permiso de sección "pixel" + org de la sesión (view-as respetado).
 * F4: `read` para GET, `write` para POST/DELETE. El staff pasa por el bypass de
 * requirePermission; el cliente con NitroPixel Analytics (read/write) también.
 * 401/403 con su response si no autorizado; 403 si no hay org resoluble.
 */
async function gate(level: AccessLevel = "read"): Promise<{ orgId: string } | NextResponse> {
  const check = await requirePermission("pixel", level);
  if (check.response) return check.response; // presente sólo cuando no está permitido
  try {
    return { orgId: await getOrganizationId() };
  } catch {
    return NextResponse.json({ error: "Sin organización en la sesión" }, { status: 403 });
  }
}

export async function GET() {
  const g = await gate();
  if (g instanceof NextResponse) return g;
  const { orgId } = g;

  const rows = (await prisma.$queryRawUnsafe(LOAD_CHANNEL_RULES_SQL, orgId)) as ChannelRuleRow[];
  return NextResponse.json({
    orgId,
    rules: rows.map((r) => ({
      id: r.id,
      scope: r.organizationId ? "org" : "global",
      source: r.source_pattern,
      match: r.source_match,
      // medium de la regla — la UI lo necesita para matchear un origen (source,medium)
      // con SU regla (desconectar la variante correcta). null = regla source-only.
      medium: r.medium_pattern,
      mediumMatch: r.medium_match,
      channel: r.channel,
    })),
  });
}

export async function POST(req: NextRequest) {
  const g = await gate("write");
  if (g instanceof NextResponse) return g;
  const { orgId } = g;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body JSON inválido" }, { status: 400 });
  }
  try {
    const rule = buildUserChannelRule({
      organizationId: orgId, // de la sesión, NUNCA del body
      source: body?.source,
      channel: body?.channel,
      // medium OPCIONAL: presente (incluso '') cuando el panel muestra el origen
      // partido por medium → la regla agarra solo esa variante (google/cpc vs
      // google/organic). Ausente = regla source-only (comportamiento histórico).
      medium: body?.medium,
    });
    await prisma.$executeRawUnsafe(INSERT_CHANNEL_RULE_SQL, ...ruleInsertParams(rule));
    return NextResponse.json({
      ok: true,
      id: rule.id,
      source: rule.source?.pattern,
      medium: rule.medium?.pattern ?? null,
      channel: rule.channel,
    });
  } catch (e) {
    if (e instanceof UserRuleError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  const g = await gate("write");
  if (g instanceof NextResponse) return g;
  const { orgId } = g;
  const url = new URL(req.url);
  const source = url.searchParams.get("source");
  // medium: null = ausente (regla source-only); '' o valor = regla source+medium.
  // Debe matchear cómo se creó el id (userRuleId) para borrar la variante correcta.
  const medium = url.searchParams.get("medium");
  let id = url.searchParams.get("id");
  if (!id) {
    if (!source) return NextResponse.json({ error: "id, o source, requerido" }, { status: 400 });
    id = userRuleId(orgId, source.toLowerCase().trim(), medium == null ? null : medium.toLowerCase().trim());
  }
  // Scope a la org de la sesión: NUNCA una global (organizationId IS NOT NULL) y
  // NUNCA la de otra org (organizationId = orgId), aunque manden un ?id= arbitrario.
  const n = await prisma.$executeRaw`
    DELETE FROM channel_rule
    WHERE id = ${id} AND "organizationId" = ${orgId}`;
  return NextResponse.json({ ok: true, deleted: n });
}
