export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || "NOT SET";
  const unpooled = process.env.DATABASE_URL_UNPOOLED || "NOT SET";

  // Redact password but show everything else
  const redact = (url: string) => url.replace(/:[^@]+@/, ':***@');

  // Test raw TCP connection to Neon
  const start = Date.now();
  let dbTest = "not tested";
  try {
    const { PrismaClient } = require("@prisma/client");
    const testClient = new PrismaClient({
      datasources: { db: { url: dbUrl } },
    });
    await testClient.$queryRawUnsafe("SELECT 1 as ok");
    dbTest = `OK in ${Date.now() - start}ms`;
    await testClient.$disconnect();
  } catch (e: any) {
    dbTest = `FAILED in ${Date.now() - start}ms: ${e.message?.substring(0, 200)}`;
  }

  return NextResponse.json({
    DATABASE_URL: redact(dbUrl),
    DATABASE_URL_UNPOOLED: redact(unpooled),
    dbTest,
    nodeVersion: process.version,
    region: process.env.VERCEL_REGION || "unknown",
    timestamp: new Date().toISOString(),
  });
}
