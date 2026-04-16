// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-aura-payouts
// ═══════════════════════════════════════════════════════════════════
// Endpoint idempotente para crear las tablas del módulo Pagos de Aura:
//   - influencer_deals
//   - payouts
//
// Uso:
//   curl "https://nitrosales.vercel.app/api/admin/migrate-aura-payouts?key=<NEXTAUTH_SECRET>"
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

    // influencer_deals
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "influencer_deals" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "currency" TEXT NOT NULL DEFAULT 'ARS',
        "commissionPercent" DECIMAL(5,2),
        "flatAmount" DECIMAL(12,2),
        "flatUnit" TEXT,
        "bonusAmount" DECIMAL(12,2),
        "bonusMetric" TEXT,
        "bonusTarget" DECIMAL(12,2),
        "tiers" JSONB,
        "cpmRate" DECIMAL(12,2),
        "productValue" DECIMAL(12,2),
        "productDescription" TEXT,
        "startDate" DATE,
        "endDate" DATE,
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "organizationId" TEXT NOT NULL,
        "influencerId" TEXT NOT NULL,
        "campaignId" TEXT
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "influencer_deals_org_inf_status_idx"
      ON "influencer_deals"("organizationId", "influencerId", "status");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "influencer_deals_org_campaign_idx"
      ON "influencer_deals"("organizationId", "campaignId");
    `);

    // FKs (ignoran si ya existen)
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "influencer_deals"
          ADD CONSTRAINT "influencer_deals_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "influencer_deals"
          ADD CONSTRAINT "influencer_deals_influencerId_fkey"
          FOREIGN KEY ("influencerId") REFERENCES "influencers"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "influencer_deals"
          ADD CONSTRAINT "influencer_deals_campaignId_fkey"
          FOREIGN KEY ("campaignId") REFERENCES "influencer_campaigns"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // payouts
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "payouts" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "concept" TEXT NOT NULL,
        "amount" DECIMAL(12,2) NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'ARS',
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "periodStart" DATE,
        "periodEnd" DATE,
        "method" TEXT,
        "paidAt" TIMESTAMP(3),
        "reference" TEXT,
        "proofUrl" TEXT,
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "organizationId" TEXT NOT NULL,
        "influencerId" TEXT NOT NULL,
        "dealId" TEXT,
        "campaignId" TEXT
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "payouts_org_inf_status_idx"
      ON "payouts"("organizationId", "influencerId", "status");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "payouts_org_status_created_idx"
      ON "payouts"("organizationId", "status", "createdAt");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "payouts"
          ADD CONSTRAINT "payouts_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "payouts"
          ADD CONSTRAINT "payouts_influencerId_fkey"
          FOREIGN KEY ("influencerId") REFERENCES "influencers"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "payouts"
          ADD CONSTRAINT "payouts_dealId_fkey"
          FOREIGN KEY ("dealId") REFERENCES "influencer_deals"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "payouts"
          ADD CONSTRAINT "payouts_campaignId_fkey"
          FOREIGN KEY ("campaignId") REFERENCES "influencer_campaigns"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    return NextResponse.json({ ok: true, tables: ["influencer_deals", "payouts"] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
