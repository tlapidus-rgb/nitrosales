// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/settings/team/invitations/accept — Fase 7 fix
// ═══════════════════════════════════════════════════════════════════
// GET ?token=...  -> devuelve detalles de la invitacion (preview)
// POST { token, name, password } -> crea el user + marca ACCEPTED
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Token requerido" }, { status: 400 });
    }

    const inv = await prisma.teamInvitation.findUnique({
      where: { token },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        note: true,
        organization: { select: { id: true, name: true } },
      },
    });
    if (!inv) {
      return NextResponse.json(
        { error: "Invitación no encontrada" },
        { status: 404 }
      );
    }
    if (inv.status !== "PENDING") {
      return NextResponse.json(
        {
          error:
            inv.status === "ACCEPTED"
              ? "Esta invitación ya fue aceptada"
              : inv.status === "REVOKED"
              ? "Esta invitación fue revocada"
              : "Esta invitación ya expiró",
        },
        { status: 410 }
      );
    }
    if (new Date(inv.expiresAt).getTime() < Date.now()) {
      await prisma.teamInvitation.update({
        where: { id: inv.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { error: "Esta invitación ya expiró" },
        { status: 410 }
      );
    }

    return NextResponse.json({
      email: inv.email,
      role: inv.role,
      organizationName: inv.organization.name,
      expiresAt: inv.expiresAt,
      note: inv.note,
    });
  } catch (error: any) {
    console.error("[invitations/accept GET] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = body?.token;
    const name = (body?.name ?? "").trim();
    const password = body?.password;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token requerido" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password requerido (mínimo 8 caracteres)" },
        { status: 400 }
      );
    }
    if (name.length > 80) {
      return NextResponse.json(
        { error: "Nombre demasiado largo" },
        { status: 400 }
      );
    }

    const inv = await prisma.teamInvitation.findUnique({ where: { token } });
    if (!inv) {
      return NextResponse.json(
        { error: "Invitación no encontrada" },
        { status: 404 }
      );
    }
    if (inv.status !== "PENDING") {
      return NextResponse.json(
        { error: "Esta invitación ya no está pendiente" },
        { status: 410 }
      );
    }
    if (new Date(inv.expiresAt).getTime() < Date.now()) {
      await prisma.teamInvitation.update({
        where: { id: inv.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { error: "Esta invitación expiró" },
        { status: 410 }
      );
    }

    // Verificar que el email no sea ya user de otra org
    const existing = await prisma.user.findUnique({
      where: { email: inv.email },
      select: { id: true, organizationId: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error:
            "Ya existe una cuenta con ese email. Iniciá sesión con tu cuenta existente.",
        },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear user + marcar invitacion ACCEPTED en transaccion.
    // Si la invitacion tenia customRoleId, se lo asignamos al user nuevo
    // (salvo que el custom role haya sido desactivado entre la invitacion
    // y la aceptacion — en ese caso queda solo con base role).
    let customRoleIdToAssign: string | null = null;
    if (inv.customRoleId) {
      const stillActive = await prisma.customRole.findFirst({
        where: {
          id: inv.customRoleId,
          organizationId: inv.organizationId,
          isActive: true,
        },
        select: { id: true },
      });
      if (stillActive) customRoleIdToAssign = inv.customRoleId;
    }

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: inv.email,
          name: name || null,
          hashedPassword,
          role: inv.role as any,
          organizationId: inv.organizationId,
          customRoleId: customRoleIdToAssign,
        },
        select: { id: true, email: true, name: true, role: true, customRoleId: true },
      });
      await tx.teamInvitation.update({
        where: { id: inv.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedUserId: newUser.id,
        },
      });
      return newUser;
    });

    return NextResponse.json({
      ok: true,
      user,
      message: "Cuenta creada. Iniciá sesión con tu email y password.",
    });
  } catch (error: any) {
    console.error("[invitations/accept POST] error:", error);
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe una cuenta con ese email" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
