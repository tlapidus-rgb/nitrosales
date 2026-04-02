import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * Shipping Rates CRUD API
 *
 * GET    ?carrier=ANDREANI&serviceType=ESTANDAR&isActive=true  → list rates with filters
 * POST   { rates?: [{...}] } or {...}                          → create single or bulk
 * PUT    { id, carrier?, serviceType?, cost?, ... }            → update
 * DELETE ?id=xxx                                                → soft-delete (isActive=false)
 */

// ── GET: List rates with optional filters ───────────
export async function GET(req: NextRequest) {
  const orgId = await getOrganizationId();
  const { searchParams } = req.nextUrl;

  try {
    // Build filter
    const whereClause: any = { organizationId: orgId };

    const carrier = searchParams.get("carrier");
    if (carrier) whereClause.carrier = carrier;

    const serviceType = searchParams.get("serviceType");
    if (serviceType) whereClause.serviceType = serviceType;

    const isActive = searchParams.get("isActive");
    if (isActive !== null) {
      whereClause.isActive = isActive === "true";
    }

    // Fetch all rates
    const rates = await prisma.shippingRate.findMany({
      where: whereClause,
      orderBy: [{ carrier: "asc" }, { serviceType: "asc" }, { postalCodeFrom: "asc" }],
    });

    // Group by carrier → serviceType
    const byCarrier: Array<{
      carrier: string;
      services: Array<{ serviceType: string; rates: typeof rates }>;
      totalRates: number;
      activeRates: number;
    }> = [];

    const carrierMap: Record<
      string,
      Record<string, typeof rates>
    > = {};

    for (const rate of rates) {
      if (!carrierMap[rate.carrier]) {
        carrierMap[rate.carrier] = {};
      }
      if (!carrierMap[rate.carrier][rate.serviceType]) {
        carrierMap[rate.carrier][rate.serviceType] = [];
      }
      carrierMap[rate.carrier][rate.serviceType].push(rate);
    }

    for (const carrier of Object.keys(carrierMap).sort()) {
      const serviceMap = carrierMap[carrier];
      const services = [];
      let totalRates = 0;
      let activeRates = 0;

      for (const serviceType of Object.keys(serviceMap).sort()) {
        const ratesForService = serviceMap[serviceType];
        services.push({
          serviceType,
          rates: ratesForService,
        });
        totalRates += ratesForService.length;
        activeRates += ratesForService.filter((r) => r.isActive).length;
      }

      byCarrier.push({
        carrier,
        services,
        totalRates,
        activeRates,
      });
    }

    const totalRates = rates.length;
    const activeRates = rates.filter((r) => r.isActive).length;

    return NextResponse.json({
      rates,
      byCarrier,
      totalRates,
      activeRates,
    });
  } catch (error: any) {
    console.error("Shipping rates GET error:", error);
    return NextResponse.json(
      { error: "Error fetching shipping rates", details: error.message },
      { status: 500 }
    );
  }
}

