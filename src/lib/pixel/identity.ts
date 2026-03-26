// ══════════════════════════════════════════════════════════════
// NitroPixel — Identity Resolution
// ══════════════════════════════════════════════════════════════
// Maneja la creacion, actualizacion y merge de visitantes.
// Conecta visitor IDs anonimos con emails y Customers.

import { prisma } from '@/lib/db/client';
import { calculateAttribution } from '@/lib/pixel/attribution';
import crypto from 'crypto';

// ─── Types ───

interface VisitorProps {
  sessionId: string;
  deviceType?: string;
  country?: string;
  region?: string;
  clickIds?: Record<string, string>;
  utmParams?: Record<string, string>;
  pageUrl?: string;
}

interface IdentifyProps {
  email: string;
}

// ─── Hash IP (no guardamos IP raw, solo hash para dedup) ───

export function hashIP(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

// ─── Hash email for CAPI (SHA256 full, lowercase, trimmed) ───

export function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

// ─── Find or Create Visitor ───

export async function findOrCreateVisitor(
  organizationId: string,
  visitorId: string,
  props: VisitorProps
) {
  try {
    // Primero intentar resolver alias (por si este visitorId fue mergeado)
    const alias = await prisma.pixelVisitorAlias.findUnique({
      where: { oldVisitorId: visitorId }
    });

    const resolvedVisitorId = alias
      ? (await prisma.pixelVisitor.findUnique({ where: { id: alias.visitorId } }))?.visitorId || visitorId
      : visitorId;

    // Upsert el visitor
    const visitor = await prisma.pixelVisitor.upsert({
      where: {
        organizationId_visitorId: {
          organizationId,
          visitorId: resolvedVisitorId
        }
      },
      update: {
        lastSeenAt: new Date(),
        totalPageViews: { increment: 1 },
        // Actualizar deviceType si es nuevo
        ...(props.deviceType && {
          deviceTypes: {
            push: props.deviceType
          }
        }),
        // Actualizar clickIds si hay nuevos
        ...(props.clickIds && Object.keys(props.clickIds).length > 0 && {
          clickIds: props.clickIds
        }),
        ...(props.country && { country: props.country }),
        ...(props.region && { region: props.region }),
      },
      create: {
        visitorId: resolvedVisitorId,
        organizationId,
        deviceTypes: props.deviceType ? [props.deviceType] : [],
        clickIds: props.clickIds || undefined,
        country: props.country || undefined,
        region: props.region || undefined,
      }
    });

    // Dedup deviceTypes (el push puede generar duplicados)
    if (visitor.deviceTypes.length > 3) {
      const unique = [...new Set(visitor.deviceTypes)];
      if (unique.length !== visitor.deviceTypes.length) {
        await prisma.pixelVisitor.update({
          where: { id: visitor.id },
          data: { deviceTypes: unique }
        });
      }
    }

    return visitor;
  } catch (error) {
    console.error('[NitroPixel] Error in findOrCreateVisitor:', error);
    return null;
  }
}

// ─── Identify Visitor (asociar email) ───

export async function identifyVisitor(
  organizationId: string,
  visitorId: string,
  props: IdentifyProps
) {
  try {
    const email = props.email.toLowerCase().trim();
    if (!email || !email.includes('@')) return null;

    // ─── Email validation: domain blacklist + format check ───
    // Prevents disposable/test emails from polluting identity graph
    const BLACKLISTED_DOMAINS = [
      'test.com', 'example.com', 'temp-mail.org', 'guerrillamail.com',
      'mailinator.com', 'yopmail.com', 'throwaway.email', '10minutemail.com',
      'trashmail.com', 'fakeinbox.com', 'tempmail.com', 'sharklasers.com',
      'guerrillamailblock.com', 'grr.la', 'dispostable.com',
    ];
    const emailDomain = email.split('@')[1];
    if (!emailDomain || BLACKLISTED_DOMAINS.includes(emailDomain)) {
      console.log(`[NitroPixel] Blocked disposable email domain: ${emailDomain}`);
      return null;
    }
    // Stricter format validation (must have valid TLD)
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      console.log(`[NitroPixel] Invalid email format rejected: ${email}`);
      return null;
    }

    // Buscar el visitor actual
    const currentVisitor = await prisma.pixelVisitor.findUnique({
      where: {
        organizationId_visitorId: { organizationId, visitorId }
      }
    });

    if (!currentVisitor) {
      console.error('[NitroPixel] identifyVisitor: visitor not found', visitorId);
      return null;
    }

    // Si ya tiene el mismo email, no hacer nada
    if (currentVisitor.email === email) return currentVisitor;

    // Buscar si hay otro visitor con este email (para merge)
    const existingWithEmail = await prisma.pixelVisitor.findFirst({
      where: {
        organizationId,
        email,
        id: { not: currentVisitor.id }
      }
    });

    if (existingWithEmail) {
      // MERGE: el visitor actual se absorbe en el que ya tenia email
      // Crear alias para que futuros eventos con el viejo visitorId se resuelvan
      await prisma.pixelVisitorAlias.upsert({
        where: { oldVisitorId: visitorId },
        update: { visitorId: existingWithEmail.id },
        create: {
          oldVisitorId: visitorId,
          visitorId: existingWithEmail.id
        }
      });

      // Mover los eventos del visitor actual al existente
      await prisma.pixelEvent.updateMany({
        where: { visitorId: currentVisitor.id },
        data: { visitorId: existingWithEmail.id }
      });

      // Acumular stats
      await prisma.pixelVisitor.update({
        where: { id: existingWithEmail.id },
        data: {
          totalSessions: existingWithEmail.totalSessions + currentVisitor.totalSessions,
          totalPageViews: existingWithEmail.totalPageViews + currentVisitor.totalPageViews,
          lastSeenAt: new Date(),
          // Merge device types
          deviceTypes: [...new Set([...existingWithEmail.deviceTypes, ...currentVisitor.deviceTypes])],
          // Keep clickIds del mas reciente
          clickIds: currentVisitor.clickIds || existingWithEmail.clickIds,
        }
      });

      // Eliminar el visitor duplicado
      await prisma.pixelVisitor.delete({ where: { id: currentVisitor.id } });

      console.log(`[NitroPixel] Merged visitor ${visitorId} into ${existingWithEmail.visitorId} (email: ${email})`);

      // ─── DEFERRED ATTRIBUTION (post-merge) ───
      // After merging, the surviving visitor now has all events from both.
      // Check for unattributed orders from the associated customer.
      try {
        const customer = await prisma.customer.findFirst({
          where: { organizationId, email }
        });
        if (customer) {
          const customerOrders = await prisma.order.findMany({
            where: { customerId: customer.id, organizationId },
            select: { id: true, externalId: true },
            orderBy: { orderDate: 'desc' },
            take: 10,
          });
          for (const order of customerOrders) {
            const existingAttr = await prisma.pixelAttribution.findFirst({
              where: { orderId: order.id, visitorId: existingWithEmail.id, model: 'LAST_CLICK' }
            });
            if (!existingAttr) {
              await calculateAttribution(order.id, existingWithEmail.id, organizationId);
              console.log(`[NitroPixel] DEFERRED ATTRIBUTION (merge): Order ${order.externalId} attributed to merged visitor ${existingWithEmail.visitorId}`);
            }
          }
        }
      } catch (deferredError) {
        console.error('[NitroPixel] Deferred attribution error post-merge (non-fatal):', deferredError);
      }

      return existingWithEmail;
    }

    // No hay merge — simplemente actualizar el email
    const updated = await prisma.pixelVisitor.update({
      where: { id: currentVisitor.id },
      data: { email }
    });

    // Intentar linkear con Customer existente
    const customer = await prisma.customer.findFirst({
      where: { organizationId, email }
    });

    if (customer) {
      await prisma.pixelVisitor.update({
        where: { id: updated.id },
        data: { customerId: customer.id }
      });
      console.log(`[NitroPixel] Linked visitor ${visitorId} to customer ${customer.id} via email ${email}`);

      // ─── DEFERRED ATTRIBUTION ───
      // Now that we know this visitor's email matches a customer, check for
      // unattributed orders from this customer. This solves the timing problem:
      // webhook arrives → can't find visitor → order gets no attribution →
      // later, visitor identifies → NOW we can attribute retroactively.
      //
      // Also handles orders attributed to a webhook-heuristic visitor:
      // if the webhook used Strategy 4 (recent-activity) and guessed wrong,
      // we now have the REAL visitor via email confirmation.
      try {
        // Find orders from this customer
        const customerOrders = await prisma.order.findMany({
          where: {
            customerId: customer.id,
            organizationId,
          },
          select: { id: true, externalId: true },
          orderBy: { orderDate: 'desc' },
          take: 10, // Limit to recent orders to avoid processing ancient history
        });

        for (const order of customerOrders) {
          // Check if attribution already exists for this order with this visitor
          const existingAttribution = await prisma.pixelAttribution.findFirst({
            where: {
              orderId: order.id,
              visitorId: updated.id,
              model: 'LAST_CLICK',
            }
          });

          if (!existingAttribution) {
            // No attribution with this visitor → either no attribution at all,
            // or attributed to wrong visitor. Calculate with the real one.
            await calculateAttribution(order.id, updated.id, organizationId);
            console.log(`[NitroPixel] DEFERRED ATTRIBUTION: Order ${order.externalId} attributed to visitor ${visitorId} via email bridge (${email})`);
          }
        }
      } catch (deferredError) {
        // Deferred attribution failure is non-fatal
        console.error('[NitroPixel] Deferred attribution error (non-fatal):', deferredError);
      }
    }

    return updated;
  } catch (error) {
    console.error('[NitroPixel] Error in identifyVisitor:', error);
    return null;
  }
}
