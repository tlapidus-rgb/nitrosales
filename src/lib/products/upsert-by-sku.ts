/**
 * upsert-by-sku.ts
 *
 * Regla unica de ingesta de productos: SKU-first.
 *
 * POR QUE existe esto (Sesion 21):
 *   Antes, cada sync (VTEX, ML, webhooks) hacia upsert por (orgId, externalId).
 *   Cuando el mismo SKU entraba desde dos plataformas, se creaban dos filas
 *   distintas -> duplicados, huerfanos sin categoria, reportes rotos.
 *
 * REGLA:
 *   1. Si viene SKU (no vacio) -> buscar producto existente por (orgId, sku).
 *      Si ya existe: UPDATE ese producto (no crear duplicado).
 *   2. Si no hay SKU (o no matchea) -> caer al upsert tradicional por externalId.
 *
 * Esta es la UNICA forma valida de crear/actualizar productos desde sync.
 * Nunca llamar a prisma.product.upsert directo en codigo de sync nuevo.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma, Product } from "@prisma/client";

export type UpsertBySkuArgs = {
  organizationId: string;
  externalId: string;
  sku?: string | null;
  /** Datos a usar si hay que crear. NO incluir organization/organizationId (se inyectan). */
  create: Omit<Prisma.ProductUncheckedCreateInput, "organizationId" | "externalId" | "sku">;
  /** Datos a usar si hay que actualizar. */
  update: Prisma.ProductUncheckedUpdateInput;
};

/**
 * Upsert de producto con prioridad SKU.
 * Devuelve siempre el Product (creado o actualizado).
 */
export async function upsertProductBySku(
  args: UpsertBySkuArgs
): Promise<Product> {
  const { organizationId, externalId, sku, create, update } = args;
  const cleanSku = sku?.trim() || null;

  // 1. Si hay SKU, priorizarlo
  if (cleanSku) {
    const existingBySku = await prisma.product.findFirst({
      where: { organizationId, sku: cleanSku },
      select: { id: true },
    });

    if (existingBySku) {
      return prisma.product.update({
        where: { id: existingBySku.id },
        data: update,
      });
    }
  }

  // 2. Fallback: upsert por externalId (comportamiento legacy)
  return prisma.product.upsert({
    where: {
      organizationId_externalId: { organizationId, externalId },
    },
    create: {
      organizationId,
      externalId,
      sku: cleanSku,
      ...create,
    } as Prisma.ProductUncheckedCreateInput,
    update,
  });
}
