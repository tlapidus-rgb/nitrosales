export const dynamic = "force-dynamic";

// Adds Influencer.attributionWindowDays column (default 14).
// Run once: /api/admin/migrate-creator-attribution-window?key=<NEXTAUTH_SECRET>

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key || key !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const before = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int as count FROM information_schema.columns WHERE table_name = 'influencers' AND column_name = 'attributionWindowDays'`
    );
    const existed = Number(before[0]?.count ?? 0) > 0;

    await prisma.$executeRawUnsafe(
      `ALTER TABLE "influencers" ADD COLUMN IF NOT EXISTS "attributionWindowDays" INTEGER NOT NULL DEFAULT 14`
    );

    return NextResponse.json({ ok: true, column_added: !existed });
  } catch (error: any) {
    console.error("[migrate-creator-attribution-window]", error);
    return NextResponse.json(
      { error: error?.message || "Internal error" },
      { status: 500 }
    );
  }
}
