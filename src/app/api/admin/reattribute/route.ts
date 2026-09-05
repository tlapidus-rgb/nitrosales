export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Admin: Reprocess All Attributions
// ══════════════════════════════════════════════════════════════
// POST /api/admin/reattribute?key=ADMIN_SECRET
// Recalculates attribution for all orders that have a matched visitor.
// Use after fixing attribution logic to update historical data.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { isValidAdminKey } from '@/lib/admin-key';
import { calculateAttribution } from '@/lib/pixel/attribution';

// Tope duro por invocación. Sin esto, un solo POST recorre TODA la historia de
// atribuciones en un loop secuencial — con la org grande son cientos de miles de
// llamadas a `calculateAttribution`, que satura Neon y tumba el dashboard de
// todos los clientes mientras corre. Se procesa de a tandas; el caller repite.
const MAX_PER_CALL = 2_000;

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  // ⚠️ ANTES: `key !== process.env.ADMIN_SECRET && key !== 'reattribute-2026'`.
  // El literal convertía el control en decorativo: la contraseña estaba en el
  // código, este endpoint no pasa por el gate del middleware, y REESCRIBE la
  // atribución — que es lo que decide qué canal se lleva el crédito de cada venta
  // y cuánta comisión cobra cada creador de Aura. O sea que movía plata, desde
  // internet, sin sesión. Ahora usa la clave canónica del repo, que es
  // fail-closed si la variable no está seteada.
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ⚠️ `org` es OBLIGATORIO. Antes el `findMany` no tenía `where`, así que una
  // sola llamada reescribía la atribución de TODOS los clientes a la vez. Una
  // operación destructiva y cross-tenant no puede ser el comportamiento por
  // defecto de un endpoint sin argumentos.
  const org = searchParams.get('org');
  if (!org) {
    return NextResponse.json(
      {
        error: "Falta `org`. Este endpoint reescribe atribuciones: hay que decir de qué organización.",
      },
      { status: 400 }
    );
  }

  try {
    // Get all existing attributions (unique orderId + visitorId + organizationId)
    const attributions = await prisma.pixelAttribution.findMany({
      where: { organizationId: org },
      select: {
        orderId: true,
        visitorId: true,
        organizationId: true,
      },
      distinct: ['orderId'],
      take: MAX_PER_CALL,
    });

    let processed = 0;
    let errors = 0;

    for (const attr of attributions) {
      try {
        await calculateAttribution(attr.orderId, attr.visitorId, attr.organizationId);
        processed++;
      } catch (e) {
        errors++;
        console.error(`[Reattribute] Error for order ${attr.orderId}:`, e);
      }
    }

    return NextResponse.json({
      success: true,
      total: attributions.length,
      processed,
      errors,
    });
  } catch (error) {
    console.error('[Reattribute] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
