// ══════════════════════════════════════════════════════════════
// NitroPixel — Link Visitor to Customer
// ══════════════════════════════════════════════════════════════
// Linkea pixel_visitors anonimos (con email/phone pero sin
// customerId) a un Customer existente. Al linkear, dispara
// deferred attribution para las ultimas N ordenes del customer
// (recupera canal de ventas que quedaron "Sin canal" porque el
// webhook nunca encontro el visitor correcto).
//
// Usado desde:
//   - Webhook VTEX (real-time, tras customer.upsert)
//   - Endpoint admin /api/admin/backfill-visitor-customer-link
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import { calculateAttribution } from "@/lib/pixel/attribution";
import { normalizePhone } from "@/lib/pixel/identity";

interface LinkInput {
  id: string;
  email?: string | null;
  phone?: string | null;
}

interface LinkResult {
  linked: number;
  attributionRecovered: number;
  skippedReasons: Record<string, number>;
}

/**
 * Linkea pixel_visitors que matchean el email/phone del customer y
 * no tienen customerId seteado todavia.
 *
 * Idempotente: si no hay visitors matcheables, no hace nada.
 * Non-fatal: cualquier error se loguea y se devuelve un resultado vacio.
 *
 * @param customer objeto con id, email, phone
 * @param organizationId org del customer
 * @param opts.attributionLimit cuantas ordenes recientes re-atribuir (default 5)
 */
export async function linkVisitorToCustomer(
  customer: LinkInput,
  organizationId: string,
  opts: { attributionLimit?: number } = {}
): Promise<LinkResult> {
  const result: LinkResult = {
    linked: 0,
    attributionRecovered: 0,
    skippedReasons: {},
  };

  try {
    // Normalizar identifiers
    const rawEmail = customer.email ? customer.email.toLowerCase().trim() : null;
    const emailForMatch = rawEmail && rawEmail.includes("@") ? rawEmail : null;
    const phoneForMatch = normalizePhone(customer.phone);

    if (!emailForMatch && !phoneForMatch) {
      result.skippedReasons["no-identifiers"] =
        (result.skippedReasons["no-identifiers"] || 0) + 1;
      return result;
    }

    // Buscar pixel_visitors con email/phone match y SIN customerId todavia
    // WHERE customerId IS NULL es clave: evita pisar un link ya hecho
    // (carrera webhook vs backfill vs identifyVisitor).
    const whereOr: Array<{ email?: string; phone?: string }> = [];
    if (emailForMatch) whereOr.push({ email: emailForMatch });
    if (phoneForMatch) whereOr.push({ phone: phoneForMatch });

    const candidates = await prisma.pixelVisitor.findMany({
      where: {
        organizationId,
        customerId: null,
        OR: whereOr,
      },
      select: { id: true, visitorId: true, email: true, phone: true },
      take: 25, // safety cap — un customer no deberia tener 25+ visitors duplicados
    });

    if (candidates.length === 0) {
      result.skippedReasons["no-matching-visitors"] =
        (result.skippedReasons["no-matching-visitors"] || 0) + 1;
      return result;
    }

    // Linkear todos los candidatos al customer (anti-race: re-chequeamos customerId: null)
    for (const v of candidates) {
      const updateRes = await prisma.pixelVisitor.updateMany({
        where: { id: v.id, customerId: null },
        data: { customerId: customer.id },
      });
      if (updateRes.count > 0) {
        result.linked += 1;
        console.log(
          `[linkVisitor] Linked visitor ${v.visitorId} to customer ${customer.id} ` +
            `(email=${v.email || "-"}, phone=${v.phone || "-"})`
        );
      }
    }

    if (result.linked === 0) {
      result.skippedReasons["already-linked"] =
        (result.skippedReasons["already-linked"] || 0) + 1;
      return result;
    }

    // Deferred attribution: re-calcular canal de las ultimas N ordenes
    // del customer usando el visitor recien linkeado (el "surviving" visitor).
    // Si ya hay una attribution con ese visitor, calculateAttribution es idempotente.
    const attributionLimit = opts.attributionLimit ?? 5;
    const survivingVisitor = candidates[0]; // el primero es suficiente como bridge

    try {
      const orders = await prisma.order.findMany({
        where: { customerId: customer.id, organizationId },
        select: { id: true, externalId: true, orderDate: true },
        orderBy: { orderDate: "desc" },
        take: attributionLimit,
      });

      for (const order of orders) {
        const existingAttr = await prisma.pixelAttribution.findFirst({
          where: {
            orderId: order.id,
            visitorId: survivingVisitor.id,
            model: "LAST_CLICK",
          },
          select: { id: true },
        });
        if (existingAttr) continue;

        await calculateAttribution(order.id, survivingVisitor.id, organizationId);
        result.attributionRecovered += 1;
        console.log(
          `[linkVisitor] Deferred attribution: order ${order.externalId} → visitor ${survivingVisitor.visitorId}`
        );
      }
    } catch (attrError) {
      // La atribucion diferida nunca debe romper el linkeo
      console.error("[linkVisitor] Deferred attribution error (non-fatal):", attrError);
    }

    return result;
  } catch (error) {
    console.error("[linkVisitor] Unexpected error (non-fatal):", error);
    return result;
  }
}
