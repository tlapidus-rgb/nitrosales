-- ══════════════════════════════════════════════════════════════
-- AUDIENCE SYNC — Migration SQL
-- ══════════════════════════════════════════════════════════════
-- Ejecutar manualmente en Railway PostgreSQL
-- NUNCA usar prisma db push en producción
-- Fecha: 2026-04-04

-- 1. Tabla de audiencias
CREATE TABLE IF NOT EXISTS "audiences" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "platform" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "segmentType" TEXT NOT NULL,
  "segmentCriteria" JSONB NOT NULL DEFAULT '{}',
  "customerCount" INTEGER NOT NULL DEFAULT 0,
  "lastSyncedCount" INTEGER NOT NULL DEFAULT 0,
  "metaAudienceId" TEXT,
  "googleListId" TEXT,
  "metaMatchRate" DOUBLE PRECISION,
  "googleMatchRate" DOUBLE PRECISION,
  "autoSync" BOOLEAN NOT NULL DEFAULT false,
  "syncFrequency" TEXT NOT NULL DEFAULT 'DAILY',
  "lastSyncAt" TIMESTAMP(3),
  "lastSyncError" TEXT,
  "nextSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationId" TEXT NOT NULL,
  CONSTRAINT "audiences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audiences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "audiences_organizationId_status_idx" ON "audiences"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "audiences_organizationId_platform_idx" ON "audiences"("organizationId", "platform");

-- 2. Tabla de logs de sincronización
CREATE TABLE IF NOT EXISTS "audience_sync_logs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "action" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "customersTotal" INTEGER NOT NULL DEFAULT 0,
  "customersSent" INTEGER NOT NULL DEFAULT 0,
  "matchRate" DOUBLE PRECISION,
  "errorMessage" TEXT,
  "durationMs" INTEGER,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "audienceId" TEXT NOT NULL,
  CONSTRAINT "audience_sync_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audience_sync_logs_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "audiences"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "audience_sync_logs_audienceId_createdAt_idx" ON "audience_sync_logs"("audienceId", "createdAt");

-- Verificar:
-- SELECT count(*) FROM audiences;
-- SELECT count(*) FROM audience_sync_logs;
