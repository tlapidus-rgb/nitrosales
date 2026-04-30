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
    const headers = {
      "X-VTEX-API-AppKey": creds.appKey,
      "X-VTEX-API-AppToken": creds.appToken,
      Accept: "application/json",
      "REST-Range": "resources=0-9",
    };

    // Probamos varias variantes del query (VTEX usa nombres distintos
    // para el campo DNI/document segun el setup de la cuenta)
    const variants = [
      { name: "by document", url: `${baseUrl}/api/dataentities/CL/search?_where=document=${encodeURIComponent(document)}&_fields=_all` },
      { name: "by documentNumber", url: `${baseUrl}/api/dataentities/CL/search?_where=documentNumber=${encodeURIComponent(document)}&_fields=_all` },
      { name: "by cpf", url: `${baseUrl}/api/dataentities/CL/search?_where=cpf=${encodeURIComponent(document)}&_fields=_all` },
      { name: "list first 5 (sin filtro)", url: `${baseUrl}/api/dataentities/CL/search?_fields=_all` },
      { name: "schemas disponibles", url: `${baseUrl}/api/dataentities/CL/schemas` },
    ];

    const out: any[] = [];
    for (const v of variants) {
      try {
        const r = await fetch(v.url, { headers });
        const txt = await r.text();
        let parsed: any;
        try { parsed = JSON.parse(txt); } catch { parsed = txt.slice(0, 300); }
        out.push({
          test: v.name,
          url: v.url,
          status: r.status,
          resultCount: Array.isArray(parsed) ? parsed.length : null,
          firstResult: Array.isArray(parsed) ? parsed[0] : parsed,
        });
      } catch (err: any) {
        out.push({ test: v.name, url: v.url, error: err.message });
      }
    }

    return NextResponse.json({ ok: true, document, tests: out });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
