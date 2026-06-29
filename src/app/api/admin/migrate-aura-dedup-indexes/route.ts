export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Migración — Índices únicos parciales anti-doble-pago de Aura (D1 + D3)
// ══════════════════════════════════════════════════════════════
// POST /api/admin/migrate-aura-dedup-indexes
//
// Crea (idempotente, IF NOT EXISTS) los dos índices únicos PARCIALES que son
// el guard FÍSICO contra el doble pago — el check de app no frena races:
//   D1: 1 deal de comisión ACTIVO por creador.
//   D3: 1 payout por (org, deal, período) en PENDING/PAID.
//
// Prisma NO soporta índices parciales en schema.prisma → se gestionan acá por SQL.
// Ya ejecutado en prod 2026-06-28 (verificado). Este endpoint queda para reproducir
// en otros entornos (Neon branch, nuevo tenant) sin redescubrir el SQL.
//
// Rollback:
//   DROP INDEX IF EXISTS influencer_deals_one_active_commission;
//   DROP INDEX IF EXISTS payouts_dedup_deal_period;
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function POST(_req: NextRequest) {
  try {
    // D1 — solo 1 comisión activa por creador.
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS influencer_deals_one_active_commission
      ON influencer_deals ("organizationId", "influencerId")
      WHERE status = 'ACTIVE' AND type IN ('COMMISSION','TIERED_COMMISSION','HYBRID')
    `);

    // D3 — payout único por deal+período (solo PENDING/PAID, dealId no nulo).
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS payouts_dedup_deal_period
      ON payouts ("organizationId", "dealId", "periodStart", "periodEnd")
      WHERE status IN ('PENDING','PAID') AND "dealId" IS NOT NULL
    `);

    const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN ('influencer_deals_one_active_commission','payouts_dedup_deal_period')
    `);

    return NextResponse.json({
      ok: true,
      created: idx.map((i) => i.indexname),
      message: "Índices únicos parciales D1 + D3 aplicados (idempotente).",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[migrate-aura-dedup-indexes] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
