// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// /api/admin/section-overrides
// ══════════════════════════════════════════════════════════════
// GET: lista todas las orgs + overrides global + overrides por org
// POST: actualiza override (global o por org)
//
// Body POST:
//   { scope: "GLOBAL", sectionKey, status: "ACTIVE" | "MAINTENANCE" | null }
//   { scope: "ORG", orgId, sectionKey, status: "ACTIVE" | "MAINTENANCE" | null }
// status=null elimina el override.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { SECTIONS } from "@/lib/sections/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Override global
    let globalOverrides: Record<string, "ACTIVE" | "MAINTENANCE"> = {};
    try {
      const gRow = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "value" FROM "system_setting" WHERE "key" = $1 LIMIT 1`,
        "section_overrides_global",
      );
      if (gRow?.[0]?.value) globalOverrides = gRow[0].value as any;
    } catch {}

    // Override por org
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true, slug: true, settings: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      ok: true,
      sections: SECTIONS.map((s) => ({ key: s.key, label: s.label, path: s.path })),
      globalOverrides,
      orgs: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        overrides: ((o.settings as any)?.sectionOverrides as Record<string, any>) || {},
      })),
    });
  } catch (err: any) {
    console.error("[admin/section-overrides GET] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const scope = body?.scope;
    const sectionKey = body?.sectionKey;
    const status = body?.status; // "ACTIVE" | "MAINTENANCE" | null

    if (!sectionKey) return NextResponse.json({ error: "sectionKey requerido" }, { status: 400 });
    if (!SECTIONS.find((s) => s.key === sectionKey)) {
      return NextResponse.json({ error: `sectionKey desconocido: ${sectionKey}` }, { status: 400 });
    }
    if (status !== null && status !== "ACTIVE" && status !== "MAINTENANCE") {
      return NextResponse.json({ error: "status debe ser ACTIVE | MAINTENANCE | null" }, { status: 400 });
    }

    if (scope === "GLOBAL") {
      // Update tabla system_setting
      let current: Record<string, "ACTIVE" | "MAINTENANCE"> = {};
      try {
        const gRow = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "value" FROM "system_setting" WHERE "key" = $1 LIMIT 1`,
          "section_overrides_global",
        );
        if (gRow?.[0]?.value) current = gRow[0].value as any;
      } catch {}

      if (status === null) delete current[sectionKey];
      else current[sectionKey] = status;

      await prisma.$executeRawUnsafe(
        `INSERT INTO "system_setting" ("key", "value", "updatedAt")
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT ("key") DO UPDATE SET "value" = $2::jsonb, "updatedAt" = NOW()`,
        "section_overrides_global",
        JSON.stringify(current),
      );

      return NextResponse.json({ ok: true, scope: "GLOBAL", sectionKey, status });
    }

    if (scope === "ORG") {
      const orgId = body?.orgId;
      if (!orgId) return NextResponse.json({ error: "orgId requerido para scope ORG" }, { status: 400 });

      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { settings: true },
      });
      if (!org) return NextResponse.json({ error: "Org no encontrada" }, { status: 404 });

      const settings = (org.settings as any) || {};
      const overrides = settings.sectionOverrides || {};

      if (status === null) delete overrides[sectionKey];
      else overrides[sectionKey] = status;

      await prisma.organization.update({
        where: { id: orgId },
        data: { settings: { ...settings, sectionOverrides: overrides } },
      });

      return NextResponse.json({ ok: true, scope: "ORG", orgId, sectionKey, status });
    }

    return NextResponse.json({ error: "scope debe ser GLOBAL | ORG" }, { status: 400 });
  } catch (err: any) {
    console.error("[admin/section-overrides POST] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
