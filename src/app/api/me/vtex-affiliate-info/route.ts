// GET /api/me/vtex-affiliate-info
// Devuelve la URL completa del webhook de VTEX armada con el orgId
// del usuario logueado + el secret server-side. NUNCA expone NEXTAUTH_SECRET
// al cliente directamente — devuelve la URL ya armada.
//
// El cliente la copia y la pega en VTEX Admin → Pedidos → Configuración → Afiliados.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const orgId = (session as any)?.user?.organizationId;
    if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // URL base hardcodeada — coincide con la que tenemos configurada en EMDJ
    const baseUrl = "https://nitrosales.vercel.app";
    const secret = process.env.NEXTAUTH_SECRET || "nitrosales-secret-key-2024-production";

    const webhookUrl =
      `${baseUrl}/api/webhooks/vtex/orders` +
      `?key=${encodeURIComponent(secret)}` +
      `&org=${encodeURIComponent(orgId)}`;

    return NextResponse.json({
      ok: true,
      webhookUrl,
      // Datos auxiliares para el form del cliente:
      affiliateId: "NSL", // ID sugerido (puede usar NSL2, NSL3 si tiene varios)
      affiliateName: "NitroSales",
      notificationEmail: "webhooks@nitrosales.ai",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
