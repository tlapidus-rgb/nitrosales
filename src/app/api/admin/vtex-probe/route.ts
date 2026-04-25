// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/vtex-probe?orgId=X
// ══════════════════════════════════════════════════════════════
// Diagnostico de credenciales VTEX. Pega a 4 endpoints (uno publico
// que sabemos funciona + 3 privados que estan fallando con 401) y
// devuelve para cada uno:
//   - status code
//   - body completo de la respuesta (incluido el error de VTEX si lo hay)
//   - headers que mandamos (App Key/Token enmascarados parcialmente)
//   - URL completa
//
// Uso: GET /api/admin/vtex-probe?orgId=<ORG_ID>
// Solo isInternalUser. Lee credenciales encriptadas desde DB.
//
// Por que existe: cuando el test de credenciales falla con 401 sin
// motivo aparente (rol custom + Owner ambos rechazados), necesitamos
// ver el body de error de VTEX para diagnosticar.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function maskSecret(s: string | undefined | null): string {
  if (!s) return "<empty>";
  if (s.length <= 12) return s.slice(0, 3) + "..." + s.slice(-2);
  return s.slice(0, 8) + "..." + s.slice(-4) + ` (len=${s.length})`;
}

interface ProbeResult {
  endpoint: string;
  url: string;
  status: number;
  ok: boolean;
  body: any;
  bodyPreview: string;
  contentType: string | null;
  durationMs: number;
}

async function probe(url: string, headers: Record<string, string>): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const r = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const ct = r.headers.get("content-type");
    let body: any = null;
    let bodyPreview = "";
    try {
      const text = await r.text();
      bodyPreview = text.slice(0, 1000);
      try { body = JSON.parse(text); } catch { body = text; }
    } catch {}
    return {
      endpoint: url.replace(/^https?:\/\/[^/]+/, ""),
      url,
      status: r.status,
      ok: r.ok,
      body,
      bodyPreview,
      contentType: ct,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      endpoint: url.replace(/^https?:\/\/[^/]+/, ""),
      url,
      status: 0,
      ok: false,
      body: null,
      bodyPreview: `FETCH ERROR: ${err?.name || ""} ${err?.message || ""}`,
      contentType: null,
      durationMs: Date.now() - start,
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const orgId = url.searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    // 1. Connection VTEX de la org
    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "VTEX" as any },
      select: { id: true, status: true, credentials: true, createdAt: true, updatedAt: true },
    });
    if (!conn) return NextResponse.json({ error: "Sin connection VTEX para esta org" }, { status: 404 });

    const creds = (conn.credentials as any) || {};
    const accountName = String(creds.accountName || "").trim();
    const appKey = String(creds.appKey || "").trim();
    const appToken = String(creds.appToken || "").trim();

    if (!accountName || !appKey || !appToken) {
      return NextResponse.json({
        error: "Credenciales incompletas en DB",
        present: { accountName: !!accountName, appKey: !!appKey, appToken: !!appToken },
      }, { status: 400 });
    }

    // 2. Headers exactos que usa testVtex (mismo helper)
    const headers: Record<string, string> = {
      "X-VTEX-API-AppKey": appKey,
      "X-VTEX-API-AppToken": appToken,
      Accept: "application/json",
    };

    // 3. Endpoints a probar (publico + 3 privados que fallan)
    const base = `https://${accountName}.vtexcommercestable.com.br`;
    const targets = [
      // Publico (sabemos que funciona)
      `${base}/api/catalog_system/pub/products/search?_from=0&_to=0`,
      // Privados (fallan con 401)
      `${base}/api/oms/pvt/orders?per_page=1`,
      `${base}/api/logistics/pvt/configuration/warehouses`,
      `${base}/api/logistics/pvt/shipping-policies`,
      `${base}/api/catalog_system/pvt/brand/list`,
      // Otro publico de pricing
      `${base}/api/pricing/prices/1?_forceGet=true`,
      // /api/license-manager/account para validar identidad de la app key
      `${base}/api/license-manager/account`,
    ];

    const results = await Promise.all(targets.map((u) => probe(u, headers)));

    return NextResponse.json({
      ok: true,
      orgId,
      connection: {
        id: conn.id,
        status: conn.status,
        createdAt: conn.createdAt,
        updatedAt: conn.updatedAt,
      },
      credentialsUsed: {
        accountName,
        appKey: maskSecret(appKey),
        appToken: maskSecret(appToken),
        accountNamePattern: /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(accountName) ? "valid" : "invalid",
      },
      headersUsed: {
        "X-VTEX-API-AppKey": maskSecret(appKey),
        "X-VTEX-API-AppToken": maskSecret(appToken),
        Accept: "application/json",
      },
      base,
      results,
    });
  } catch (err: any) {
    console.error("[vtex-probe] fatal:", err);
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
