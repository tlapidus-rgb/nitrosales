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
  metaFbc?: string | null;
  metaFbp?: string | null;
}

interface IdentifyProps {
  email?: string;
  phone?: string;
}

// ─── Phone normalization (E.164 best-effort, AR-aware) ───
// Removes everything except digits and a leading +. If the number starts with
// 0 (typical AR mobile prefix) or 15 (legacy mobile), normalizes to +54...
// This is a best-effort normalizer — fancier libraries (libphonenumber) can
// be wired later without changing the call sites.
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = String(raw).trim();
  if (!p) return null;
  // Strip everything except digits and leading +
  const hasPlus = p.startsWith('+');
  p = p.replace(/[^\d]/g, '');
  if (!p) return null;
  // Argentina common normalizations
  if (!hasPlus) {
    if (p.startsWith('54')) {
      p = '+' + p;
    } else if (p.startsWith('0')) {
      p = '+54' + p.slice(1);
    } else if (p.startsWith('15')) {
      p = '+549' + p.slice(2);
    } else if (p.length >= 8 && p.length <= 11) {
      p = '+54' + p;
    } else {
      p = '+' + p;
    }
  } else {
    p = '+' + p;
  }
  // Final sanity: must be 8–16 digits after the +
  const digits = p.slice(1);
  if (digits.length < 8 || digits.length > 16) return null;
  return p;
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
        // Persist latest real Meta cookies (only when present)
        ...(props.metaFbc ? { metaFbc: props.metaFbc } : {}),
        ...(props.metaFbp ? { metaFbp: props.metaFbp } : {}),
      },
      create: {
        visitorId: resolvedVisitorId,
        organizationId,
        deviceTypes: props.deviceType ? [props.deviceType] : [],
        clickIds: props.clickIds || undefined,
        country: props.country || undefined,
        region: props.region || undefined,
        metaFbc: props.metaFbc || undefined,
        metaFbp: props.metaFbp || undefined,
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
    const email = props.email ? props.email.toLowerCase().trim() : '';
    const phone = normalizePhone(props.phone);

    // Need at least one identifier
    if (!email && !phone) return null;

    // If email is provided, validate it
    if (email) {
      if (!email.includes('@')) return null;
      // ─── Email validation: domain blacklist + format check ───
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
      if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        console.log(`[NitroPixel] Invalid email format rejected: ${email}`);
        return null;
      }
    }

    // ── Phone-only identification path (no email) ──
    // When only a phone is provided, store it on the current visitor and
    // optionally merge with another visitor that already has the same phone.
    // The full email-based merge logic remains intact below for the email path.
    if (!email && phone) {
      const currentVisitor = await prisma.pixelVisitor.findUnique({
        where: { organizationId_visitorId: { organizationId, visitorId } }
      });
      if (!currentVisitor) {
        console.error('[NitroPixel] identifyVisitor (phone): visitor not found', visitorId);
        return null;
      }
      if (currentVisitor.phone === phone) return currentVisitor;

      // Merge if another visitor already has this phone
      const existingWithPhone = await prisma.pixelVisitor.findFirst({
        where: { organizationId, phone, id: { not: currentVisitor.id } }
      });

      if (existingWithPhone) {
        await prisma.pixelVisitorAlias.upsert({
          where: { oldVisitorId: visitorId },
          update: { visitorId: existingWithPhone.id },
          create: { oldVisitorId: visitorId, visitorId: existingWithPhone.id },
        });
        await prisma.pixelEvent.updateMany({
          where: { visitorId: currentVisitor.id },
          data: { visitorId: existingWithPhone.id },
        });
        await prisma.pixelVisitor.update({
          where: { id: existingWithPhone.id },
          data: {
            totalSessions: existingWithPhone.totalSessions + currentVisitor.totalSessions,
            totalPageViews: existingWithPhone.totalPageViews + currentVisitor.totalPageViews,
            lastSeenAt: new Date(),
            deviceTypes: [...new Set([...existingWithPhone.deviceTypes, ...currentVisitor.deviceTypes])],
            clickIds: (currentVisitor.clickIds || existingWithPhone.clickIds) as any,
          },
        });
        await prisma.pixelVisitor.delete({ where: { id: currentVisitor.id } });
        console.log(`[NitroPixel] Merged visitor ${visitorId} into ${existingWithPhone.visitorId} (phone match)`);
        return existingWithPhone;
      }

      // No merge — just attach phone to this visitor
      const updated = await prisma.pixelVisitor.update({
        where: { id: currentVisitor.id },
        data: { phone },
      });
      return updated;
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

    // Si ya tiene el mismo email: no hacer merge, pero PERSISTIR el phone
    // si vino uno nuevo (mejora EMQ de Meta CAPI sin tocar el merge graph).
    if (currentVisitor.email === email) {
      if (phone && currentVisitor.phone !== phone) {
        try {
          const updated = await prisma.pixelVisitor.update({
            where: { id: currentVisitor.id },
            data: { phone },
          });
          return updated;
        } catch {
          // Non-fatal — devolver visitor original
          return currentVisitor;
        }
      }
      return currentVisitor;
    }

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
          clickIds: (currentVisitor.clickIds || existingWithEmail.clickIds) as any,
          // Phone: prefer existing, fallback to current or newly provided
          phone: existingWithEmail.phone || currentVisitor.phone || phone || null,
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

    // No hay merge — simplemente actualizar el email (y phone si vino)
    const updated = await prisma.pixelVisitor.update({
      where: { id: currentVisitor.id },
      data: { email, ...(phone ? { phone } : {}) }
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
