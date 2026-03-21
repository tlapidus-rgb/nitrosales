import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const org = await prisma.organization.findFirst({
    where: { slug: "elmundodeljuguete" },
  });

  if (!org) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }

  // Get last sync timestamps from Connection table
  const connections = await prisma.connection.findMany({
    where: { organizationId: org.id },
    select: {
      platform: true,
      status: true,
      lastSyncAt: true,
      lastSyncError: true,
    },
  });

  const statusMap: Record<string, any> = {};
  for (const conn of connections) {
    statusMap[conn.platform] = {
      status: conn.status,
      lastSyncAt: conn.lastSyncAt?.toISOString() || null,
      lastSyncError: conn.lastSyncError,
    };
  }

  return NextResponse.json({
    ok: true,
    connections: statusMap,
  });
}
