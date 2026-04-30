// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/test-vtex-masterdata-cl?orgId=X&document=Y&key=Z
// ══════════════════════════════════════════════════════════════
// Prueba si VTEX Master Data CL (Cliente) expone el email real
// cuando buscamos un cliente por DNI. Si lo expone, podemos
// recuperar emails de guest checkouts cuyos orders devuelven
// hash anonimo.
//
// Endpoint VTEX:
//   GET /api/dataentities/CL/search?_where=document=X&_fields=email,firstName,lastName
//
// Sirve para confirmar el camino antes de automatizar en el enrichment.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    const document = url.searchParams.get("document");

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId || !document) {
      return NextResponse.json({ error: "orgId y document requeridos" }, { status: 400 });
    }

    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "VTEX" as any },
      select: { credentials: true },
    });
    if (!conn?.credentials) return NextResponse.json({ error: "Sin VTEX connection" }, { status: 404 });
    const creds = conn.credentials as any;

    const baseUrl = `https://${creds.accountName}.vtexcommercestable.com.br`;
    const endpoint = `${baseUrl}/api/dataentities/CL/search?_where=document=${encodeURIComponent(document)}&_fields=email,firstName,lastName,phone,document,id`;

    const res = await fetch(endpoint, {
      headers: {
        "X-VTEX-API-AppKey": creds.appKey,
        "X-VTEX-API-AppToken": creds.appToken,
        Accept: "application/json",
        "REST-Range": "resources=0-9", // VTEX requiere range header en Master Data
      },
    });

    const status = res.status;
    let body: any = null;
    let bodyText = "";
    try {
      bodyText = await res.text();
      body = JSON.parse(bodyText);
    } catch {
      body = bodyText.slice(0, 500);
    }

    return NextResponse.json({
      ok: true,
      requestUrl: endpoint,
      status,
      bodyType: Array.isArray(body) ? "array" : typeof body,
      resultCount: Array.isArray(body) ? body.length : null,
      results: body,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
