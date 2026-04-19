// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/settings/api-keys — Fase 7 QA
// ═══════════════════════════════════════════════════════════════════
// GET: lista API keys de la org (sin tokens — solo prefix + metadata).
// POST: crear nueva API key. Devuelve el token completo UNA vez.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { requirePermission } from "@/lib/permission-guard";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const VALID_SCOPES = new Set([
  "read:orders",
  "read:customers",
  "read:products",
  "read:finanzas",
  "read:ads",
  "read:metrics",
  "write:manual-costs",
  "write:scenarios",
]);

function generateToken(): { full: string; prefix: string } {
  const env = process.env.NODE_ENV === "production" ? "live" : "test";
  const raw = randomBytes(24).toString("base64url"); // 32 chars base64
  const full = `ns_${env}_${raw}`;
  const prefix = full.slice(0, 16); // "ns_live_abc1234..."
  return { full, prefix };
}

export async function GET() {
  try {
    const check = await requirePermission("settings_api_keys", "read");
    if (!check.allowed) return check.response!;
    const orgId = await getOrganizationId();
    const keys = await prisma.apiKey.findMany({
      where: { organizationId: orgId, revokedAt: null },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ keys, count: keys.length });
  } catch (error: any) {
    console.error("[api-keys GET] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const check = await requirePermission("settings_api_keys", "admin");
    if (!check.allowed) return check.response!;
    const orgId = await getOrganizationId();
    const session = await getServerSession();
    const email = session?.user?.email;
    const creator = email
      ? await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        })
      : null;

    const body = await req.json();
    const name = (body?.name ?? "").trim();
    const scopes = Array.isArray(body?.scopes) ? body.scopes : [];
    const expiresInDays = Number(body?.expiresInDays ?? 0);

    if (!name || name.length < 2 || name.length > 80) {
      return NextResponse.json(
        { error: "Nombre debe tener 2-80 caracteres" },
        { status: 400 }
      );
    }
    // Validar scopes
    for (const s of scopes) {
      if (typeof s !== "string" || !VALID_SCOPES.has(s)) {
        return NextResponse.json(
          { error: `Scope invalido: ${s}` },
          { status: 400 }
        );
      }
    }
    if (expiresInDays && (expiresInDays < 1 || expiresInDays > 730)) {
      return NextResponse.json(
        { error: "expiresInDays debe estar entre 1 y 730" },
        { status: 400 }
      );
    }

    const { full, prefix } = generateToken();
    const hashedToken = await bcrypt.hash(full, 10);
    const expiresAt =
      expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    const created = await prisma.apiKey.create({
      data: {
        organizationId: orgId,
        name,
        prefix,
        hashedToken,
        scopes,
        expiresAt,
        createdById: creator?.id ?? null,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      apiKey: created,
      token: full, // UNA VEZ — nunca se vuelve a devolver
      message:
        "Guarda este token ahora. Por seguridad no te lo vamos a volver a mostrar.",
    });
  } catch (error: any) {
    console.error("[api-keys POST] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
