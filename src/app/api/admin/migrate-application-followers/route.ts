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
//   curl "https://<host>/api/admin/migrate-application-followers?key=<NEXTAUTH_SECRET>"
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (!key || key !== process.env.NEXTAUTH_SECRET) {
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
