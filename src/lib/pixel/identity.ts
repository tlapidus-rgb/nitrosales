// ══════════════════════════════════════════════════════════════
// NitroPixel — Identity Resolution
// ══════════════════════════════════════════════════════════════
// Maneja la creacion, actualizacion y merge de visitantes.
// Conecta visitor IDs anonimos con emails y Customers.

import { prisma } from '@/lib/db/client';
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
    }

    return updated;
  } catch (error) {
    console.error('[NitroPixel] Error in identifyVisitor:', error);
    return null;
  }
}
