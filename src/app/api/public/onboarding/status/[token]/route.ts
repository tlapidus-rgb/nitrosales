// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/public/onboarding/status/[token]
// ══════════════════════════════════════════════════════════════
// Endpoint público (por token único). Devuelve estado de la solicitud
// de onboarding para que el cliente pueda ver el progreso sin login.
// Incluye rate limiting por IP.
// NO devuelve credentials encriptadas ni adminNotes (privacidad).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// Rate limit ligero (50 reqs/min por IP)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 50;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateLimitMap.get(ip);
  if (bucket && now - bucket.windowStart < WINDOW_MS) {
    if (bucket.count >= MAX_PER_WINDOW) return false;
    bucket.count++;
  } else {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
  }
  return true;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (!rateLimit(ip)) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }

    const { token } = await params;
    if (!token || token.length < 20) {
      return NextResponse.json({ error: "Token inválido" }, { status: 400 });
    }

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        status: string;
        companyName: string;
        contactName: string;
        contactEmail: string;
        progressStage: string;
        storeUrl: string;
        createdAt: Date;
        updatedAt: Date;
        activatedAt: Date | null;
        createdOrgId: string | null;
      }>
    >(
      `SELECT "id", "status", "companyName", "contactName", "contactEmail",
              "progressStage", "storeUrl", "createdAt", "updatedAt",
              "activatedAt", "createdOrgId"
       FROM "onboarding_requests"
       WHERE "token" = $1
       LIMIT 1`,
      token
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }
    const request = rows[0];

    // Tiempo transcurrido desde submit (para UX)
    const now = new Date();
    const createdAt = new Date(request.createdAt);
    const elapsedHours = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
    // Target de activación: 72hs hábiles (aproximación: 72hs cal)
    const targetHours = 72;
    const remainingHours = Math.max(0, targetHours - elapsedHours);

    return NextResponse.json({
      ok: true,
      request: {
        id: request.id,
        status: request.status,
        companyName: request.companyName,
        contactName: request.contactName,
        contactEmail: request.contactEmail,
        storeUrl: request.storeUrl,
        progressStage: request.progressStage,
        createdAt: createdAt.toISOString(),
        updatedAt: new Date(request.updatedAt).toISOString(),
        activatedAt: request.activatedAt ? new Date(request.activatedAt).toISOString() : null,
        elapsedHours,
        remainingHours,
        isActive: !!request.createdOrgId,
      },
    });
  } catch (error: any) {
    console.error("[onboarding/status] error:", error);
    return NextResponse.json({ error: "Error al cargar estado" }, { status: 500 });
  }
}
