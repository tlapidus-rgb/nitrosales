export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Afiliados con saldo pendiente (Bloque D3 · items 24/20)
// ══════════════════════════════════════════════════════════════
// GET /api/aura/creators/pending-list
//
// Lista los creadores con su "pendiente a pagar" (comisión ganada − pagado),
// para el selector de afiliado de la página de Pagos y para reencuadrar el
// KPI "Pendiente" (antes salía de payouts PENDING, que en el modelo nuevo no
// se crean → siempre daba 0; ese era el bug del item 20).
//
// FUENTE ÚNICA DE VERDAD: usa computeCreatorBalances por creador (el mismo cálculo
// FIFO por campaña que la sección Creadores / el /settle). Antes calculaba distinto
// (earned lifetime − TODOS los pagos) → podía DIVERGIR de la vista de Creadores:
// pagabas desde la campaña y en Pagos seguía "pendiente". Ahora las dos vistas dan
// el MISMO número en toda combinación (pago por campaña o pago suelto).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { computeCreatorBalances } from "@/lib/aura/campaign-balance";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);

    const creators = await prisma.influencer.findMany({
      where: { organizationId: org.id },
      select: { id: true, name: true, code: true, profileImage: true, status: true },
    });

    const items = (
      await Promise.all(
        creators.map(async (c) => {
          const bal = await computeCreatorBalances(prisma, org.id, c.id);
          return {
            id: c.id,
            name: c.name,
            code: c.code,
            profileImage: c.profileImage,
            status: c.status,
            earned: bal.totalEarned,
            paid: bal.totalPaid,
            pending: bal.totalPending,
          };
        }),
      )
    ).sort((a, b) => b.pending - a.pending);

    const totalPending = round2(items.reduce((s, i) => s + i.pending, 0));

    return NextResponse.json({ ok: true, items, totalPending });
  } catch (e: any) {
    console.error("[aura/creators/pending-list] error:", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