// ── POST: Create rate(s) ───────────────────────────
export async function POST(req: NextRequest) {
  const orgId = await getOrganizationId();
  const body = await req.json();

  try {
    // Handle bulk creation
    if (body.rates && Array.isArray(body.rates)) {
      const created = await prisma.$transaction(
        body.rates.map((rate: any) => {
          const { carrier, serviceType, serviceCode, postalCodeFrom, postalCodeTo, cost } = rate;

          // Validate required fields
          if (!carrier || !serviceType || !postalCodeFrom || cost === undefined) {
            throw new Error("carrier, serviceType, postalCodeFrom, and cost are required");
          }

          // Validate cost > 0
          if (Number(cost) <= 0) {
            throw new Error("cost must be greater than 0");
          }

          // Validate postal code range
          if (postalCodeTo && postalCodeFrom > postalCodeTo) {
            throw new Error("postalCodeTo must be >= postalCodeFrom");
          }

          return prisma.shippingRate.create({
            data: {
              organizationId: orgId,
              carrier,
              serviceType,
              serviceCode: serviceCode || null,
              postalCodeFrom,
              postalCodeTo: postalCodeTo || null,
              cost: parseFloat(cost),
              isActive: rate.isActive !== undefined ? rate.isActive : true,
            },
          });
        })
      );

      return NextResponse.json({ created: created.length, rates: created });
    }

    // Handle single creation
    const { carrier, serviceType, serviceCode, postalCodeFrom, postalCodeTo, cost, isActive } = body;

    if (!carrier || !serviceType || !postalCodeFrom || cost === undefined) {
      return NextResponse.json(
        { error: "carrier, serviceType, postalCodeFrom, and cost are required" },
        { status: 400 }
      );
    }

    if (Number(cost) <= 0) {
      return NextResponse.json(
        { error: "cost must be greater than 0" },
        { status: 400 }
      );
    }

    if (postalCodeTo && postalCodeFrom > postalCodeTo) {
      return NextResponse.json(
        { error: "postalCodeTo must be >= postalCodeFrom" },
        { status: 400 }
      );
    }

    const rate = await prisma.shippingRate.create({
      data: {
        organizationId: orgId,
        carrier,
        serviceType,
        serviceCode: serviceCode || null,
        postalCodeFrom,
        postalCodeTo: postalCodeTo || null,
        cost: parseFloat(cost),
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return NextResponse.json(rate);
  } catch (error: any) {
    console.error("Shipping rates POST error:", error);
    return NextResponse.json(
      { error: "Error creating shipping rate", details: error.message },
      { status: 400 }
    );
  }
}

// ── PUT: Update a rate ─────────────────────────────
export async function PUT(req: NextRequest) {
  const orgId = await getOrganizationId();
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    // Verify ownership
    const existing = await prisma.shippingRate.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Shipping rate not found" }, { status: 404 });
    }

    // Validate cost if provided
    if (updates.cost !== undefined && Number(updates.cost) <= 0) {
      return NextResponse.json(
        { error: "cost must be greater than 0" },
        { status: 400 }
      );
    }

    // Validate postal code range if both provided
    const postalCodeFrom = updates.postalCodeFrom !== undefined ? updates.postalCodeFrom : existing.postalCodeFrom;
    const postalCodeTo = updates.postalCodeTo !== undefined ? updates.postalCodeTo : existing.postalCodeTo;
    if (postalCodeTo && postalCodeFrom > postalCodeTo) {
      return NextResponse.json(
        { error: "postalCodeTo must be >= postalCodeFrom" },
        { status: 400 }
      );
    }

    const rate = await prisma.shippingRate.update({
      where: { id },
      data: {
        ...(updates.carrier !== undefined && { carrier: updates.carrier }),
        ...(updates.serviceType !== undefined && { serviceType: updates.serviceType }),
        ...(updates.serviceCode !== undefined && { serviceCode: updates.serviceCode }),
        ...(updates.postalCodeFrom !== undefined && { postalCodeFrom: updates.postalCodeFrom }),
        ...(updates.postalCodeTo !== undefined && { postalCodeTo: updates.postalCodeTo }),
        ...(updates.cost !== undefined && { cost: parseFloat(updates.cost) }),
        ...(updates.isActive !== undefined && { isActive: updates.isActive }),
      },
    });

    return NextResponse.json(rate);
  } catch (error: any) {
    console.error("Shipping rates PUT error:", error);
    return NextResponse.json(
      { error: "Error updating shipping rate", details: error.message },
      { status: 500 }
    );
  }
}

// ── DELETE: Soft-delete a rate ─────────────────────
export async function DELETE(req: NextRequest) {
  const orgId = await getOrganizationId();
  const { searchParams } = req.nextUrl;
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id param required" }, { status: 400 });
  }

  try {
    // Verify ownership
    const existing = await prisma.shippingRate.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Shipping rate not found" }, { status: 404 });
    }

    // Soft-delete: set isActive = false
    const rate = await prisma.shippingRate.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ deleted: true, rate });
  } catch (error: any) {
    console.error("Shipping rates DELETE error:", error);
    return NextResponse.json(
      { error: "Error deleting shipping rate", details: error.message },
      { status: 500 }
    );
  }
}
