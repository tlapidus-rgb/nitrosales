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
import { sendEmail } from "@/lib/email/send";
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
    const customRoleId = body?.customRoleId ?? null;
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

    // Si viene customRoleId, validar que exista en la org y este activo
    if (customRoleId) {
      if (typeof customRoleId !== "string") {
        return NextResponse.json(
          { error: "customRoleId debe ser string" },
          { status: 400 }
        );
      }
      const cr = await prisma.customRole.findFirst({
        where: {
          id: customRoleId,
          organizationId: orgId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!cr) {
        return NextResponse.json(
          { error: "Rol custom no encontrado o inactivo" },
          { status: 404 }
        );
      }
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
        customRoleId,
        status: "PENDING",
        expiresAt,
        note,
      },
    });

    // Link que el invitado va a usar
    const baseUrl =
      process.env.NEXTAUTH_URL ??
      process.env.VERCEL_URL ??
      "https://nitrosales.vercel.app";
    const acceptUrl = `${baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`}/accept-invite?token=${token}`;

    // Data para el email
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, settings: true },
    });
    const orgName = org?.name ?? "NitroSales";
    const inviterName = check.role ?? "Un admin";

    // Obtener nombre del custom role si aplica
    let roleLabel = role === "OWNER" ? "Owner" : role === "ADMIN" ? "Admin" : "Editor";
    if (customRoleId) {
      const cr = await prisma.customRole.findUnique({
        where: { id: customRoleId },
        select: { name: true },
      });
      if (cr) roleLabel = cr.name;
    }

    // Mandar email (silent fail — no bloquea la creacion de invitacion)
    const hasResendKey = Boolean(process.env.RESEND_API_KEY);
    const emailResult = hasResendKey
      ? await sendEmail({
          to: email,
          subject: `Te invitaron a ${orgName} en NitroSales`,
          html: buildInvitationEmail({
            orgName,
            roleLabel,
            acceptUrl,
            note: note ?? null,
          }),
        })
      : {
          ok: false,
          error: "RESEND_API_KEY no está configurado en Vercel",
        };

    // Log explicito para debug
    if (emailResult.ok) {
      console.log(
        `[team/invitations] Email enviado a ${email} via Resend (id: ${(emailResult as any).id ?? "—"})`
      );
    } else {
      console.warn(
        `[team/invitations] Email NO enviado a ${email}: ${emailResult.error}`
      );
    }

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
      emailSent: emailResult.ok,
      emailError: emailResult.ok ? null : emailResult.error,
      message: emailResult.ok
        ? `Invitación enviada por email a ${email}.`
        : `Invitación creada. No se pudo enviar el email: ${emailResult.error ?? "proveedor no configurado"}. Copiá el link manualmente.`,
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

// ─────────────────────────────────────────────────────────────
// Template de email de invitacion
// ─────────────────────────────────────────────────────────────
function buildInvitationEmail(params: {
  orgName: string;
  roleLabel: string;
  acceptUrl: string;
  note: string | null;
}): string {
  const { orgName, roleLabel, acceptUrl, note } = params;
  const safeOrg = String(orgName).replace(/[<>]/g, "");
  const safeRole = String(roleLabel).replace(/[<>]/g, "");
  const safeNote = note ? String(note).replace(/[<>]/g, "").slice(0, 280) : null;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Invitación a ${safeOrg} en NitroSales</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:40px auto;padding:0 20px;">

    <div style="background:white;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.04),0 8px 24px -8px rgba(15,23,42,0.08);">

      <!-- Header -->
      <div style="padding:32px 32px 24px;background:linear-gradient(135deg,rgba(139,92,246,0.06),rgba(14,165,233,0.04));border-bottom:1px solid rgba(139,92,246,0.12);">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8b5cf6;margin-bottom:10px;">NitroSales</div>
        <h1 style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">Te invitaron a sumarte a ${safeOrg}</h1>
      </div>

      <!-- Body -->
      <div style="padding:28px 32px;">
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#475569;">
          Te invitaron a unirte a <strong>${safeOrg}</strong> en NitroSales con el rol <strong>${safeRole}</strong>.
        </p>

        ${safeNote ? `
        <div style="margin:20px 0;padding:14px 16px;background:rgba(139,92,246,0.05);border-left:3px solid #8b5cf6;border-radius:6px;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#8b5cf6;margin-bottom:6px;">Mensaje personal</div>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#334155;font-style:italic;">"${safeNote}"</p>
        </div>
        ` : ""}

        <div style="margin:28px 0 12px;text-align:center;">
          <a href="${acceptUrl}" style="display:inline-block;padding:14px 32px;background:#8b5cf6;color:white;text-decoration:none;font-size:14px;font-weight:600;border-radius:10px;box-shadow:0 1px 2px rgba(139,92,246,0.2);">
            Aceptar invitación
          </a>
        </div>

        <p style="margin:20px 0 0;font-size:11px;line-height:1.5;color:#94a3b8;text-align:center;">
          El link expira en 7 días. Si el botón no funciona, pegá este link en tu navegador:
        </p>
        <p style="margin:8px 0 0;font-size:11px;line-height:1.4;word-break:break-all;color:#64748b;text-align:center;font-family:'SF Mono',Menlo,Consolas,monospace;">
          ${acceptUrl}
        </p>
      </div>

      <!-- Footer -->
      <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:10px;line-height:1.5;color:#94a3b8;text-align:center;">
          Si no esperabas esta invitación, podés ignorar este email. NitroSales nunca te va a pedir tu password por email.
        </p>
      </div>
    </div>

    <p style="margin:24px 0 0;font-size:10px;line-height:1.5;color:#94a3b8;text-align:center;">
      Enviado por NitroSales · nitrosales.vercel.app
    </p>
  </div>
</body>
</html>
  `.trim();
}
