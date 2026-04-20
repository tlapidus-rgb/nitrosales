// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/settings/organization — Fase 7c
// ═══════════════════════════════════════════════════════════════════
// GET: devuelve datos de la org actual + whiteLabel.
// PUT: updatea datos basicos (name, slug) + whiteLabel dentro de settings.
//
// whiteLabel shape:
//   {
//     logoUrl: string | null,      // data URL o URL externa
//     primaryColor: string | null, // hex
//     industry: string | null,
//     timezone: string | null,     // IANA "America/Argentina/Buenos_Aires"
//     domain: string | null        // dominio custom
//   }
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { requirePermission } from "@/lib/permission-guard";

export const dynamic = "force-dynamic";

interface WhiteLabel {
  logoUrl?: string | null;
  primaryColor?: string | null;
  industry?: string | null;
  timezone?: string | null;
  domain?: string | null;
}

function sanitizeSlug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function isValidHexColor(s: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s);
}

export async function GET() {
  try {
    const check = await requirePermission("settings_org", "read");
    if (!check.allowed) return check.response!;
    const orgId = await getOrganizationId();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        settings: true,
        createdAt: true,
      },
    });
    if (!org) {
      return NextResponse.json({ error: "Org no encontrada" }, { status: 404 });
    }
    const settings = (org.settings as Record<string, unknown>) || {};
    const whiteLabel = (settings.whiteLabel as WhiteLabel) || {};
    const storeUrl = typeof settings.storeUrl === "string" ? settings.storeUrl : null;

    return NextResponse.json({
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      createdAt: org.createdAt,
      storeUrl,
      whiteLabel: {
        logoUrl: whiteLabel.logoUrl ?? null,
        primaryColor: whiteLabel.primaryColor ?? null,
        industry: whiteLabel.industry ?? null,
        timezone: whiteLabel.timezone ?? null,
        domain: whiteLabel.domain ?? null,
      },
    });
  } catch (error: any) {
    console.error("[settings/organization GET] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const check = await requirePermission("settings_org", "write");
    if (!check.allowed) return check.response!;
    const orgId = await getOrganizationId();
    const body = await req.json();

    // Validaciones
    if (body.name != null) {
      if (typeof body.name !== "string" || body.name.length < 2 || body.name.length > 80) {
        return NextResponse.json(
          { error: "name debe tener 2-80 caracteres" },
          { status: 400 }
        );
      }
    }
    if (body.slug != null) {
      const clean = sanitizeSlug(String(body.slug));
      if (clean.length < 2) {
        return NextResponse.json(
          { error: "slug invalido (min 2 chars despues de sanitizar)" },
          { status: 400 }
        );
      }
      body.slug = clean;
    }

    const wl: WhiteLabel = body.whiteLabel ?? {};
    if (wl.primaryColor && !isValidHexColor(wl.primaryColor)) {
      return NextResponse.json(
        { error: "primaryColor debe ser hex (ej #0ea5e9)" },
        { status: 400 }
      );
    }
    if (wl.logoUrl && wl.logoUrl.length > 200_000) {
      // ~200KB de data URL base64 (≈ 150KB de imagen real)
      return NextResponse.json(
        { error: "logoUrl demasiado grande (max ~150KB)" },
        { status: 400 }
      );
    }
    if (wl.timezone && typeof wl.timezone !== "string") {
      return NextResponse.json({ error: "timezone invalido" }, { status: 400 });
    }

    // storeUrl: URL pública de la tienda del cliente (multi-tenant)
    // Usado para generar tracking links de influencers. Cada org la suya.
    let storeUrlClean: string | null | undefined = undefined;
    if (body.storeUrl !== undefined) {
      if (body.storeUrl === null || body.storeUrl === "") {
        storeUrlClean = null;
      } else if (typeof body.storeUrl !== "string") {
        return NextResponse.json({ error: "storeUrl debe ser string" }, { status: 400 });
      } else {
        const trimmed = body.storeUrl.trim().replace(/\/+$/, "");
        if (!/^https?:\/\/.+\..+/.test(trimmed)) {
          return NextResponse.json(
            { error: "storeUrl debe ser una URL válida (ej https://mitienda.com)" },
            { status: 400 }
          );
        }
        if (trimmed.length > 200) {
          return NextResponse.json({ error: "storeUrl demasiado larga" }, { status: 400 });
        }
        storeUrlClean = trimmed;
      }
    }

    // Fetch existing settings para merge
    const existing = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const currentSettings = (existing?.settings as Record<string, unknown>) || {};
    const currentWhiteLabel = (currentSettings.whiteLabel as WhiteLabel) || {};

    const nextWhiteLabel: WhiteLabel = {
      ...currentWhiteLabel,
      ...(wl.logoUrl !== undefined ? { logoUrl: wl.logoUrl } : {}),
      ...(wl.primaryColor !== undefined ? { primaryColor: wl.primaryColor } : {}),
      ...(wl.industry !== undefined ? { industry: wl.industry } : {}),
      ...(wl.timezone !== undefined ? { timezone: wl.timezone } : {}),
      ...(wl.domain !== undefined ? { domain: wl.domain } : {}),
    };

    const nextSettings: Record<string, unknown> = {
      ...currentSettings,
      whiteLabel: nextWhiteLabel,
    };
    // Solo sobrescribo storeUrl si venía explícito en el body
    if (storeUrlClean !== undefined) {
      if (storeUrlClean === null) {
        delete nextSettings.storeUrl;
      } else {
        nextSettings.storeUrl = storeUrlClean;
      }
    }

    const updateData: any = { settings: nextSettings };
    if (body.name != null) updateData.name = body.name;
    if (body.slug != null) updateData.slug = body.slug;

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: updateData,
      select: { id: true, name: true, slug: true, plan: true, settings: true },
    });

    const finalStoreUrl =
      typeof (updated.settings as any)?.storeUrl === "string"
        ? (updated.settings as any).storeUrl
        : null;

    return NextResponse.json({
      ok: true,
      organization: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        plan: updated.plan,
        storeUrl: finalStoreUrl,
        whiteLabel: nextWhiteLabel,
      },
    });
  } catch (error: any) {
    console.error("[settings/organization PUT] error:", error);
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "El slug ya esta en uso" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
