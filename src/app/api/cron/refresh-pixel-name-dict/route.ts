// ══════════════════════════════════════════════════════════════════════════
// GET /api/cron/refresh-pixel-name-dict — diccionario nombre → productId
// ══════════════════════════════════════════════════════════════════════════
// Reconstruye `pixel_product_name`, que permite recuperar el 46% de eventos
// VIEW_PRODUCT que no traen `productId` pero sí `productName`.
//
// POR QUÉ ESTÁ SEPARADO DE refresh-product-dimensions (2026-07-18):
//   Estaban juntos y el diccionario consumió los 271s enteros: alcanzó 2 de 4
//   orgs y dejó a la fase de VTEX sin tiempo (okCount: 0). Dos trabajos pesados
//   en un mismo cron se matan entre sí. Ahora cada uno tiene su ventana.
//
// RESUMIBLE: saltea las orgs cuyo diccionario se refrescó hace menos de
// SKIP_IF_FRESHER_THAN_H horas, así llamarlo N veces avanza en vez de repetir.
//
// Auth: user-agent vercel-cron, o ?key=<ADMIN_API_KEY>.
// ══════════════════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { buildProductNameDictUpsert } from "@/lib/pixel/product-name-dict";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TIME_BUDGET_MS = 260_000;
// Una org refrescada hace poco se saltea: permite llamar el endpoint varias
// veces seguidas para completar las que faltan sin rehacer las hechas.
const SKIP_IF_FRESHER_THAN_H = 20;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  // Auth: SÓLO por key. El bypass por `user-agent: vercel-cron` (spoofeable) se
  // quitó (auditoría 2026-07-22): Vercel Cron manda la key en vercel.json.
  if (!isValidAdminKey(url.searchParams.get("key"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const startedAt = Date.now();
  const deadline = startedAt + TIME_BUDGET_MS;
  const force = url.searchParams.get("force") === "1";

  const orgs = await prisma.organization.findMany({ select: { id: true } });

  // Última vez que se tocó el diccionario de cada org.
  const freshness = (await prisma.$queryRaw`
    SELECT "organizationId", MAX(refreshed_at) AS last
    FROM pixel_product_name
    GROUP BY "organizationId"
  `) as Array<{ organizationId: string; last: Date | null }>;
  const lastByOrg = new Map(freshness.map((f) => [f.organizationId, f.last]));

  const results: Array<{
    orgId: string;
    ok: boolean;
    skipped?: boolean;
    names?: number;
    error?: string;
  }> = [];

  for (const { id: orgId } of orgs) {
    if (Date.now() >= deadline) {
      results.push({ orgId, ok: false, error: "sin tiempo, volver a llamar" });
      continue;
    }

    const last = lastByOrg.get(orgId);
    if (
      !force &&
      last &&
      Date.now() - new Date(last).getTime() < SKIP_IF_FRESHER_THAN_H * 3600_000
    ) {
      results.push({ orgId, ok: true, skipped: true });
      continue;
    }

    try {
      await prisma.$executeRawUnsafe(buildProductNameDictUpsert(), orgId);
      const count = (await prisma.$queryRaw`
        SELECT COUNT(*)::int AS n FROM pixel_product_name WHERE "organizationId" = ${orgId}
      `) as Array<{ n: number }>;
      results.push({ orgId, ok: true, names: count[0]?.n ?? 0 });
    } catch (e: any) {
      results.push({ orgId, ok: false, error: String(e?.message).slice(0, 200) });
    }
  }

  const pending = results.filter((r) => !r.ok).length;
  return NextResponse.json({
    ok: true,
    orgs: results.length,
    done: results.filter((r) => r.ok && !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    pending,
    // Si queda alguna pendiente, volver a llamar: retoma donde quedó.
    callAgain: pending > 0,
    results,
    durationMs: Date.now() - startedAt,
  });
}
