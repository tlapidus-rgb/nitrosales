// @ts-nocheck
// ─────────────────────────────────────────────────────────────
// /api/finance/scenarios/[id]  —  Fase 5 Escenarios
// ─────────────────────────────────────────────────────────────
// GET      → devuelve 1 escenario + forecast (recomputa si falta cache)
// PUT      → edita drivers/name/color/horizon. Invalida cache.
// DELETE   → borra (excepto Base si es el unico).
//
// POST     → acciones puntuales via query `?action=clone|activate|compute`
//   clone     → duplica el escenario con nombre "{orig} (copia)", isActive=false
//   activate  → lo pone como unico activo (desactiva el resto en $transaction)
//   compute   → fuerza recomputo y actualiza lastComputedJson
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import {
  computeForecast,
  validateScenarioDrivers,
} from "@/lib/finanzas/scenario-engine";

export const dynamic = "force-dynamic";

async function loadScenario(id: string, organizationId: string) {
  const s = await prisma.financialScenario.findFirst({
    where: { id, organizationId },
  });
  return s;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const organizationId = await getOrganizationId();
    const s = await loadScenario(params.id, organizationId);
    if (!s) {
      return NextResponse.json(
        { ok: false, error: "Escenario no encontrado" },
        { status: 404 }
      );
    }
    let forecast: unknown = s.lastComputedJson;
    if (!forecast) {
      forecast = computeForecast(s.drivers as any, {
        horizonMonths: s.horizonMonths,
        seasonalityProfile: "LATAM_TOYS",
      });
      await prisma.financialScenario.update({
        where: { id: s.id },
        data: {
          lastComputedAt: new Date(),
          lastComputedJson: forecast as any,
        },
      });
    }
    return NextResponse.json({
      ok: true,
      scenario: {
        id: s.id,
        name: s.name,
        kind: s.kind,
        color: s.color,
        description: s.description,
        isActive: s.isActive,
        drivers: s.drivers,
        horizonMonths: s.horizonMonths,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        lastComputedAt: s.lastComputedAt?.toISOString() ?? null,
        forecast,
      },
    });
  } catch (error: any) {
    console.error("[GET /api/finance/scenarios/[id]] error:", error);
    return NextResponse.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const organizationId = await getOrganizationId();
    const existing = await loadScenario(params.id, organizationId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Escenario no encontrado" },
        { status: 404 }
      );
    }
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body?.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (typeof body?.description === "string") {
      data.description = body.description;
    } else if (body?.description === null) {
      data.description = null;
    }
    if (typeof body?.color === "string") data.color = body.color;
    if (typeof body?.horizonMonths === "number") {
      data.horizonMonths = Math.max(
        1,
        Math.min(36, Math.floor(body.horizonMonths))
      );
    }
    if (body?.drivers !== undefined) {
      const res = validateScenarioDrivers(body.drivers);
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: res.error },
          { status: 400 }
        );
      }
      data.drivers = res.value as any;
      // Invalidar cache — el PUT siempre fuerza recompute en el proximo GET.
      data.lastComputedAt = null;
      data.lastComputedJson = null;
    }

    const updated = await prisma.financialScenario.update({
      where: { id: existing.id },
      data,
    });

    // Recompute inmediato para devolverlo fresco
    const forecast = computeForecast(updated.drivers as any, {
      horizonMonths: updated.horizonMonths,
      seasonalityProfile: "LATAM_TOYS",
    });
    await prisma.financialScenario.update({
      where: { id: updated.id },
      data: {
        lastComputedAt: new Date(),
        lastComputedJson: forecast as any,
      },
    });

    return NextResponse.json({
      ok: true,
      scenario: { ...updated, forecast },
    });
  } catch (error: any) {
    console.error("[PUT /api/finance/scenarios/[id]] error:", error);
    return NextResponse.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const organizationId = await getOrganizationId();
    const s = await loadScenario(params.id, organizationId);
    if (!s) {
      return NextResponse.json(
        { ok: false, error: "Escenario no encontrado" },
        { status: 404 }
      );
    }
    // No permitir borrar el unico que queda, o si es BASE y no hay otro BASE/CUSTOM
    const count = await prisma.financialScenario.count({
      where: { organizationId },
    });
    if (count <= 1) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se puede borrar el ultimo escenario. Editalo en vez de eliminarlo.",
        },
        { status: 400 }
      );
    }
    // Si era activo, activamos el primero que quede (por kind order)
    const wasActive = s.isActive;
    await prisma.financialScenario.delete({ where: { id: s.id } });

    if (wasActive) {
      const remaining = await prisma.financialScenario.findMany({
        where: { organizationId },
        orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
      });
      // Prioridad: BASE → CONSERVATIVE → OPTIMIST → CUSTOM
      const prio: Record<string, number> = {
        BASE: 0,
        CONSERVATIVE: 1,
        OPTIMIST: 2,
        CUSTOM: 3,
      };
      remaining.sort((a, b) => (prio[a.kind] ?? 99) - (prio[b.kind] ?? 99));
      const next = remaining[0];
      if (next) {
        await prisma.financialScenario.update({
          where: { id: next.id },
          data: { isActive: true },
        });
      }
    }

    return NextResponse.json({ ok: true, deleted: s.id });
  } catch (error: any) {
    console.error("[DELETE /api/finance/scenarios/[id]] error:", error);
    return NextResponse.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const organizationId = await getOrganizationId();
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const s = await loadScenario(params.id, organizationId);
    if (!s) {
      return NextResponse.json(
        { ok: false, error: "Escenario no encontrado" },
        { status: 404 }
      );
    }

    // ─── CLONE ───────────────────────────────────────────────
    if (action === "clone") {
      const body = await req.json().catch(() => ({}));
      const newName =
        typeof body?.name === "string" && body.name.trim()
          ? body.name.trim()
          : `${s.name} (copia)`;
      const clone = await prisma.financialScenario.create({
        data: {
          organizationId,
          name: newName,
          kind: "CUSTOM",
          color: s.color,
          description: s.description,
          isActive: false,
          drivers: s.drivers as any,
          horizonMonths: s.horizonMonths,
        },
      });
      return NextResponse.json({ ok: true, scenario: clone });
    }

    // ─── ACTIVATE ────────────────────────────────────────────
    if (action === "activate") {
      await prisma.$transaction([
        prisma.financialScenario.updateMany({
          where: { organizationId, isActive: true },
          data: { isActive: false },
        }),
        prisma.financialScenario.update({
          where: { id: s.id },
          data: { isActive: true },
        }),
      ]);
      return NextResponse.json({ ok: true, activated: s.id });
    }

    // ─── COMPUTE ─────────────────────────────────────────────
    if (action === "compute") {
      const body = await req.json().catch(() => ({}));
      const overrideDrivers = body?.drivers;
      const cashToday =
        typeof body?.cashToday === "number" ? body.cashToday : null;
      const startMonth =
        typeof body?.startMonth === "string" ? body.startMonth : undefined;

      let drivers: any = s.drivers;
      if (overrideDrivers !== undefined) {
        const r = validateScenarioDrivers(overrideDrivers);
        if (!r.ok) {
          return NextResponse.json(
            { ok: false, error: r.error },
            { status: 400 }
          );
        }
        drivers = r.value;
      }

      const forecast = computeForecast(drivers, {
        horizonMonths: s.horizonMonths,
        seasonalityProfile: "LATAM_TOYS",
        cashToday,
        startMonth,
      });

      // Si no hubo override, guardamos la cache.
      if (overrideDrivers === undefined) {
        await prisma.financialScenario.update({
          where: { id: s.id },
          data: {
            lastComputedAt: new Date(),
            lastComputedJson: forecast as any,
          },
        });
      }

      return NextResponse.json({ ok: true, forecast });
    }

    return NextResponse.json(
      {
        ok: false,
        error: `action invalida. Usar ?action=clone|activate|compute`,
      },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("[POST /api/finance/scenarios/[id]] error:", error);
    return NextResponse.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
