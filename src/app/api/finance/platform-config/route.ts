import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/platform-config
 * Returns platform configuration (VTEX rate, payment fees)
 */
export async function GET() {
  const orgId = await getOrganizationId();

  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const settings = (org?.settings as Record<string, unknown>) || {};
    const vtexConfig = (settings.vtexConfig as Record<string, unknown>) || {
      variableRate: 2.5,
      fixedMonthlyCost: 0,
    };
    const paymentFeesConfig = (settings.paymentFeesConfig as Record<string, number>) || {};

    return NextResponse.json({
      vtexConfig,
      paymentFeesConfig,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/finance/platform-config
 * Saves platform configuration
 */
export async function POST(req: NextRequest) {
  const orgId = await getOrganizationId();

  try {
    const body = await req.json();
    const { vtexConfig, paymentFeesConfig } = body;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const currentSettings = (org?.settings as Record<string, unknown>) || {};

    const updatedSettings: Record<string, unknown> = { ...currentSettings };

    if (vtexConfig !== undefined) {
      updatedSettings.vtexConfig = {
        variableRate: vtexConfig.variableRate ?? 2.5,
        fixedMonthlyCost: vtexConfig.fixedMonthlyCost ?? 0,
      };
    }

    if (paymentFeesConfig !== undefined) {
      updatedSettings.paymentFeesConfig = paymentFeesConfig;
    }

    await prisma.organization.update({
      where: { id: orgId },
      data: { settings: updatedSettings as any },
    });

    return NextResponse.json({ saved: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
