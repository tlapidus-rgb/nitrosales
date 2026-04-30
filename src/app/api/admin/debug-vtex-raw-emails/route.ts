// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/debug-vtex-raw-emails?orgId=X&key=Y
// ══════════════════════════════════════════════════════════════
// Toma 10 orders VTEX recientes con customer.email NULL y muestra
// LITERALMENTE lo que VTEX devuelve en clientProfileData (email,
// userProfileId, isCorporate, document, etc) sin filtrar nada.
//
// Tambien muestra el resultado de extractRealEmail para cada uno.
// Asi podemos confirmar exactamente qué esta devolviendo VTEX y
// por qué nuestro helper lo descarta.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { fetchVtexOrderDetail } from "@/lib/connectors/vtex-enrichment";
import { extractRealEmail } from "@/lib/connectors/vtex-email";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    const onlyEmpty = url.searchParams.get("onlyEmpty") !== "0"; // default true

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "VTEX" as any },
      select: { credentials: true },
    });
    if (!conn?.credentials) return NextResponse.json({ error: "Sin VTEX connection" }, { status: 404 });
    const creds = conn.credentials as any;

    // 5 orders cuyo customer tiene email NULL
    const queryEmpty = `SELECT o."externalId", o."customerId", o."orderDate", c."firstName", c."lastName"
                        FROM "orders" o
                        INNER JOIN "customers" c ON c."id" = o."customerId"
                        WHERE o."organizationId" = $1
                          AND o."source" = 'VTEX'
                          AND c."email" IS NULL
                        ORDER BY o."orderDate" DESC
                        LIMIT 5`;

    // 5 orders cuyo customer SI tiene email (control)
    const queryWithEmail = `SELECT o."externalId", o."customerId", o."orderDate", c."email", c."firstName", c."lastName"
                            FROM "orders" o
                            INNER JOIN "customers" c ON c."id" = o."customerId"
                            WHERE o."organizationId" = $1
                              AND o."source" = 'VTEX'
                              AND c."email" IS NOT NULL
                            ORDER BY o."orderDate" DESC
                            LIMIT 5`;

    const ordersEmpty: any[] = await prisma.$queryRawUnsafe(queryEmpty, orgId);
    const ordersWithEmail: any[] = await prisma.$queryRawUnsafe(queryWithEmail, orgId);

    const allOrders = onlyEmpty ? ordersEmpty : [...ordersEmpty, ...ordersWithEmail];

    const results: any[] = [];

    for (const o of allOrders) {
      const detail = await fetchVtexOrderDetail(creds, o.externalId);
      if (!detail) {
        results.push({
          externalId: o.externalId,
          customerInDb: { firstName: o.firstName, lastName: o.lastName, email: o.email || null },
          vtex: "NO RESPONSE",
        });
        continue;
      }

      const cpd = detail.clientProfileData || {};
      const rawEmail = cpd.email || null;
      const cleaned = rawEmail ? extractRealEmail(rawEmail) : null;

      results.push({
        externalId: o.externalId,
        orderDate: o.orderDate,
        customerInDb: {
          firstName: o.firstName,
          lastName: o.lastName,
          email: o.email || null, // null si era de queryEmpty
        },
        vtexClientProfileData: {
          email: rawEmail,
          firstName: cpd.firstName,
          lastName: cpd.lastName,
          document: cpd.document,
          documentType: cpd.documentType,
          isCorporate: cpd.isCorporate,
          userProfileId: cpd.userProfileId,
          phone: cpd.phone,
        },
        afterExtractRealEmail: {
          result: cleaned,
          isEmpty: cleaned === "",
          isReal: cleaned && cleaned.includes("@") && !cleaned.includes(".ct.vtex.com.br"),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      orgId,
      summary: {
        totalShown: results.length,
        rawIsHashAnon: results.filter((r) =>
          r.vtexClientProfileData?.email && /^[a-f0-9]{20,}@ct\.vtex\.com\.br$/i.test(r.vtexClientProfileData.email),
        ).length,
        rawIsMasked: results.filter((r) =>
          r.vtexClientProfileData?.email && /-[0-9a-z]+b?\.ct\.vtex\.com\.br$/i.test(r.vtexClientProfileData.email),
        ).length,
        rawIsClean: results.filter((r) =>
          r.vtexClientProfileData?.email
          && !/^[a-f0-9]{20,}@ct\.vtex\.com\.br$/i.test(r.vtexClientProfileData.email)
          && !/-[0-9a-z]+b?\.ct\.vtex\.com\.br$/i.test(r.vtexClientProfileData.email),
        ).length,
        rawIsNull: results.filter((r) => !r.vtexClientProfileData?.email).length,
      },
      results,
    });
  } catch (err: any) {
    console.error("[debug-vtex-raw-emails] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
