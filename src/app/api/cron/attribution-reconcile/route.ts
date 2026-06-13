// ──────────────────────────────────────────────────────────────
// GET /api/cron/attribution-reconcile  (BP-I1, 2026-06-11)
// ──────────────────────────────────────────────────────────────
// Red de seguridad de atribución. Barre las órdenes WEB recientes (VTEX) SIN
// atribución NITRO y corre attributeOrderByMatch sobre ellas. Cubre el caso en
// que el webhook llegó ANTES de que el visitor del pixel existiera/se identificara
// (race), o cualquier orden que se haya escapado de los caminos de ingesta.
//
// Idempotente (attributeOrderByMatch saltea las ya atribuidas). Multi-tenant.
// Liviano: por org, ventana corta (últimos N días), límite por corrida.
//
// NOTA DEPLOY: para que corra programado hay que agregar la entrada en vercel.json
// (o que lo dispare otro cron). Pendiente junto con la migración de crons a CRON_SECRET
// (ver BP-M1). Mientras tanto es invocable manualmente con ?key=.
// ──────────────────────────────────────────────────────────────
import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";
import { ordersValidWhere, ordersWebWhere } from "@/lib/metrics/orders";
import { attributeOrderByMatch } from "@/lib/pixel/attribute-order-by-match";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — Vercel Pro

const KEY = ADMIN_API_KEY;
const DEFAULT_DAYS = 3;
const DEFAULT_LIMIT = 40; // tope por org/corrida. ~6s por calculateAttribution → 40×6≈240s < maxDuration.
// En steady-state hay pocas candidatas (solo casos race que el real-time no atrapó); el backlog
// histórico se drena con el replay retroactivo. El cron corre periódico y va limando lo que quede.

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const reqKey = url.searchParams.get("key");
  if (reqKey !== KEY && reqKey !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const days = Math.min(14, Math.max(1, Number(url.searchParams.get("days") || DEFAULT_DAYS)));
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || DEFAULT_LIMIT)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const conns = await prisma.connection.findMany({
      where: { platform: "VTEX" as any, status: "ACTIVE" as any },
      select: { organizationId: true, organization: { select: { name: true } } },
    });

    const perOrg: any[] = [];
    let totalAttributed = 0;
    for (const c of conns) {
      const orgId = c.organizationId;
      // Órdenes web válidas sin atribución NITRO en la ventana.
      const missing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT o.id
        FROM orders o
        LEFT JOIN pixel_attributions pa ON pa."orderId" = o.id AND pa.model = 'NITRO'
        WHERE o."organizationId" = ${orgId}
          AND o."orderDate" >= ${since}
          AND pa.id IS NULL
          AND ${ordersValidWhere("o")}
          AND ${ordersWebWhere("o")}
        ORDER BY o."orderDate" DESC
        LIMIT ${limit}
      `);

      let attributed = 0;
      for (const o of missing) {
        try {
          const r = await attributeOrderByMatch(o.id, orgId);
          if (r.matched && r.strategy !== "already-attributed" && r.strategy !== "marketplace-skip") attributed++;
        } catch {
          /* non-fatal */
        }
      }
      totalAttributed += attributed;
      perOrg.push({ org: c.organization?.name || orgId, candidates: missing.length, attributed });
    }

    return NextResponse.json({ ok: true, days, limit, orgs: conns.length, totalAttributed, perOrg });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
