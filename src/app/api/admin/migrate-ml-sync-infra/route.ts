// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/migrate-ml-sync-infra
// ══════════════════════════════════════════════════════════════
// Crea la infraestructura del sync robusto ML (4 capas).
// Idempotente — safe to re-run.
//
// Cambios:
//  1. ALTER TABLE orders ADD externalUpdatedAt (para guard idempotencia)
//  2. CREATE TABLE sync_watermarks (cursors por org + platform + layer)
//  3. CREATE TABLE meli_webhook_events (outbox de eventos crudos)
//  4. Indexes
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const log: string[] = [];

    // ─────────────────────────────────────────────────────────
    // 1. Order.externalUpdatedAt — guard de idempotencia
    // ─────────────────────────────────────────────────────────
    // Nullable: órdenes viejas no tienen. Para esas, el guard
    // degrada a "siempre actualiza" (comportamiento actual).
    // Para nuevas, el processor lo puebla y el guard funciona.
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "externalUpdatedAt" TIMESTAMPTZ
    `);
    log.push("✓ Order.externalUpdatedAt agregada (nullable)");

    // Índice por externalUpdatedAt para queries "últimas actualizadas"
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "orders_org_source_updated_idx"
      ON "orders"("organizationId", "source", "externalUpdatedAt" DESC)
    `);
    log.push("✓ Index (org, source, externalUpdatedAt DESC)");

    // ─────────────────────────────────────────────────────────
    // 2. sync_watermarks — cursor por (org, platform, syncLayer)
    // ─────────────────────────────────────────────────────────
    // syncLayer: "incremental" | "deep" | "missed_feeds"
    // Cada capa mantiene su propio cursor para independencia.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "sync_watermarks" (
        "organizationId" TEXT NOT NULL,
        "platform" TEXT NOT NULL,
        "syncLayer" TEXT NOT NULL,
        "lastSuccessfulSyncAt" TIMESTAMPTZ NOT NULL,
        "lastRunAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "lastRunStatus" TEXT DEFAULT 'ok',
        "metadata" JSONB DEFAULT '{}'::jsonb,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("organizationId", "platform", "syncLayer")
      )
    `);
    log.push("✓ Tabla sync_watermarks creada");

    // ─────────────────────────────────────────────────────────
    // 3. meli_webhook_events — outbox de eventos crudos
    // ─────────────────────────────────────────────────────────
    // Webhook handler escribe aquí PRIMERO + return 200 <500ms.
    // Worker async procesa después. UNIQUE en (org, externalId)
    // dedupa webhooks duplicados (ML a veces los reenvía).
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "meli_webhook_events" (
        "id" TEXT PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "externalId" TEXT NOT NULL,
        "resource" TEXT NOT NULL,
        "topic" TEXT NOT NULL,
        "meliUserId" BIGINT,
        "meliSentAt" TIMESTAMPTZ,
        "meliReceivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "processed" BOOLEAN NOT NULL DEFAULT false,
        "processedAt" TIMESTAMPTZ,
        "processingAttempts" INT NOT NULL DEFAULT 0,
        "lastError" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("organizationId", "externalId")
      )
    `);
    log.push("✓ Tabla meli_webhook_events creada");

    // Índice para que el worker encuentre rápido los pendientes
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "meli_webhook_events_unprocessed_idx"
      ON "meli_webhook_events"("createdAt")
      WHERE "processed" = false
    `);
    log.push("✓ Index parcial para pendientes");

    // Índice por org para queries de debugging
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "meli_webhook_events_org_idx"
      ON "meli_webhook_events"("organizationId", "createdAt" DESC)
    `);
    log.push("✓ Index por org");

    return NextResponse.json({ ok: true, log });
  } catch (error: any) {
    console.error("[migrate-ml-sync-infra] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
