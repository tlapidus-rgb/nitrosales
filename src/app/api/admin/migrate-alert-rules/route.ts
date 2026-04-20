// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-alert-rules — Fase 8g-1
// ═══════════════════════════════════════════════════════════════════
// Crea 2 tablas:
//   1. alert_rules          — reglas activas de alertas del user
//   2. alert_rule_requests  — backlog de pedidos Aurum no pudo mapear
//
// Schema alert_rules:
//   id               TEXT PK
//   organizationId   TEXT FK -> organizations.id
//   userId           TEXT FK -> users.id
//   name             TEXT (label humano)
//   type             TEXT ('condition' | 'schedule' | 'anomaly')
//   primitiveKey     TEXT (ej: 'finanzas.runway.below_months')
//   params           JSONB (ej: { months: 3 })
//   operator         JSONB (ej: { op: 'below', value: 3 })
//   schedule         JSONB (para type='schedule')
//   channels         TEXT[] (['in_app', 'email'])
//   cooldownMinutes  INT
//   severity         TEXT ('critical' | 'warning' | 'info')
//   enabled          BOOLEAN
//   lastFiredAt      TIMESTAMP
//   nextFireAt       TIMESTAMP (para schedule)
//   createdAt        TIMESTAMP
//   updatedAt        TIMESTAMP
//
// Schema alert_rule_requests:
//   id               TEXT PK
//   organizationId   TEXT FK
//   userId           TEXT FK
//   naturalRequest   TEXT (pedido original del user en Aurum)
//   reason           TEXT (por que Aurum no pudo mapear)
//   createdAt        TIMESTAMP
//   status           TEXT ('pending' | 'resolved' | 'rejected')
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (!key || key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // ─── alert_rules ───
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "alert_rules" (
        "id" TEXT PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'condition',
        "primitiveKey" TEXT NOT NULL,
        "params" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "operator" JSONB,
        "schedule" JSONB,
        "channels" TEXT[] NOT NULL DEFAULT ARRAY['in_app']::TEXT[],
        "cooldownMinutes" INTEGER NOT NULL DEFAULT 60,
        "severity" TEXT NOT NULL DEFAULT 'warning',
        "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
        "lastFiredAt" TIMESTAMP(3),
        "nextFireAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "alert_rules_organizationId_idx"
      ON "alert_rules"("organizationId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "alert_rules_userId_idx"
      ON "alert_rules"("userId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "alert_rules_enabled_nextFireAt_idx"
      ON "alert_rules"("enabled", "nextFireAt");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "alert_rules"
          ADD CONSTRAINT "alert_rules_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "alert_rules"
          ADD CONSTRAINT "alert_rules_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ─── alert_rule_requests ───
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "alert_rule_requests" (
        "id" TEXT PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "naturalRequest" TEXT NOT NULL,
        "reason" TEXT,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "alert_rule_requests_organizationId_idx"
      ON "alert_rule_requests"("organizationId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "alert_rule_requests_status_idx"
      ON "alert_rule_requests"("status");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "alert_rule_requests"
          ADD CONSTRAINT "alert_rule_requests_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "alert_rule_requests"
          ADD CONSTRAINT "alert_rule_requests_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    return NextResponse.json({
      ok: true,
      message:
        "alert_rules + alert_rule_requests listas. Ya se pueden crear reglas de alertas por user.",
    });
  } catch (error: any) {
    console.error("[migrate-alert-rules] error:", error);
    return NextResponse.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
