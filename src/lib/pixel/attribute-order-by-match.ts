// ──────────────────────────────────────────────────────────────
// src/lib/pixel/attribute-order-by-match.ts  (BP-I1, 2026-06-11)
// ──────────────────────────────────────────────────────────────
// Atribuye una orden buscando su visitor del pixel y corriendo calculateAttribution.
// Pensado para los caminos de ingesta que NO son el webhook real-time (cron diario
// `sync/vtex`, cron 30min `trigger-vtex-sync`, backfill) — donde hoy las órdenes se
// crean SIN atribuir, que es la causa estructural de que la cobertura caiga con el volumen.
//
// Matching: email del customer (señal fuerte) → checkout-timing (fallback acotado).
// Es la MISMA lógica probada de admin/reconcile + replay-attribution (no se puede usar
// IP/teléfono como el webhook: esos datos solo existen en el payload en vivo, no quedan
// en la orden). La atribución real (touchpoints) la hace calculateAttribution, ya con la
// ventana anclada a orderDate (fix C1). Idempotente: si ya hay atribución NITRO, no rehace.
// Excluye marketplace (MELI/FVG-/BPR-/channel=marketplace): no tienen journey de pixel.
// ──────────────────────────────────────────────────────────────
import { prisma } from "@/lib/db/client";
import { calculateAttribution } from "@/lib/pixel/attribution";

const MS_DAY = 24 * 60 * 60 * 1000;
const MS_HOUR = 60 * 60 * 1000;

export interface AttributeByMatchResult {
  matched: boolean;
  strategy:
    | "email"
    | "checkout-timing"
    | "already-attributed"
    | "no-visitor-match"
    | "marketplace-skip"
    | "no-email-no-window"
    | "order-not-found";
  visitorId?: string;
}

export async function attributeOrderByMatch(
  orderId: string,
  organizationId: string
): Promise<AttributeByMatchResult> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: {
      id: true,
      externalId: true,
      orderDate: true,
      source: true,
      channel: true,
      trafficSource: true,
      customer: { select: { email: true } },
    },
  });
  if (!order) return { matched: false, strategy: "order-not-found" };

  // Excluir marketplace: no tienen journey de pixel (se atribuyen 0 por diseño).
  const eid = String(order.externalId || "");
  if (
    order.source === "MELI" ||
    order.channel === "marketplace" ||
    order.trafficSource === "Marketplace" ||
    eid.startsWith("FVG-") ||
    eid.startsWith("BPR-")
  ) {
    return { matched: false, strategy: "marketplace-skip" };
  }

  // Idempotente: si ya está atribuida NITRO, no rehacer.
  const existing = await prisma.pixelAttribution.findFirst({
    where: { orderId: order.id, model: "NITRO" },
    select: { id: true },
  });
  if (existing) return { matched: true, strategy: "already-attributed" };

  const orderTime = order.orderDate ?? new Date();
  const email = order.customer?.email || null;

  let matchedVisitorId: string | null = null;
  let strategy: AttributeByMatchResult["strategy"] | null = null;

  // ── Estrategia 1: email del customer (ventana amplia anclada a orderDate) ──
  // El email es identidad fuerte; ventana 30d hacia atrás + 1d (disparo tardío del pixel).
  if (email) {
    const wStart = new Date(orderTime.getTime() - 30 * MS_DAY);
    const wEnd = new Date(orderTime.getTime() + MS_DAY);
    const rows: Array<{ visitorId: string }> = await prisma.$queryRaw`
      SELECT pv.id as "visitorId"
      FROM pixel_visitors pv
      INNER JOIN pixel_events pe ON pe."visitorId" = pv.id
      WHERE pv."organizationId" = ${organizationId}
        AND pv.email = ${email}
        AND pe."sessionId" NOT LIKE 'webhook-%'
        AND pe.timestamp >= ${wStart}
        AND pe.timestamp <= ${wEnd}
      ORDER BY pe.timestamp DESC
      LIMIT 1
    `;
    if (rows.length > 0) {
      matchedVisitorId = rows[0].visitorId;
      strategy = "email";
    }
  }

  // ── Estrategia 2 (fallback): visitor en checkout/orderPlaced en ventana ACOTADA ──
  // Ventana corta (±3h alrededor de la compra) para minimizar atribución incorrecta a
  // otro cliente. Excluye sesiones de webhook (evita contaminación en cascada).
  if (!matchedVisitorId) {
    const wStart = new Date(orderTime.getTime() - 3 * MS_HOUR);
    const wEnd = new Date(orderTime.getTime() + MS_HOUR);
    const rows: Array<{ visitorId: string }> = await prisma.$queryRaw`
      SELECT pe."visitorId"
      FROM pixel_events pe
      WHERE pe."organizationId" = ${organizationId}
        AND pe."sessionId" NOT LIKE 'webhook-%'
        AND pe.timestamp >= ${wStart}
        AND pe.timestamp <= ${wEnd}
        AND (pe."pageUrl" LIKE '%/checkout/%'
             OR pe."pageUrl" LIKE '%orderPlaced%'
             OR pe.type IN ('CHECKOUT_SHIPPING', 'CHECKOUT_PAYMENT'))
      ORDER BY pe.timestamp DESC
      LIMIT 1
    `;
    if (rows.length > 0) {
      matchedVisitorId = rows[0].visitorId;
      strategy = "checkout-timing";
    }
  }

  if (!matchedVisitorId) {
    return { matched: false, strategy: email ? "no-visitor-match" : "no-email-no-window" };
  }

  // Rellenar el email del visitor si no tiene (NUNCA pisar uno distinto → contaminaría identidad).
  if (email) {
    await prisma.pixelVisitor
      .updateMany({
        where: { id: matchedVisitorId, OR: [{ email: null }, { email: "" }, { email }] },
        data: { email },
      })
      .catch(() => {});
  }

  await calculateAttribution(order.id, matchedVisitorId, organizationId);
  return { matched: true, strategy: strategy!, visitorId: matchedVisitorId };
}
