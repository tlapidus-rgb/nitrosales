// ═══════════════════════════════════════════════════════════════════
// /api/admin/backfill-visitor-customer-link
// ═══════════════════════════════════════════════════════════════════
// Linkea pixel_visitors historicos que tienen email/phone pero NO tienen
// customerId a su Customer correspondiente. Limpia los duplicados que
// aparecen en /bondly/clientes (misma persona como "cliente identificado"
// y como "visitante anonimo").
//
// Idempotente: ejecutalo varias veces, cada corrida solo procesa lo pendiente.
// Paginado: procesa hasta `limit` customers por llamada (default 500).
//
// Uso:
//   curl "https://nitrosales.vercel.app/api/admin/backfill-visitor-customer-link?key=<NEXTAUTH_SECRET>"
//   curl "https://nitrosales.vercel.app/api/admin/backfill-visitor-customer-link?key=<SECRET>&limit=200"
//   curl "https://nitrosales.vercel.app/api/admin/backfill-visitor-customer-link?key=<SECRET>&dryRun=1"
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { linkVisitorToCustomer } from "@/lib/pixel/link-visitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const startedAt = Date.now();

  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (!key || key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "500", 10) || 500, 1), 2000);
    const dryRun = url.searchParams.get("dryRun") === "1";

    // Estrategia: empezar por los pixel_visitors con email/phone pero sin
    // customerId. Para cada uno, buscar el Customer matching y linkear.
    // Reutiliza linkVisitorToCustomer (mismo codepath que el webhook).
    //
    // Agrupamos por email/phone para no procesar el mismo customer N veces
    // si hay varios visitors con ese email.
    const candidates = await prisma.pixelVisitor.findMany({
      where: {
        customerId: null,
        OR: [{ email: { not: null } }, { phone: { not: null } }],
      },
      select: {
        id: true,
        visitorId: true,
        organizationId: true,
        email: true,
        phone: true,
      },
      take: limit,
      orderBy: { lastSeenAt: "desc" },
    });

    // Deduplicar por customer a procesar. Schema actual: Customer solo tiene
    // email (no phone), asi que el match retroactivo es SOLO por email.
    // Los visitors con phone pero sin email no se pueden linkear desde este
    // backfill — para esos casos, el real-time hook del webhook VTEX usa
    // order.clientProfileData.phone como puente.
    const seenCustomerKeys = new Set<string>();
    const uniqueCandidates: typeof candidates = [];
    for (const v of candidates) {
      if (!v.email) continue; // skip phone-only visitors en el backfill
      const key = `${v.organizationId}|${v.email}`;
      if (seenCustomerKeys.has(key)) continue;
      seenCustomerKeys.add(key);
      uniqueCandidates.push(v);
    }

    let totalLinked = 0;
    let totalAttrRecovered = 0;
    let customersMatched = 0;
    let visitorsScanned = candidates.length;
    const errors: string[] = [];

    // Procesar de a 3 en paralelo (pool = 8, queremos margen).
    const BATCH_SIZE = 3;
    for (let i = 0; i < uniqueCandidates.length; i += BATCH_SIZE) {
      const batch = uniqueCandidates.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (v) => {
          try {
            // Match por email (unico campo disponible en Customer schema).
            if (!v.email) return { linked: 0, attr: 0, matched: false };

            const customer = await prisma.customer.findFirst({
              where: {
                organizationId: v.organizationId,
                email: v.email,
              },
              select: { id: true, email: true },
            });

            if (!customer) return { linked: 0, attr: 0, matched: false };

            if (dryRun) {
              return { linked: 1, attr: 0, matched: true };
            }

            const res = await linkVisitorToCustomer(
              { id: customer.id, email: customer.email },
              v.organizationId,
              { attributionLimit: 5 }
            );
            return {
              linked: res.linked,
              attr: res.attributionRecovered,
              matched: true,
            };
          } catch (e: any) {
            errors.push(`visitor=${v.visitorId}: ${e?.message || String(e)}`);
            return { linked: 0, attr: 0, matched: false };
          }
        })
      );

      for (const r of results) {
        totalLinked += r.linked;
        totalAttrRecovered += r.attr;
        if (r.matched) customersMatched += 1;
      }
    }

    const elapsedMs = Date.now() - startedAt;

    return NextResponse.json({
      ok: true,
      dryRun,
      visitorsScanned,
      uniqueCandidates: uniqueCandidates.length,
      customersMatched,
      visitorsLinked: totalLinked,
      attributionRecovered: totalAttrRecovered,
      errors: errors.slice(0, 20),
      errorCount: errors.length,
      elapsedMs,
      note:
        uniqueCandidates.length >= limit
          ? `Hay mas candidatos. Correlo de nuevo (limit=${limit}) hasta que visitorsLinked=0.`
          : "Listo: no hay mas candidatos pendientes.",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[backfill-visitor-customer-link] Error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
