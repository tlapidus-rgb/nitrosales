// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/compare-vtex-orders-profile?key=Y
// ══════════════════════════════════════════════════════════════
// Para cada org: bajar 20 orders VTEX recientes (de cualquiera)
// y contar cuantas vienen con userProfileId (cliente registrado)
// vs sin (guest checkout).
//
// Si EMDJ y TVC tienen distinta proporcion → es comportamiento
// del cliente o setting de VTEX (no nuestro codigo).
// Si tienen la MISMA proporcion → mi diagnostico estaba mal.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { fetchVtexOrderDetail } from "@/lib/connectors/vtex-enrichment";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const KEY = "nitrosales-secret-key-2024-production";
const SAMPLE_SIZE = 20;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Orgs que tengan VTEX connection
    const orgs: any[] = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT o."id", o."name"
       FROM "organizations" o
       INNER JOIN "connections" c ON c."organizationId" = o.id AND c."platform"::text = 'VTEX'
       ORDER BY o."name"`,
    );

    const out: any[] = [];

    for (const org of orgs) {
      const conn = await prisma.connection.findFirst({
        where: { organizationId: org.id, platform: "VTEX" as any },
        select: { credentials: true },
      });
      if (!conn?.credentials) continue;
      const creds = conn.credentials as any;
      if (!creds?.accountName || !creds?.appKey || !creds?.appToken) continue;

      // Sample 20 orders VTEX recientes
      const orders: any[] = await prisma.$queryRawUnsafe(
        `SELECT "externalId" FROM "orders"
         WHERE "organizationId" = $1 AND "source" = 'VTEX'
         ORDER BY "orderDate" DESC LIMIT $2`,
        org.id,
        SAMPLE_SIZE,
      );

      let withProfile = 0;        // userProfileId presente (puerta A)
      let withoutProfile = 0;     // userProfileId null (puerta B)
      let emailMasked = 0;        // email visible enmascarado
      let emailHashAnon = 0;      // email hash sin descifrar
      let fetchFailed = 0;
      const samples: any[] = [];

      for (const o of orders) {
        try {
          const detail = await fetchVtexOrderDetail(creds, o.externalId);
          if (!detail) { fetchFailed++; continue; }
          const cpd = detail.clientProfileData || {};
          const upid = cpd.userProfileId;
          const email = cpd.email || "";
          const isHashAnon = /^[a-f0-9]{20,}@ct\.vtex\.com\.br$/i.test(email);
          const isMasked = !isHashAnon && /-[0-9a-z]+b?\.ct\.vtex\.com\.br$/i.test(email);

          if (upid) withProfile++; else withoutProfile++;
          if (isHashAnon) emailHashAnon++;
          else if (isMasked) emailMasked++;

          if (samples.length < 3) {
            samples.push({
              externalId: o.externalId,
              userProfileId: upid || null,
              emailFormat: isHashAnon ? "hash_anon" : isMasked ? "masked" : "other",
              emailRaw: email.slice(0, 60),
            });
          }
        } catch {
          fetchFailed++;
        }
      }

      const total = withProfile + withoutProfile;
      out.push({
        orgId: org.id,
        orgName: org.name,
        sampleSize: orders.length,
        withProfilePct: total > 0 ? Math.round((withProfile / total) * 100) : 0,
        withoutProfilePct: total > 0 ? Math.round((withoutProfile / total) * 100) : 0,
        withProfile,
        withoutProfile,
        emailMasked,
        emailHashAnon,
        fetchFailed,
        samples,
      });
    }

    return NextResponse.json({ ok: true, orgs: out });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
