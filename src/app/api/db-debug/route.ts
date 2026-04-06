import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "use POST to run setup" });
}

export async function POST(req: NextRequest) {
  const results: Record<string, unknown> = {};

  try {
    const { action } = await req.json();

    if (action === "setup-memory-table") {
      // Create enum if not exists
      try {
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            CREATE TYPE "MemoryCategory" AS ENUM ('BUSINESS_RULE', 'CORRECTION', 'PREFERENCE', 'CONTEXT');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
        `);
        results.enum = "created or already exists";
      } catch (e: any) {
        results.enumError = e.message;
      }

      // Create table if not exists
      try {
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "bot_memories" (
            "id" TEXT NOT NULL,
            "category" "MemoryCategory" NOT NULL,
            "title" TEXT NOT NULL,
            "content" TEXT NOT NULL,
            "priority" INTEGER NOT NULL DEFAULT 5,
            "isActive" BOOLEAN NOT NULL DEFAULT true,
            "usageCount" INTEGER NOT NULL DEFAULT 0,
            "lastUsedAt" TIMESTAMP(3),
            "source" TEXT NOT NULL DEFAULT 'MANUAL',
            "createdBy" TEXT,
            "sourceData" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "organizationId" TEXT NOT NULL,
            CONSTRAINT "bot_memories_pkey" PRIMARY KEY ("id"),
            CONSTRAINT "bot_memories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
          );
        `);
        results.table = "created or already exists";
      } catch (e: any) {
        results.tableError = e.message;
      }

      // Create index if not exists
      try {
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "bot_memories_organizationId_isActive_priority_idx" 
          ON "bot_memories"("organizationId", "isActive", "priority");
        `);
        results.index = "created or already exists";
      } catch (e: any) {
        results.indexError = e.message;
      }

      // Verify
      try {
        const count = await (prisma as any).botMemory.count();
        results.verify = `OK - ${count} memories`;
      } catch (e: any) {
        results.verifyError = e.message;
      }

      return NextResponse.json({ success: true, ...results });
    }

    return NextResponse.json({ error: "Unknown action. Use: setup-memory-table" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, ...results }, { status: 500 });
  }
}
