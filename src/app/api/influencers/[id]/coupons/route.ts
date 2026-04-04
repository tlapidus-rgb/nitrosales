// ══════════════════════════════════════════════════════════════
// Influencer Coupons CRUD API
// ══════════════════════════════════════════════════════════════
// GET    — List coupons for an influencer
// POST   — Create a new coupon linked to an influencer
// PUT    — Update a coupon (via ?couponId= query param)
// DELETE — Deactivate a coupon (via ?couponId= query param)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);

    // Verify influencer belongs to org
    const influencer = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
      select: { id: true },
    });
    if (!influencer) {
      return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
    }

    const coupons = await prisma.influencerCoupon.findMany({
      where: { influencerId: params.id, organizationId: org.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ coupons });
  } catch (error: any) {
    console.error("[Influencer Coupons GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    // Verify influencer belongs to org
    const influencer = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
      select: { id: true },
    });
    if (!influencer) {
      return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
    }

    if (!body.code) {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }

    // Normalize code: uppercase, trim
    const code = body.code.trim().toUpperCase();

    // Check uniqueness within org
    const existing = await prisma.influencerCoupon.findUnique({
      where: { organizationId_code: { organizationId: org.id, code } },
    });
    if (existing) {
      return NextResponse.json(
        { error: `El código "${code}" ya está en uso` },
        { status: 409 }
      );
    }

    const coupon = await prisma.influencerCoupon.create({
      data: {
        organizationId: org.id,
        influencerId: params.id,
        code,
        discountPercent: body.discountPercent ?? null,
        discountFixed: body.discountFixed ?? null,
        isActive: true,
      },
    });

    return NextResponse.json({ coupon });
  } catch (error: any) {
    console.error("[Influencer Coupons POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();
    const url = new URL(req.url);
    const couponId = url.searchParams.get("couponId");

    if (!couponId) {
      return NextResponse.json({ error: "couponId query param required" }, { status: 400 });
    }

    // Verify coupon belongs to this influencer and org
    const existing = await prisma.influencerCoupon.findFirst({
      where: { id: couponId, influencerId: params.id, organizationId: org.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    const coupon = await prisma.influencerCoupon.update({
      where: { id: couponId },
      data: {
        ...(body.discountPercent !== undefined && { discountPercent: body.discountPercent }),
        ...(body.discountFixed !== undefined && { discountFixed: body.discountFixed }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return NextResponse.json({ coupon });
  } catch (error: any) {
    console.error("[Influencer Coupons PUT]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const url = new URL(req.url);
    const couponId = url.searchParams.get("couponId");

    if (!couponId) {
      return NextResponse.json({ error: "couponId query param required" }, { status: 400 });
    }

    // Verify coupon belongs to this influencer and org
    const existing = await prisma.influencerCoupon.findFirst({
      where: { id: couponId, influencerId: params.id, organizationId: org.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    // Soft deactivate
    await prisma.influencerCoupon.update({
      where: { id: couponId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Influencer Coupons DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
