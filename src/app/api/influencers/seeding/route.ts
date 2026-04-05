export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Product Seeding API (Admin)
// ══════════════════════════════════════════════════════════════
// GET  — List all product seedings
// POST — Create new seeding
// PUT  — Update seeding status
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const influencerId = searchParams.get("influencerId");

    const seedings = await prisma.productSeeding.findMany({
      where: {
        organizationId: org.id,
        ...(status && { status }),
        ...(influencerId && { influencerId }),
      },
      include: {
        influencer: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, imageUrl: true, price: true } },
        briefing: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Aggregate stats
    const stats = await prisma.productSeeding.groupBy({
      by: ["status"],
      where: { organizationId: org.id },
      _count: { id: true },
      _sum: { estimatedValue: true },
    });

    return NextResponse.json({ seedings, stats });
  } catch (error: any) {
    console.error("[Seeding GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    // Verify influencer belongs to this org
    const influencer = await prisma.influencer.findFirst({
      where: { id: body.influencerId, organizationId: org.id },
    });
    if (!influencer) {
      return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
    }

    const seeding = await prisma.productSeeding.create({
      data: {
        organizationId: org.id,
        influencerId: body.influencerId,
        productId: body.productId || null,
        briefingId: body.briefingId || null,
        estimatedValue: body.estimatedValue || null,
        notes: body.notes || null,
        trackingNumber: body.trackingNumber || null,
        status: body.status || "PENDING",
        ...(body.status === "SHIPPED" && { shippedAt: new Date() }),
      },
      include: {
        influencer: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, imageUrl: true } },
      },
    });

    return NextResponse.json({ seeding }, { status: 201 });
  } catch (error: any) {
    console.error("[Seeding POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: "Missing seeding id" }, { status: 400 });
    }

    const existing = await prisma.productSeeding.findFirst({
      where: { id: body.id, organizationId: org.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Seeding not found" }, { status: 404 });
    }

    const seeding = await prisma.productSeeding.update({
      where: { id: body.id },
      data: {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.trackingNumber !== undefined && { trackingNumber: body.trackingNumber }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.estimatedValue !== undefined && { estimatedValue: body.estimatedValue }),
        ...(body.status === "SHIPPED" && !existing.shippedAt && { shippedAt: new Date() }),
        ...(body.status === "DELIVERED" && !existing.deliveredAt && { deliveredAt: new Date() }),
      },
    });

    return NextResponse.json({ seeding });
  } catch (error: any) {
    console.error("[Seeding PUT]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
