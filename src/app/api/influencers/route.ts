export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Influencers CRUD API
// ══════════════════════════════════════════════════════════════
// GET  — List all influencers for the org
// POST — Create a new influencer
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { createHash } from "crypto";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function clampWindow(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return 14;
  return Math.max(1, Math.min(180, Math.round(n)));
}

export const revalidate = 0;

// Generate a unique alphanumeric code for the influencer
function generateCode(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}${suffix}`;
}

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    const influencers = await prisma.influencer.findMany({
      where: {
        organizationId: org.id,
        ...(status ? { status } : {}),
      },
      include: {
        _count: {
          select: { attributions: true, campaigns: true, coupons: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Enrich with aggregated metrics
    const enriched = await Promise.all(
      influencers.map(async (inf) => {
        const agg = await prisma.influencerAttribution.aggregate({
          where: { influencerId: inf.id, organizationId: org.id },
          _sum: { attributedValue: true, commissionAmount: true },
          _count: { id: true },
        });
        return {
          ...inf,
          totalRevenue: agg._sum.attributedValue || 0,
          totalCommission: agg._sum.commissionAmount || 0,
          totalConversions: agg._count.id || 0,
        };
      })
    );

    return NextResponse.json({ influencers: enriched });
  } catch (error: any) {
    console.error("[Influencers GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    if (!body.name || body.commissionPercent == null) {
      return NextResponse.json(
        { error: "name and commissionPercent are required" },
        { status: 400 }
      );
    }

    // Generate a unique code or use provided one
    let code = body.code || generateCode(body.name);

    // Ensure uniqueness
    const existing = await prisma.influencer.findUnique({
      where: { organizationId_code: { organizationId: org.id, code } },
    });
    if (existing) {
      code = generateCode(body.name); // Regenerate if collision
    }

    const influencer = await prisma.influencer.create({
      data: {
        organizationId: org.id,
        code,
        name: body.name,
        email: body.email || null,
        commissionPercent: body.commissionPercent,
        publicName: body.publicName || body.name,
        profileImage: body.profileImage || null,
        isPublicDashboardEnabled: body.isPublicDashboardEnabled ?? true,
        dashboardPassword: body.dashboardPassword ? hashPassword(body.dashboardPassword) : null,
        dashboardPasswordPlain: body.dashboardPassword || null,
        attributionWindowDays: clampWindow(body.attributionWindowDays),
      },
    });

    // Build tracking link (multi-tenant: env var o relativo)
    const baseUrl = process.env.STORE_URL || "";
    const trackingLink = `${baseUrl}/?utm_source=inf_${influencer.code}&utm_medium=influencer`;

    return NextResponse.json({
      influencer,
      trackingLink,
    });
  } catch (error: any) {
    console.error("[Influencers POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
