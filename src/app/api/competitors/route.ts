// ══════════════════════════════════════════════════════════════
// Competitors CRUD API
// ══════════════════════════════════════════════════════════════
// GET  — List competitor stores + their monitored products
// POST — Add a store or a product URL to monitor
// PUT  — Edit store name, product URL, or map to own product
// DELETE — Remove a store or product
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);

    const stores = await prisma.competitorStore.findMany({
      where: { organizationId: org.id },
      include: {
        prices: {
          select: {
            id: true,
            productUrl: true,
            productName: true,
            currentPrice: true,
            previousPrice: true,
            imageUrl: true,
            lastScrapedAt: true,
            scrapeStatus: true,
            scrapeError: true,
            ownProductId: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ stores });
  } catch (error: any) {
    console.error("[Competitors GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    // Add a new competitor store
    if (body.type === "store") {
      const store = await prisma.competitorStore.create({
        data: {
          organizationId: org.id,
          name: body.name,
          website: body.website,
        },
      });
      return NextResponse.json({ store });
    }

    // Add a product URL to monitor
    if (body.type === "product") {
      const price = await prisma.competitorPrice.create({
        data: {
          organizationId: org.id,
          competitorId: body.competitorId,
          productUrl: body.productUrl,
          productName: body.productName || "",
          ownProductId: body.ownProductId || null,
        },
      });
      return NextResponse.json({ price });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error: any) {
    console.error("[Competitors POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    if (body.type === "store") {
      const store = await prisma.competitorStore.update({
        where: { id: body.id },
        data: {
          ...(body.name && { name: body.name }),
          ...(body.website && { website: body.website }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(body.metaPageId !== undefined && { metaPageId: body.metaPageId || null }),
          ...(body.googleAdsDomain !== undefined && { googleAdsDomain: body.googleAdsDomain || null }),
        },
      });
      return NextResponse.json({ store });
    }

    if (body.type === "product") {
      const price = await prisma.competitorPrice.update({
        where: { id: body.id },
        data: {
          ...(body.productUrl && { productUrl: body.productUrl }),
          ...(body.ownProductId !== undefined && { ownProductId: body.ownProductId || null }),
        },
      });
      return NextResponse.json({ price });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error: any) {
    console.error("[Competitors PUT]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    if (type === "store") {
      await prisma.competitorStore.delete({ where: { id } });
      return NextResponse.json({ deleted: true });
    }

    if (type === "product") {
      await prisma.competitorPrice.delete({ where: { id } });
      return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error: any) {
    console.error("[Competitors DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
