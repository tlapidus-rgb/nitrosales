export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Auto-generar payouts pendientes desde atribuciones
// ══════════════════════════════════════════════════════════════
// POST /api/aura/payouts/auto-generate
// body: {
//   periodStart: ISO,
//   periodEnd:   ISO,
//   dealIds?:    string[]   // si no vienen, procesa TODOS los deals ACTIVE
//   dryRun?:     boolean    // preview sin crear
// }
//
// Para cada deal activo del período:
//   - COMMISSION  → suma attributedValue * commissionPercent/100
//                   (o suma directamente commissionAmount si ya la calculó el pixel)
//   - FLAT_FEE    → un payout por flatAmount
//   - PERFORMANCE_BONUS → si alcanzó target, genera el bono
//   - TIERED_COMMISSION → usa tiers (JSON) para calcular
//   - CPM         → requiere views externos (out of scope por ahora)
//   - GIFTING     → no genera payout monetario
//   - HYBRID      → combina COMMISSION + FLAT_FEE + BONUS si aplican
//
// Crea payouts en estado PENDING. NO duplica: verifica si ya existe un payout
// PENDING para el mismo deal+período (chequea periodStart+periodEnd exact match).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

type GenResult = {
  dealId: string;
  dealName: string;
  influencer: string;
  type: string;
  amount: number;
  concept: string;
  skipped?: string;
  created?: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    const periodStart = body.periodStart ? new Date(body.periodStart) : null;
    const periodEnd = body.periodEnd ? new Date(body.periodEnd) : null;
    const dryRun = Boolean(body.dryRun);
    const dealIdsFilter: string[] | null = Array.isArray(body.dealIds) ? body.dealIds : null;

    if (!periodStart || !periodEnd) {
      return NextResponse.json({ error: "periodStart y periodEnd requeridos" }, { status: 400 });
    }
    if (periodEnd.getTime() < periodStart.getTime()) {
      return NextResponse.json({ error: "periodEnd debe ser >= periodStart" }, { status: 400 });
    }

    // Cargar deals
    const where: any = { organizationId: org.id, status: "ACTIVE" };
    if (dealIdsFilter && dealIdsFilter.length > 0) where.id = { in: dealIdsFilter };

    const deals = await prisma.influencerDeal.findMany({
      where,
      include: {
        influencer: { select: { id: true, name: true, code: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    if (deals.length === 0) {
      return NextResponse.json({ ok: true, generated: 0, results: [], message: "No hay deals activos" });
    }

    const results: GenResult[] = [];
    const toCreate: any[] = [];

    for (const deal of deals) {
      // Filtros de attributions: por influencer (siempre) y por campaign (si el deal lo tiene)
      const attrWhere: any = {
        organizationId: org.id,
        influencerId: deal.influencerId,
        createdAt: { gte: periodStart, lte: periodEnd },
      };
      if (deal.campaignId) attrWhere.campaignId = deal.campaignId;

      // Revenue y commission del período
      const agg = await prisma.influencerAttribution.aggregate({
        where: attrWhere,
        _sum: { attributedValue: true, commissionAmount: true },
        _count: { _all: true },
      });
      const revenue = Number(agg._sum.attributedValue || 0);
      const commissionCalc = Number(agg._sum.commissionAmount || 0);
      const orders = agg._count._all;

      const baseConcept = `${deal.name}${deal.campaign ? ` — ${deal.campaign.name}` : ""} (${periodStart.toLocaleDateString("es-AR")} a ${periodEnd.toLocaleDateString("es-AR")})`;

      // Check si ya existe un payout para este deal + mismo período (idempotencia)
      const existing = await prisma.payout.findFirst({
        where: {
          organizationId: org.id,
          dealId: deal.id,
          periodStart: periodStart,
          periodEnd: periodEnd,
          status: { in: ["PENDING", "PAID"] },
        },
        select: { id: true, status: true },
      });

      if (existing) {
        results.push({
          dealId: deal.id,
          dealName: deal.name,
          influencer: deal.influencer.name,
          type: deal.type,
          amount: 0,
          concept: baseConcept,
          skipped: `Ya existe payout (${existing.status})`,
        });
        continue;
      }

      let amount = 0;
      let concept = baseConcept;
      let skipReason: string | null = null;

      switch (deal.type) {
        case "COMMISSION": {
          // Usar commissionAmount ya calculado por el pixel si existe
          if (commissionCalc > 0) {
            amount = commissionCalc;
            concept = `Comisión — ${orders} ventas · ${fmtARS(revenue)}`;
          } else if (deal.commissionPercent && revenue > 0) {
            amount = revenue * (Number(deal.commissionPercent) / 100);
            concept = `Comisión ${deal.commissionPercent}% — ${orders} ventas · ${fmtARS(revenue)}`;
          } else {
            skipReason = "Sin ventas en el período";
          }
          break;
        }
        case "FLAT_FEE": {
          if (deal.flatAmount) {
            amount = Number(deal.flatAmount);
            const unit = deal.flatUnit || "período";
            concept = `Pago fijo (${unit.toLowerCase()}) — ${deal.name}`;
          } else {
            skipReason = "Deal sin flatAmount configurado";
          }
          break;
        }
        case "PERFORMANCE_BONUS": {
          if (!deal.bonusAmount || !deal.bonusTarget) {
            skipReason = "Bonus sin target/amount";
          } else {
            const metric = deal.bonusMetric || "REVENUE";
            const achieved = metric === "ORDERS" ? orders : revenue;
            if (achieved >= Number(deal.bonusTarget)) {
              amount = Number(deal.bonusAmount);
              concept = `Bono alcanzado (${metric}: ${metric === "ORDERS" ? orders : fmtARS(revenue)} / ${metric === "ORDERS" ? deal.bonusTarget : fmtARS(Number(deal.bonusTarget))})`;
            } else {
              skipReason = `Target no alcanzado (${achieved} de ${deal.bonusTarget})`;
            }
          }
          break;
        }
        case "TIERED_COMMISSION": {
          const tiers = (deal.tiers as any[]) || [];
          if (!Array.isArray(tiers) || tiers.length === 0) {
            skipReason = "Tiers no configurados";
            break;
          }
          // Encontrar tier aplicable basado en revenue
          const tier = tiers.find((t: any) => {
            const min = Number(t.minRevenue || 0);
            const max = t.maxRevenue != null ? Number(t.maxRevenue) : Infinity;
            return revenue >= min && revenue < max;
          });
          if (tier && tier.commissionPercent) {
            amount = revenue * (Number(tier.commissionPercent) / 100);
            concept = `Comisión escalonada ${tier.commissionPercent}% (${tier.label || ""}) — ${fmtARS(revenue)}`;
          } else {
            skipReason = "Ningún tier aplica al revenue del período";
          }
          break;
        }
        case "HYBRID": {
          // Suma: comisión + flat + bonus (si target alcanzado)
          let subTotal = 0;
          const parts: string[] = [];
          if (deal.commissionPercent && revenue > 0) {
            const c = revenue * (Number(deal.commissionPercent) / 100);
            subTotal += c;
            parts.push(`Comisión ${deal.commissionPercent}% (${fmtARS(c)})`);
          }
          if (deal.flatAmount) {
            subTotal += Number(deal.flatAmount);
            parts.push(`Fijo ${fmtARS(Number(deal.flatAmount))}`);
          }
          if (deal.bonusAmount && deal.bonusTarget) {
            const metric = deal.bonusMetric || "REVENUE";
            const achieved = metric === "ORDERS" ? orders : revenue;
            if (achieved >= Number(deal.bonusTarget)) {
              subTotal += Number(deal.bonusAmount);
              parts.push(`Bono ${fmtARS(Number(deal.bonusAmount))}`);
            }
          }
          if (subTotal > 0) {
            amount = subTotal;
            concept = `Híbrido: ${parts.join(" + ")}`;
          } else {
            skipReason = "Sin componentes del híbrido aplicables";
          }
          break;
        }
        case "CPM":
          skipReason = "CPM requiere datos de views (no implementado aún)";
          break;
        case "GIFTING":
          skipReason = "Gifting no genera payout monetario";
          break;
        default:
          skipReason = `Tipo desconocido: ${deal.type}`;
      }

      if (skipReason || amount <= 0) {
        results.push({
          dealId: deal.id,
          dealName: deal.name,
          influencer: deal.influencer.name,
          type: deal.type,
          amount: 0,
          concept,
          skipped: skipReason || "Monto = 0",
        });
        continue;
      }

      results.push({
        dealId: deal.id,
        dealName: deal.name,
        influencer: deal.influencer.name,
        type: deal.type,
        amount: Math.round(amount * 100) / 100,
        concept,
        created: !dryRun,
      });

      if (!dryRun) {
        toCreate.push({
          organizationId: org.id,
          influencerId: deal.influencerId,
          dealId: deal.id,
          campaignId: deal.campaignId,
          concept,
          amount: Math.round(amount * 100) / 100,
          currency: deal.currency || "ARS",
          periodStart,
          periodEnd,
          status: "PENDING",
        });
      }
    }

    let created = 0;
    if (!dryRun && toCreate.length > 0) {
      const result = await prisma.payout.createMany({ data: toCreate });
      created = result.count;
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      generated: created,
      previewCount: toCreate.length,
      totalAmount: results.reduce((sum, r) => sum + (r.created || dryRun ? r.amount : 0), 0),
      results,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function fmtARS(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}
