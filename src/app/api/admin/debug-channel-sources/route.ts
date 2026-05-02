// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/debug-channel-sources?orgId=X&days=30&key=Y
// ══════════════════════════════════════════════════════════════
// Lista los `source` UNICOS que aparecen en pa.touchpoints[].source
// para una org y rango. Sin lower, sin alias, sin transformar.
//
// Sirve para diagnosticar por que en el Hero Bar aparecen 2 entradas
// "Meta" (o cualquier canal duplicado): puede ser caps mismatch,
// alias (meta vs meta_ads) o source corrupto.
//
// Si dos rows tienen distinto `source` literal pero el SOURCE_ICONS
// del frontend les asigna el mismo label, se ven duplicadas.
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
    const days = parseInt(url.searchParams.get("days") || "30", 10);
    const model = url.searchParams.get("model") || "NITRO";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - days * 24 * 60 * 60 * 1000);

    // Sources unicos LITERALES (sin transformar) en touchpoints + count + sample
    const sources = await prisma.$queryRaw<Array<{
      source: string;
      medium: string | null;
      occurrences: number;
      attributions: number;
      revenue: number;
      sample_campaigns: string[];
    }>>`
      SELECT
        COALESCE(tp->>'source', '<NULL>') as source,
        COALESCE(tp->>'medium', '<NULL>') as medium,
        COUNT(*)::int as occurrences,
        COUNT(DISTINCT pa.id)::int as attributions,
        SUM(pa."attributedValue")::float as revenue,
        ARRAY_AGG(DISTINCT COALESCE(tp->>'campaign', '(no campaign)')) FILTER (WHERE tp->>'campaign' IS NOT NULL) as sample_campaigns
      FROM pixel_attributions pa
      JOIN orders o ON o.id = pa."orderId"
      , jsonb_array_elements(pa.touchpoints::jsonb) AS tp
      WHERE pa."organizationId" = ${orgId}
        AND o."orderDate" >= ${dateFrom}
        AND o."orderDate" <= ${dateTo}
        AND pa.model::text = ${model}
        AND o.status NOT IN ('CANCELLED', 'PENDING')
        AND o."totalValue" > 0
      GROUP BY 1, 2
      ORDER BY revenue DESC NULLS LAST
      LIMIT 50
    `;

    // Tambien ver el `source` despues de aplicar el organic-merge que hace la query #9
    const sourcesAfterTransform = await prisma.$queryRaw<Array<{
      source_transformed: string;
      occurrences: number;
      revenue: number;
    }>>`
      SELECT
        CASE
          WHEN COALESCE(tp->>'medium','') IN ('organic','social','referral')
            AND COALESCE(tp->>'source','direct') IN ('google','bing','yahoo','duckduckgo')
          THEN COALESCE(tp->>'source','direct') || '_organic'
          ELSE COALESCE(tp->>'source', 'direct')
        END as source_transformed,
        COUNT(*)::int as occurrences,
        SUM(pa."attributedValue")::float as revenue
      FROM pixel_attributions pa
      JOIN orders o ON o.id = pa."orderId"
      , jsonb_array_elements(pa.touchpoints::jsonb) AS tp
      WHERE pa."organizationId" = ${orgId}
        AND o."orderDate" >= ${dateFrom}
        AND o."orderDate" <= ${dateTo}
        AND pa.model::text = ${model}
        AND o.status NOT IN ('CANCELLED', 'PENDING')
        AND o."totalValue" > 0
      GROUP BY 1
      ORDER BY revenue DESC NULLS LAST
    `;

    // Detectar duplicados case-insensitive: si dos sources distintos solo difieren en caps
    const lowerMap = new Map<string, Array<typeof sources[0]>>();
    for (const s of sources) {
      const k = s.source.toLowerCase();
      if (!lowerMap.has(k)) lowerMap.set(k, []);
      lowerMap.get(k)!.push(s);
    }
    const caseDuplicates: Array<{ canonical: string; variants: typeof sources }> = [];
    for (const [k, arr] of lowerMap) {
      if (arr.length > 1) caseDuplicates.push({ canonical: k, variants: arr });
    }

    return NextResponse.json({
      ok: true,
      orgId,
      model,
      window: { from: dateFrom.toISOString(), to: dateTo.toISOString(), days },
      totalUniqueSourceMediumCombos: sources.length,
      sourcesLiteral: sources,
      sourcesAfterTransform,
      caseDuplicates,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
