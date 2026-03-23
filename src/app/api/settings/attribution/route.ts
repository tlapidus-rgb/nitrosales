// ══════════════════════════════════════════════════════════════
// Settings: Attribution Weights API
// ══════════════════════════════════════════════════════════════
// GET  /api/settings/attribution → current Nitro weights
// PUT  /api/settings/attribution → save custom Nitro weights
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

const DEFAULT_WEIGHTS = { first: 30, last: 40, middle: 30 };

export async function GET() {
  try {
    const orgId = await getOrganizationId();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const settings = (org?.settings as Record<string, any>) || {};
    const weights = settings.nitroWeights || DEFAULT_WEIGHTS;

    return NextResponse.json({ weights });
  } catch (error) {
    console.error("[Settings:Attribution] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch attribution settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const body = await request.json();
    const { first, last, middle } = body;

    // Validate weights
    if (
      typeof first !== "number" ||
      typeof last !== "number" ||
      typeof middle !== "number"
    ) {
      return NextResponse.json(
        { error: "first, last, middle must be numbers" },
        { status: 400 }
      );
    }

    // Validate range
    if (first < 0 || last < 0 || middle < 0 || first > 100 || last > 100 || middle > 100) {
      return NextResponse.json(
        { error: "Weights must be between 0 and 100" },
        { status: 400 }
      );
    }

    // Validate sum
    const sum = first + last + middle;
    if (sum !== 100) {
      return NextResponse.json(
        { error: `Weights must sum to 100 (got ${sum})` },
        { status: 400 }
      );
    }

    // Read current settings and merge
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const currentSettings = (org?.settings as Record<string, any>) || {};
    const newSettings = {
      ...currentSettings,
      nitroWeights: { first, last, middle },
    };

    await prisma.organization.update({
      where: { id: orgId },
      data: { settings: newSettings },
    });

    return NextResponse.json({
      ok: true,
      weights: { first, last, middle },
    });
  } catch (error) {
    console.error("[Settings:Attribution] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to save attribution settings" },
      { status: 500 }
    );
  }
}
