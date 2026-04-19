// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/finance/fiscal/overrides — Fase 6 Fiscal
// ═══════════════════════════════════════════════════════════════════
// CRUD de FiscalObligationOverride.
//   GET    — lista todos los overrides del org
//   POST   — crea un override CUSTOM o OVERRIDE_DEFAULT
//   PUT    — updatea por id
//   DELETE — elimina por id (?id=...)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const VALID_KINDS = new Set(["CUSTOM", "OVERRIDE_DEFAULT"]);
const VALID_CATEGORIES = new Set([
  "MONOTRIBUTO",
  "IVA",
  "IIBB",
  "GANANCIAS",
  "PERCEPCION_ML",
  "CUSTOM",
]);
const VALID_FREQS = new Set([
  "MONTHLY",
  "BIMONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "YEARLY",
]);
const VALID_SOURCES = new Set([
  "MANUAL",
  "AUTO_MONOTRIBUTO",
  "AUTO_PROFILE",
]);

function validateBody(body: any): string | null {
  if (!body || typeof body !== "object") return "Body invalido";
  if (!body.name || typeof body.name !== "string") return "name requerido";
  if (body.name.length > 140) return "name muy largo";
  const kind = body.kind ?? "CUSTOM";
  if (!VALID_KINDS.has(kind)) return "kind invalido";
  if (kind === "OVERRIDE_DEFAULT" && !body.defaultKey) {
    return "defaultKey requerido para OVERRIDE_DEFAULT";
  }
  const cat = body.category ?? "CUSTOM";
  if (!VALID_CATEGORIES.has(cat)) return "category invalida";
  const freq = body.frequency ?? "MONTHLY";
  if (!VALID_FREQS.has(freq)) return "frequency invalida";
  const src = body.amountSource ?? "MANUAL";
  if (!VALID_SOURCES.has(src)) return "amountSource invalido";
  const day = Number(body.dueDay ?? 1);
  if (!Number.isInteger(day) || day < 1 || (day > 31 && day !== 99)) {
    return "dueDay debe ser 1..31 o 99 (ultimo dia)";
  }
  if (freq === "YEARLY") {
    const ym = Number(body.yearlyMonth);
    if (!Number.isInteger(ym) || ym < 1 || ym > 12) {
      return "yearlyMonth 1..12 requerido para frequency=YEARLY";
    }
  }
  return null;
}

export async function GET() {
  try {
    const orgId = await getOrganizationId();
    const rows = await prisma.fiscalObligationOverride.findMany({
      where: { organizationId: orgId },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({
      overrides: rows.map((r) => ({
        ...r,
        amount: r.amount ? Number(r.amount) : null,
      })),
    });
  } catch (error: any) {
    console.error("[finance/fiscal/overrides GET] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const body = await req.json();
    const err = validateBody(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const created = await prisma.fiscalObligationOverride.create({
      data: {
        organizationId: orgId,
        kind: body.kind ?? "CUSTOM",
        defaultKey: body.defaultKey ?? null,
        name: body.name,
        category: body.category ?? "CUSTOM",
        dueDay: Number(body.dueDay ?? 1),
        frequency: body.frequency ?? "MONTHLY",
        yearlyMonth: body.yearlyMonth ? Number(body.yearlyMonth) : null,
        amount: body.amount != null ? Number(body.amount) : null,
        amountSource: body.amountSource ?? "MANUAL",
        isActive: body.isActive ?? true,
        hideDefault: body.hideDefault ?? false,
        note: body.note ?? null,
        startMonth: body.startMonth ?? null,
        endMonth: body.endMonth ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      override: { ...created, amount: created.amount ? Number(created.amount) : null },
    });
  } catch (error: any) {
    console.error("[finance/fiscal/overrides POST] error:", error);
    // Unique violation on defaultKey
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe un override para este defaultKey" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const body = await req.json();
    const id = body?.id;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }
    const err = validateBody(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    // Scope-safe: solo actualiza si el override pertenece al org
    const existing = await prisma.fiscalObligationOverride.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const updated = await prisma.fiscalObligationOverride.update({
      where: { id },
      data: {
        kind: body.kind ?? existing.kind,
        defaultKey: body.defaultKey ?? existing.defaultKey,
        name: body.name,
        category: body.category ?? existing.category,
        dueDay: Number(body.dueDay ?? existing.dueDay),
        frequency: body.frequency ?? existing.frequency,
        yearlyMonth: body.yearlyMonth != null ? Number(body.yearlyMonth) : existing.yearlyMonth,
        amount: body.amount != null ? Number(body.amount) : null,
        amountSource: body.amountSource ?? existing.amountSource,
        isActive: body.isActive ?? existing.isActive,
        hideDefault: body.hideDefault ?? existing.hideDefault,
        note: body.note ?? existing.note,
        startMonth: body.startMonth ?? existing.startMonth,
        endMonth: body.endMonth ?? existing.endMonth,
      },
    });

    return NextResponse.json({
      ok: true,
      override: { ...updated, amount: updated.amount ? Number(updated.amount) : null },
    });
  } catch (error: any) {
    console.error("[finance/fiscal/overrides PUT] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    const deleted = await prisma.fiscalObligationOverride.deleteMany({
      where: { id, organizationId: orgId },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error: any) {
    console.error("[finance/fiscal/overrides DELETE] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
