import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const results: Record<string, unknown> = {};
  
  try {
    // Check DB connection
    const dbUrl = process.env.DATABASE_URL || "NOT SET";
    results.dbUrlPrefix = dbUrl.substring(0, 40) + "...";
    results.dbUrlUnpooled = process.env.DATABASE_URL_UNPOOLED ? "SET" : "NOT SET";
    
    // Check if table exists via raw query
    const tables = await prisma.$queryRaw<Array<{table_name: string}>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('bot_memories', 'organizations')
      ORDER BY table_name
    `;
    results.tables = tables.map((t: any) => t.table_name);
    
    // Try to count bot_memories
    try {
      const count = await prisma.$queryRaw<Array<{count: bigint}>>`SELECT count(*) as count FROM bot_memories`;
      results.botMemoriesCount = Number(count[0].count);
    } catch (e: any) {
      results.botMemoriesError = e.message;
    }

    // Try prisma model access
    try {
      const mems = await (prisma as any).botMemory.findMany({ take: 1 });
      results.prismaModelAccess = "OK";
      results.prismaModelCount = mems.length;
    } catch (e: any) {
      results.prismaModelError = e.message;
    }

    // Check org
    try {
      const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
      results.org = org;
    } catch (e: any) {
      results.orgError = e.message;
    }

  } catch (e: any) {
    results.error = e.message;
  }

  return NextResponse.json(results);
}
