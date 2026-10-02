// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-application-followers
// ═══════════════════════════════════════════════════════════════════
// Idempotente. Agrega los seguidores POR RED SOCIAL a influencer_applications
// (reunión Tomy: en el form de aplicación, seguidores por red, no un total).
//   - influencer_applications.instagramFollowers
//   - influencer_applications.tiktokFollowers
//   - influencer_applications.youtubeFollowers
//
// Uso:
//   con sesión de staff, abrir logueado: https://<host>/api/admin/migrate-application-followers
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (!(await isInternalUser())) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "influencer_applications"
        ADD COLUMN IF NOT EXISTS "instagramFollowers" INTEGER,
        ADD COLUMN IF NOT EXISTS "tiktokFollowers" INTEGER,
        ADD COLUMN IF NOT EXISTS "youtubeFollowers" INTEGER;
    `);

    return NextResponse.json({
      ok: true,
      columns: [
        "influencer_applications.instagramFollowers",
        "influencer_applications.tiktokFollowers",
        "influencer_applications.youtubeFollowers",
      ],
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
