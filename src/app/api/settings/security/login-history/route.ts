// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/settings/security/login-history — Fase 7 QA
// ═══════════════════════════════════════════════════════════════════
// GET: historial de logins del user actual (ultimos N eventos).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(10, parseInt(url.searchParams.get("limit") ?? "30", 10) || 30));

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ events: [] });
    }

    const events = await prisma.loginEvent.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        success: true,
        ip: true,
        userAgent: true,
        location: true,
        failureReason: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ events, count: events.length });
  } catch (error: any) {
    console.error("[security/login-history GET] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
