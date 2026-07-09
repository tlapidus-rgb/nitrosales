export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Detalle de una orden generada por un creador (item 29)
// ══════════════════════════════════════════════════════════════
// GET /api/aura/creators/[id]/orders/[orderId]
//
// Devuelve el detalle completo de una transacción para el modal admin de
// "Órdenes generadas" del perfil del creador: cabecera (total, estado,
// entrega, pago, cupón), ítems (producto, SKU, EAN, cantidades, precios),
// cliente y la atribución de ESTE creador (revenue + comisión).
//
// Seguridad: scopeado por org (getOrganization) y además se exige que la
// orden tenga una InfluencerAttribution de este creador — así el perfil de
// un creador no puede leer órdenes que no le pertenecen. Es una vista
// admin (vive bajo /aura, área autenticada del owner).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; orderId: string } },
) {
  try {
    const org = await getOrganization(req);
    const { id: creatorId, orderId } = params;

    // La atribución liga la orden a ESTE creador dentro de la org. Si no existe,
    // el creador no generó esa orden → 404 (no se filtra data de otras órdenes).
    const attribution = await prisma.influencerAttribution.findFirst({
      where: { organizationId: org.id, influencerId: creatorId, orderId },
      select: { attributedValue: true, commissionAmount: true, attributionModel: true, attributionSource: true },
    });
    if (!attribution) {
      return NextResponse.json({ error: "Orden no encontrada para este creador" }, { status: 404 });
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId: org.id },
      select: {
        id: true,
        externalId: true,
        status: true,
        totalValue: true,
        currency: true,
        itemCount: true,
        source: true,
        channel: true,
        paymentMethod: true,
        shippingCost: true,
        discountValue: true,
        couponCode: true,
        promotionNames: true,
        deliveryType: true,
        pickupStoreName: true,
        shippingCarrier: true,
        shippingService: true,
        orderDate: true,
        customer: { select: { firstName: true, lastName: true, email: true, city: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            product: { select: { name: true, sku: true, ean: true, imageUrl: true, brand: true } },
          },
        },
      },
    });
    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    const customerName = order.customer
      ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ").trim() || null
      : null;

    return NextResponse.json({
      order: {
        id: order.id,
        externalId: order.externalId,
        status: order.status,
        totalValue: Number(order.totalValue),
        currency: order.currency,
        itemCount: order.itemCount,
        source: order.source,
        channel: order.channel,
        paymentMethod: order.paymentMethod,
        shippingCost: order.shippingCost != null ? Number(order.shippingCost) : null,
        discountValue: order.discountValue != null ? Number(order.discountValue) : null,
        couponCode: order.couponCode,
        promotionNames: order.promotionNames,
        deliveryType: order.deliveryType,
        pickupStoreName: order.pickupStoreName,
        shippingCarrier: order.shippingCarrier,
        shippingService: order.shippingService,
        orderDate: order.orderDate.toISOString(),
        customer: order.customer
          ? { name: customerName, email: order.customer.email, city: order.customer.city }
          : null,
        items: order.items.map((it) => ({
          id: it.id,
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
          totalPrice: Number(it.totalPrice),
          name: it.product?.name ?? "Producto",
          sku: it.product?.sku ?? null,
          ean: it.product?.ean ?? null,
          imageUrl: it.product?.imageUrl ?? null,
          brand: it.product?.brand ?? null,
        })),
      },
      attribution: {
        attributedValue: Number(attribution.attributedValue),
        commissionAmount: Number(attribution.commissionAmount),
        attributionModel: attribution.attributionModel,
        attributionSource: attribution.attributionSource,
      },
    });
  } catch (e: any) {
    console.error("[aura/creators/[id]/orders/[orderId]] error:", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
