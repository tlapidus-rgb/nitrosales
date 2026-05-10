// @ts-nocheck
// GET /api/admin/debug-vtex-hook-config?key=Y&orgSlug=teve
// Consulta a VTEX cual es el Orders Broadcaster webhook configurado
// para la cuenta de la org. Si no hay nada configurado, devuelve null.
// No modifica nada — solo lee.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getVtexConfig } from "@/lib/vtex-credentials";

export const dynamic = "force-dynamic";
const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgSlug = url.searchParams.get("orgSlug") || "teve";
    if (key !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const org = await prisma.organization.findFirst({
      where: { OR: [{ slug: orgSlug }, { name: { contains: orgSlug, mode: "insensitive" } }] },
      select: { id: true, name: true, slug: true },
    });
    if (!org) return NextResponse.json({ error: "org no encontrada" }, { status: 404 });

    let vtexConfig: any;
    try {
      vtexConfig = await getVtexConfig(org.id);
    } catch (e: any) {
      return NextResponse.json({ error: "No hay credenciales VTEX", detail: e.message }, { status: 404 });
    }

    const account = vtexConfig.creds.accountName;
    const hookUrl = `https://${account}.vtexcommercestable.com.br/api/orders/hook/config`;

    const hookRes = await fetch(hookUrl, {
      headers: vtexConfig.headers,
      signal: AbortSignal.timeout(15000),
    });

    const status = hookRes.status;
    const text = await hookRes.text().catch(() => "");
    let body: any;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 1000); }

    return NextResponse.json({
      ok: true,
      orgId: org.id,
      orgName: org.name,
      vtexAccount: account,
      hookConfigEndpoint: hookUrl,
      vtexResponseStatus: status,
      vtexResponseBody: body,
      analysis: {
        hasHook: status === 200 && body && typeof body === "object" && !!body.url,
        configuredUrl: body?.url || null,
        hasOrgQueryParam: body?.url ? /[?&]org=/.test(body.url) : false,
        isOurDomain: body?.url ? /nitrosales|99media/.test(body.url) : false,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}
