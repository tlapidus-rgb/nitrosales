// @ts-nocheck
// GET /api/admin/debug-vtex-affiliates?key=Y
// Lista afiliados configurados en VTEX para EMDJ, TVC y Arredo.
// Cada afiliado tiene: id (3 letras), name, hookUrl, searchByAffiliateId, etc.
// Comparar la config nos dice si TVC tiene el afiliado bien armado o no.

import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getVtexConfig } from "@/lib/vtex-credentials";

export const dynamic = "force-dynamic";
const KEY = ADMIN_API_KEY;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (key !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const orgs = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, name, slug FROM organizations
      WHERE LOWER(name) LIKE '%mundo%juguete%'
         OR LOWER(name) LIKE '%teve%'
         OR LOWER(name) LIKE '%arredo%'
      ORDER BY name
    `);

    const result: any[] = [];
    for (const org of orgs) {
      let vtexConfig: any;
      try {
        vtexConfig = await getVtexConfig(org.id);
      } catch (e: any) {
        result.push({ orgName: org.name, error: "no creds VTEX" });
        continue;
      }
      const account = vtexConfig.creds.accountName;

      // List affiliates — endpoint estandar VTEX
      const affUrl = `https://${account}.vtexcommercestable.com.br/api/checkout/pvt/affiliates`;
      let affList: any = null;
      let affStatus: number | null = null;
      try {
        const r = await fetch(affUrl, {
          headers: vtexConfig.headers,
          signal: AbortSignal.timeout(15000),
        });
        affStatus = r.status;
        const txt = await r.text();
        try { affList = JSON.parse(txt); } catch { affList = txt.slice(0, 500); }
      } catch (e: any) {
        affList = { fetchError: e.message };
      }

      result.push({
        orgId: org.id,
        orgName: org.name,
        vtexAccount: account,
        affiliatesEndpointStatus: affStatus,
        affiliates: affList,
      });
    }

    return NextResponse.json({ ok: true, orgs: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}
