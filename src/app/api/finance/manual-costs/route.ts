import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * Manual Costs CRUD API
 *
 * GET    ?month=2025-03          → list costs for a month
 * POST   { category, name, amount, type, month, notes? }  → create
 * PUT    { id, amount?, name?, notes?, category? }         → update
 * DELETE ?id=xxx                 → delete
 *
 * Optional: POST with copyFrom=2025-02 copies all FIXED costs from that month
 */

// ── Valid categories ──────────────────────────
const CATEGORIES = [
  "LOGISTICA",
  "EQUIPO",
  "PLATAFORMAS",
  "FISCAL",
  "INFRAESTRUCTURA",
  "MARKETING",
  "MERMA",
  "OTROS",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  LOGISTICA: "Logistica y Envios",
  EQUIPO: "Equipo y RRHH",
  PLATAFORMAS: "Plataformas y Herramientas",
  FISCAL: "Fiscal e Impuestos",
  INFRAESTRUCTURA: "Infraestructura",
  MARKETING: "Marketing y Contenido",
  MERMA: "Merma y Perdidas",
  OTROS: "Otros",
};

// ── GET: List costs for a month ───────────────
export async function GET(req: NextRequest) {
  const orgId = await getOrganizationId();
  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: "month param required (format: YYYY-MM)" },
      { status: 400 }
    );
  }

  try {
    const costs = await prisma.manualCost.findMany({
      where: { organizationId: orgId, month },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    // Group by category
    const grouped: Record<string, typeof costs> = {};
    for (const cat of CATEGORIES) {
      grouped[cat] = [];
    }
    for (const cost of costs) {
      if (!grouped[cost.category]) grouped[cost.category] = [];
      grouped[cost.category].push(cost);
    }

    // Calculate totals
    const categoryTotals = Object.entries(grouped).map(([cat, items]) => ({
      category: cat,
      label: CATEGORY_LABELS[cat] || cat,
      total: items.reduce((sum, c) => sum + Number(c.amount), 0),
      items,
    }));

    const grandTotal = categoryTotals.reduce((sum, c) => sum + c.total, 0);

    return NextResponse.json({
      month,
      categories: categoryTotals,
      grandTotal: Math.round(grandTotal),
      categoryLabels: CATEGORY_LABELS,
    });
  } catch (error: any) {
    console.error("Manual costs GET error:", error);
    return NextResponse.json(
      { error: "Error fetching costs", details: error.message },
      { status: 500 }
    );
  }
}

// ── POST: Create a cost (or copy from previous month) ──
export async function POST(req: NextRequest) {
  const orgId = await getOrganizationId();
  const body = await req.json();

  try {
    // Copy from previous month
    if (body.copyFrom && body.targetMonth) {
      const sourceCosts = await prisma.manualCost.findMany({
        where: {
          organizationId: orgId,
          month: body.copyFrom,
          type: "FIXED", // Only copy fixed/recurring costs
        },
      });

      if (sourceCosts.length === 0) {
        return NextResponse.json(
          { error: `No hay costos fijos en ${body.copyFrom}` },
          { status: 404 }
        );
      }

      const created = await prisma.$transaction(
        sourceCosts.map((c) =>
          prisma.manualCost.create({
            data: {
              organizationId: orgId,
              category: c.category,
              name: c.name,
              amount: c.amount,
              type: c.type,
              month: body.targetMonth,
              notes: c.notes,
            },
          })
        )
      );

      return NextResponse.json({ copied: created.length, month: body.targetMonth });
    }

    // Create single cost
    const { category, name, amount, type, month, notes } = body;

    if (!category || !name || amount === undefined || !month) {
      return NextResponse.json(
        { error: "category, name, amount, and month are required" },
        { status: 400 }
      );
    }

    if (!CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Valid: ${CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    const cost = await prisma.manualCost.create({
      data: {
        organizationId: orgId,
        category,
        name,
        amount: parseFloat(amount),
        type: type || "FIXED",
        month,
        notes: notes || null,
      },
    });

    return NextResponse.json(cost);
  } catch (error: any) {
    console.error("Manual costs POST error:", error);
    return NextResponse.json(
      { error: "Error creating cost", details: error.message },
      { status: 500 }
    );
  }
}

// ── PUT: Update a cost ────────────────────────
export async function PUT(req: NextRequest) {
  const orgId = await getOrganizationId();
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    // Verify ownership
    const existing = await prisma.manualCost.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Cost not found" }, { status: 404 });
    }

    const cost = await prisma.manualCost.update({
      where: { id },
      data: {
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.amount !== undefined && { amount: parseFloat(updates.amount) }),
        ...(updates.category !== undefined && { category: updates.category }),
        ...(updates.type !== undefined && { type: updates.type }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
      },
    });

    return NextResponse.json(cost);
  } catch (error: any) {
    console.error("Manual costs PUT error:", error);
    return NextResponse.json(
      { error: "Error updating cost", details: error.message },
      { status: 500 }
    );
  }
}

// ── DELETE: Remove a cost ─────────────────────
export async function DELETE(req: NextRequest) {
  const orgId = await getOrganizationId();
  const { searchParams } = req.nextUrl;
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id param required" }, { status: 400 });
  }

  try {
    // Verify ownership
    const existing = await prisma.manualCost.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Cost not found" }, { status: 404 });
    }

    await prisma.manualCost.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
  } catch (error: any) {
    console.error("Manual costs DELETE error:", error);
    return NextResponse.json(
      { error: "Error deleting cost", details: error.message },
      { status: 500 }
    );
  }
}
