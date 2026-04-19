// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/settings/team/invitations — Fase 7d
// ═══════════════════════════════════════════════════════════════════
// POST: crear nueva invitacion (email + role). Genera token UUID +
//       expiresAt +7 dias. Envio de email lo handla un worker futuro;
//       por ahora solo guarda en DB y devuelve el link.
// DELETE /api/settings/team/invitations?id=... : revocar invitacion
//       (marca status=REVOKED, no borra por auditoria).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { requirePermission } from "@/lib/permission-guard";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const VALID_ROLES = new Set(["OWNER", "ADMIN", "MEMBER"]);
const INVITATION_TTL_DAYS = 7;

function genToken(): string {
  return randomBytes(24).toString("hex"); // 48 chars
}

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function POST(req: NextRequest) {
  try {
    const check = await requirePermission("settings_team", "admin");
    if (!check.allowed) return check.response!;
    const orgId = await getOrganizationId();
    const body = await req.json();

    const email = body?.email ? normalizeEmail(body.email) : "";
    const role = body?.role ?? "MEMBER";
    const note = typeof body?.note === "string" ? body.note.slice(0, 280) : null;

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }
    if (!VALID_ROLES.has(role)) {
      return NextResponse.json(
        { error: "Rol inválido (OWNER/ADMIN/MEMBER)" },
        { status: 400 }
      );
    }

    // Verificar que el email no sea ya miembro
    const existingUser = await prisma.user.findFirst({
      where: {
        organizationId: orgId,
        email: { equals: email, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "Ese email ya es miembro de esta organización" },
        { status: 409 }
      );
    }

    const token = genToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const created = await prisma.teamInvitation.create({
      data: {
        organizationId: orgId,
        email,
        token,
        role,
        status: "PENDING",
        expiresAt,
        note,
      },
    });

    // Link que el invitado va a usar (página del accept la armamos en otra iter)
    const baseUrl =
      process.env.NEXTAUTH_URL ??
      process.env.VERCEL_URL ??
      "https://nitrosales.vercel.app";
    const acceptUrl = `${baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`}/accept-invite?token=${token}`;

    // TODO (fase posterior): enviar email real via Resend/Postmark.
    // Por ahora devolvemos el link para que Tomy lo copie/pegue.

    return NextResponse.json({
      ok: true,
      invitation: {
        id: created.id,
        email: created.email,
        role: created.role,
        status: created.status,
        expiresAt: created.expiresAt,
      },
      acceptUrl,
      message:
        "Invitación creada. Copiá el link y envialo al invitado. (El envío automático por email se activará en una próxima iteración.)",
    });
  } catch (error: any) {
    console.error("[team/invitations POST] error:", error);
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe una invitación pendiente para ese email" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const check = await requirePermission("settings_team", "admin");
    if (!check.allowed) return check.response!;
    const orgId = await getOrganizationId();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    // Scope-safe: solo marca REVOKED si pertenece a la org
    const existing = await prisma.teamInvitation.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { error: "Solo se pueden revocar invitaciones PENDING" },
        { status: 400 }
      );
    }

    await prisma.teamInvitation.update({
      where: { id },
      data: { status: "REVOKED" },
    });

    return NextResponse.json({ ok: true, revokedId: id });
  } catch (error: any) {
    console.error("[team/invitations DELETE] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
