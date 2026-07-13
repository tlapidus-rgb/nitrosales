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
// Además (Aura): tras atribuir el pixel, re-corre attributeOrderToInfluencer para
// backfillear la atribución al CREADOR, que el ingest real-time pudo saltear por el
// mismo race y que antes NADA recuperaba (la red solo cubría el pixel, no al creador).
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
import { attributeOrderToInfluencer } from "@/lib/pixel/influencer-attribution";

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
  // Presupuesto global: paramos ANTES del maxDuration de Vercel y devolvemos
  // budgetHit. calculateAttribution es caro (segundos/orden) y bajo contención de
  // pool puede arrastrarse; sin esto la función se mataba a los 300s sin devolver
  // nada (el caller no sabía qué quedó). Con esto el cron periódico va limando el
  // backlog corrida a corrida sin morir. 250s deja margen de cierre.
  const TIME_BUDGET_MS = 250_000;
  const startedAt = Date.now();

  // No marcar no-match a órdenes fresh: dentro de las 2h aún puede llegar el
  // journey (race del webhook). Solo se marcan órdenes más viejas que esto.
  const NO_MATCH_MIN_AGE_MS = 2 * 60 * 60 * 1000;

  try {
    // FIX #2 (BP-PERF-ATTR): marca "intento sin match". Las órdenes sin journey
    // reconstruible (~2%) reaparecían como candidatas en CADA corrida (ORDER BY
    // orderDate DESC LIMIT N) y malgastaban presupuesto. Esta tabla las recuerda
    // para saltearlas. CREATE IF NOT EXISTS → idempotente, sin depender del orden
    // de deploy (la tabla siempre existe antes de que la query la use).
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS attribution_no_match (
        "orderId" text PRIMARY KEY,
        "organizationId" text NOT NULL,
        "attemptedAt" timestamptz NOT NULL DEFAULT now(),
        strategy text
      )
    `);

    const conns = await prisma.connection.findMany({
      where: { platform: "VTEX" as any, status: "ACTIVE" as any },
      select: { organizationId: true, organization: { select: { name: true } } },
    });

    const perOrg: any[] = [];
    let totalAttributed = 0;
    let totalMarkedNoMatch = 0;
    let totalCreatorAttributed = 0;
    let budgetHit = false;
    outer: for (const c of conns) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) { budgetHit = true; break; }
      const orgId = c.organizationId;
      // Órdenes web válidas sin atribución NITRO en la ventana, EXCLUYENDO las ya
      // marcadas como "sin match" (FIX #2) → el cron no las reintenta.
      const missing = await prisma.$queryRaw<Array<{ id: string; orderDate: Date }>>(Prisma.sql`
        SELECT o.id, o."orderDate"
        FROM orders o
        LEFT JOIN pixel_attributions pa ON pa."orderId" = o.id AND pa.model = 'NITRO'
        WHERE o."organizationId" = ${orgId}
          AND o."orderDate" >= ${since}
          AND pa.id IS NULL
          AND NOT EXISTS (SELECT 1 FROM attribution_no_match nm WHERE nm."orderId" = o.id)
          AND ${ordersValidWhere("o")}
          AND ${ordersWebWhere("o")}
        ORDER BY o."orderDate" DESC
        LIMIT ${limit}
      `);

      let attributed = 0;
      let processed = 0;
      let markedNoMatch = 0;
      let creatorAttributed = 0;
      for (const o of missing) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) { budgetHit = true; }
        if (budgetHit) break outer;
        processed++;
        try {
          const r = await attributeOrderByMatch(o.id, orgId);
          if (r.matched && r.strategy !== "already-attributed" && r.strategy !== "marketplace-skip") {
            attributed++;
          } else if (
            (r.strategy === "no-visitor-match" || r.strategy === "no-email-no-window") &&
            o.orderDate &&
            Date.now() - new Date(o.orderDate).getTime() > NO_MATCH_MIN_AGE_MS
          ) {
            // Sin journey reconstruible y ya pasó la ventana de race (>2h) → marcar
            // para que el cron no la reintente en cada corrida. Idempotente.
            await prisma
              .$executeRawUnsafe(
                `INSERT INTO attribution_no_match ("orderId","organizationId","attemptedAt",strategy)
                 VALUES ($1,$2,now(),$3) ON CONFLICT ("orderId") DO NOTHING`,
                o.id, orgId, r.strategy
              )
              .catch(() => {});
            markedNoMatch++;
          }

          // Backfill de atribución al CREADOR (Aura): si la orden quedó atribuida
          // (pixel), re-corremos la atribución al influencer. El ingest real-time
          // pudo saltearla (race: el pixel PURCHASE llegó antes que la orden/webhook,
          // así que no había touchpoints al momento) y NADA la recuperaba después —
          // la reconciliación solo cubría el pixel, no al creador. Idempotente:
          // attributeOrderToInfluencer saltea las ya atribuidas. Barato (pocos matches
          // por corrida en steady-state). Non-fatal.
          if (r.matched && r.strategy !== "marketplace-skip") {
            try {
              const ir = await attributeOrderToInfluencer(o.id, orgId);
              if (ir.attributed) creatorAttributed++;
            } catch {
              /* non-fatal */
            }
          }
        } catch {
          /* non-fatal */
        }
      }
      totalAttributed += attributed;
      totalMarkedNoMatch += markedNoMatch;
      totalCreatorAttributed += creatorAttributed;
      perOrg.push({
        org: c.organization?.name || orgId,
        candidates: missing.length,
        processed,
        attributed,
        markedNoMatch,
        creatorAttributed,
      });
    }

    return NextResponse.json({
      ok: true,
      days,
      limit,
      orgs: conns.length,
      totalAttributed,
      totalMarkedNoMatch,
      totalCreatorAttributed,
      budgetHit,
      perOrg,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
