import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
export async function GET() {
  const total = await prisma.webMetricDaily.count();
  const all = await prisma.webMetricDaily.findMany({ take: 5, orderBy: { date: 'desc' } });
  const orgId = "cmmmga1uq0000sb43w0krvvys";
  const withOrg = await prisma.webMetricDaily.count({ where: { organizationId: orgId } });
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const withDate = await prisma.webMetricDaily.count({ where: { organizationId: orgId, date: { gte: thirtyDaysAgo } } });
  return NextResponse.json({ total, withOrg, withDate, sample: all });
}