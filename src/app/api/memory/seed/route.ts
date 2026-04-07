import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// DEPRECATED — kept for backwards compatibility.
// Memory seeding is now handled dynamically by POST /api/onboarding,
// which generates memories based on the client's specific business
// context (industry, country, channels) instead of hardcoded values.
// ══════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    return NextResponse.json({
      message:
        "Esta ruta fue deprecada. El seed inicial de memorias ahora se genera automáticamente desde el onboarding en /api/onboarding, usando el rubro y país reales del negocio.",
      seeded: false,
      redirectTo: "/api/onboarding",
    });
  } catch (e: any) {
    console.error("[memory/seed deprecated]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
