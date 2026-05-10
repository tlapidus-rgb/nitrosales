// @ts-nocheck
// POST /api/admin/reattribute-missing-vtex?key=Y&orgSlug=teve&days=14&max=50
// Toma todas las ordenes VTEX de la org en ultimos N dias sin atribucion NITRO
// y las re-procesa via webhook handler (que recrea atribucion).
// Idempotente. Excluye FVG-/BPR- (marketplaces sin pixel).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const KEY = "nitrosales-secret-key-2024-production";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("key") !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const orgSlug = url.searchParams.get("orgSlug") || "teve";
    const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") || "14")));
    const max = Math.min(500, Math.max(1, Number(url.searchParams.get("max") || "100")));

    const org = await prisma.organization.findFirst({
      where: { OR: [{ slug: orgSlug }, { name: { contains: orgSlug, mode: "insensitive" } }] },
      select: { id: true, name: true },
    });
    if (!org) return NextResponse.json({ error: "org no encontrada" }, { status: 404 });

    // Ordenes VTEX sin atribucion NITRO en periodo
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const missing = await prisma.$queryRawUnsafe<any[]>(`
      SELECT o.id, o."externalId", o.status::text as status
      FROM orders o
      LEFT JOIN pixel_attributions pa ON pa."orderId" = o.id AND pa.model::text = 'NITRO'
      WHERE o."organizationId" = $1
        AND o.source::text = 'VTEX'
        AND o."orderDate" >= $2
        AND pa.id IS NULL
        AND COALESCE(o."externalId", '') NOT LIKE 'FVG-%'
        AND COALESCE(o."externalId", '') NOT LIKE 'BPR-%'
      ORDER BY o."orderDate" DESC
      LIMIT $3
    `, org.id, since, max);

    const protocol = req.nextUrl.protocol;
    const host = req.headers.get("host") || "nitrosales.vercel.app";
    const nextAuthSecret = process.env.NEXTAUTH_SECRET;
    if (!nextAuthSecret) return NextResponse.json({ error: "NEXTAUTH_SECRET no configurado" }, { status: 500 });
    const webhookUrl = `${protocol}//${host}/api/webhooks/vtex/orders?key=${encodeURIComponent(nextAuthSecret)}&org=${org.id}`;

    const results: any[] = [];
    let nowAttr = 0, stillMissing = 0, errors = 0;

    // Procesar de a chunks de 5 en paralelo (no saturar webhook + DB)
    const chunkSize = 5;
    for (let i = 0; i < missing.length; i += chunkSize) {
      const chunk = missing.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(chunk.map(async (o) => {
        try {
          const r = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              OrderId: o.externalId,
              State: o.status?.toLowerCase().replace("_", "-") || "ready-for-handling",
              LastState: o.status?.toLowerCase().replace("_", "-") || "ready-for-handling",
              Domain: "Marketplace",
              LastChangeDate: new Date().toISOString(),
              CurrentChangeDate: new Date().toISOString(),
            }),
            signal: AbortSignal.timeout(25000),
          });
          const ok = r.ok;
          // Chequear post-procesamiento si quedo atribuida
          const attr = await prisma.pixelAttribution.findFirst({
            where: { orderId: o.id, model: "NITRO" },
            select: { id: true, touchpointCount: true },
          });
          if (attr) nowAttr++; else stillMissing++;
          return { externalId: o.externalId, webhookStatus: r.status, attributedNow: !!attr, tpCount: attr?.touchpointCount };
        } catch (e: any) {
          errors++;
          return { externalId: o.externalId, error: e.message };
        }
      }));
      results.push(...chunkResults);
    }

    return NextResponse.json({
      ok: true,
      orgName: org.name,
      candidatesFound: missing.length,
      processed: results.length,
      nowAttributed: nowAttr,
      stillMissingAfter: stillMissing,
      errors,
      results: results.slice(0, 30),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}
