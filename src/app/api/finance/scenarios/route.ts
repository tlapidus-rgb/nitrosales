// @ts-nocheck
// ─────────────────────────────────────────────────────────────
// /api/finance/scenarios  —  Fase 5 Escenarios
// ─────────────────────────────────────────────────────────────
// GET    → lista de escenarios de la org (lazy seed de los 3 defaults
//          si la org no tiene ninguno). Incluye forecast cacheado si existe.
//
// POST   → crea un escenario custom desde cero (kind: CUSTOM siempre, no
//          permitimos crear un BASE/OPTIMIST/CONSERVATIVE extra por usuario).
//          Body: { name, description?, color?, drivers, horizonMonths?,
//                  activate?: boolean }
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import {
  buildDefaultScenariosPayloads,
  computeForecast,
  validateScenarioDrivers,
} from "@/lib/finanzas/scenario-engine";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const organizationId = await getOrganizationId();

    // 1. Lazy seed: si no hay ninguno, crear los 3 defaults.
    const count = await prisma.financialScenario.count({
      where: { organizationId },
    });

    if (count === 0) {
      const presets = buildDefaultScenariosPayloads();
      await prisma.$transaction(
        presets.map((p) =>
          prisma.financialScenario.create({
            data: {
              organizationId,
              name: p.name,
              kind: p.kind,
              color: p.color,
              description: p.description,
              isActive: p.isActive,
              drivers: p.drivers as any,
              horizonMonths: 12,
            },
          })
        )
      );
    }

    // 2. Listar — ordenar: Conservador → Base → Optimista → custom por fecha
    const rows = await prisma.financialScenario.findMany({
      where: { organizationId },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    });

    // Ordenar por un orden canonico: CONSERVATIVE, BASE, OPTIMIST, CUSTOM.
    const kindOrder: Record<string, number> = {
      CONSERVATIVE: 0,
      BASE: 1,
      OPTIMIST: 2,
      CUSTOM: 3,
    };
    rows.sort((a, b) => {
      const ka = kindOrder[a.kind] ?? 99;
      const kb = kindOrder[b.kind] ?? 99;
      if (ka !== kb) return ka - kb;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    // 3. Si alguno no tiene lastComputedJson, computar al vuelo (y guardar)
    //    para que la primera carga del cliente tenga forecast pronto.
    const withForecast = await Promise.all(
      rows.map(async (s) => {
        let forecast: unknown = s.lastComputedJson;
        if (!forecast) {
          const fc = computeForecast(s.drivers as any, {
            horizonMonths: s.horizonMonths,
            seasonalityProfile: "LATAM_TOYS",
          });
          forecast = fc;
          await prisma.financialScenario.update({
            where: { id: s.id },
            data: {
              lastComputedAt: new Date(),
              lastComputedJson: fc as any,
            },
          });
        }
        return {
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
        };
      })
    );

    return NextResponse.json({
      ok: true,
      scenarios: withForecast,
      seeded: count === 0,
    });
  } catch (error: any) {
    console.error("[GET /api/finance/scenarios] error:", error);
    return NextResponse.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const organizationId = await getOrganizationId();
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    if (!name) {
      return NextResponse.json(
        { ok: false, error: "name requerido" },
        { status: 400 }
      );
    }
    const driversRes = validateScenarioDrivers(body?.drivers ?? {});
    if (!driversRes.ok) {
      return NextResponse.json(
        { ok: false, error: driversRes.error },
        { status: 400 }
      );
    }
    const horizonMonths = Math.max(
      1,
      Math.min(36, Number(body?.horizonMonths ?? 12))
    );

    const created = await prisma.financialScenario.create({
      data: {
        organizationId,
        name,
        kind: "CUSTOM",
        color: typeof body?.color === "string" ? body.color : "#8b5cf6",
        description:
          typeof body?.description === "string" ? body.description : null,
        isActive: false,
        drivers: driversRes.value as any,
        horizonMonths,
      },
    });

    // Si el cliente pide activar, desactivamos todos los demas + activamos
    // este (dentro de una transaccion para respetar el unique parcial).
    if (body?.activate === true) {
      await prisma.$transaction([
        prisma.financialScenario.updateMany({
          where: { organizationId, isActive: true },
          data: { isActive: false },
        }),
        prisma.financialScenario.update({
          where: { id: created.id },
          data: { isActive: true },
        }),
      ]);
    }

    return NextResponse.json({ ok: true, scenario: created });
  } catch (error: any) {
    console.error("[POST /api/finance/scenarios] error:", error);
    return NextResponse.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
