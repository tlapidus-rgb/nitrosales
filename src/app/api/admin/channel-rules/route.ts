// ══════════════════════════════════════════════════════════════════════════
// CRUD de reglas de canal del USUARIO (self-service, pivot v2 Tomy)
// ══════════════════════════════════════════════════════════════════════════
//   GET    ?orgId=X          → lista las reglas de la org (globales + propias)
//   POST   {orgId,source,channel} → mapea un origen a un canal (upsert)
//   DELETE ?orgId=X&source=Y | ?id=Z → borra un mapeo de la org
//
// Es la escritura que hace el panel cuando el usuario conecta "Icommarketing"
// con "Email Marketing". El rollup (pixel_daily_channel) resuelve con estas
// reglas → cambiar un mapeo NO reescanea pixel_events.
//
// ⚠️ AUTH: por ahora isInternalUser() o ?key=. Es CLIENT-FACING (pivot): antes
// de exponerlo al cliente hay que gatear con la sesión (getOrganizationId, que
// el usuario solo toque SU org) + permiso de sección. Anotado para F4.
// ══════════════════════════════════════════════════════════════════════════

import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { ruleInsertParams, INSERT_CHANNEL_RULE_SQL, LOAD_CHANNEL_RULES_SQL, type ChannelRuleRow } from "@/lib/pixel/channel-rules-store";
import { buildUserChannelRule, userRuleId, UserRuleError } from "@/lib/pixel/user-channel-rule";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function allowed(req: NextRequest): Promise<boolean> {
  const key = new URL(req.url).searchParams.get("key");
  return key === ADMIN_API_KEY || (await isInternalUser());
}

export async function GET(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const orgId = new URL(req.url).searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

  const rows = (await prisma.$queryRawUnsafe(LOAD_CHANNEL_RULES_SQL, orgId)) as ChannelRuleRow[];
  return NextResponse.json({
    orgId,
    rules: rows.map((r) => ({
      id: r.id,
      scope: r.organizationId ? "org" : "global",
      source: r.source_pattern,
      match: r.source_match,
      channel: r.channel,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body JSON inválido" }, { status: 400 });
  }
  try {
    const rule = buildUserChannelRule({
      organizationId: body?.orgId,
      source: body?.source,
      channel: body?.channel,
    });
    await prisma.$executeRawUnsafe(INSERT_CHANNEL_RULE_SQL, ...ruleInsertParams(rule));
    return NextResponse.json({ ok: true, id: rule.id, source: rule.source?.pattern, channel: rule.channel });
  } catch (e) {
    if (e instanceof UserRuleError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const orgId = url.searchParams.get("orgId");
  const source = url.searchParams.get("source");
  let id = url.searchParams.get("id");
  if (!id) {
    if (!orgId || !source) return NextResponse.json({ error: "id, o (orgId + source), requerido" }, { status: 400 });
    id = userRuleId(orgId, source.toLowerCase().trim());
  }
  // Solo borra reglas de una org (NUNCA una global): guard por el prefijo `usr-`
  // + organizationId no nulo, para que el panel no pueda tocar las built-in.
  const n = await prisma.$executeRaw`
    DELETE FROM channel_rule WHERE id = ${id} AND "organizationId" IS NOT NULL`;
  return NextResponse.json({ ok: true, deleted: n });
}
