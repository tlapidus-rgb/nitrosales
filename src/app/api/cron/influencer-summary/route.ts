export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Cron: Monthly Influencer Commission Summary
// ══════════════════════════════════════════════════════════════
// Runs on the 1st of every month. Sends each active influencer
// (with email) a summary of their previous month's performance.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";
import { sendEmail } from "@/lib/email/send";
import { monthlyCommissionSummaryEmail } from "@/lib/email/templates";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    // Security: require secret key
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const secret = process.env.NEXTAUTH_SECRET;
    if (key !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    // Previous month
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    // Two months ago (for comparison)
    const twoMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    const monthLabel = prevMonthStart.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    // Capitalize first letter
    const monthFormatted = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

    // Get all orgs with active influencers that have email
    const influencers = await prisma.influencer.findMany({
      where: {
        status: "ACTIVE",
        email: { not: null },
      },
      include: {
        organization: { select: { name: true, slug: true } },
        commissionTiers: { orderBy: { minRevenue: "asc" } },
      },
    });

    let sent = 0;
    let errors = 0;

    for (const inf of influencers) {
      try {
        if (!inf.email) continue;

        // Previous month metrics
        const monthAgg = await prisma.influencerAttribution.aggregate({
          where: {
            influencerId: inf.id,
            organizationId: inf.organizationId,
            createdAt: { gte: prevMonthStart, lt: prevMonthEnd },
          },
          _sum: { attributedValue: true, commissionAmount: true },
          _count: { id: true },
        });

        const totalSales = Number(monthAgg._sum.attributedValue || 0);
        const totalCommission = Number(monthAgg._sum.commissionAmount || 0);
        const totalConversions = monthAgg._count.id || 0;

        // Skip if no activity
        if (totalConversions === 0) continue;

        // Two months ago (for comparison)
        const prevAgg = await prisma.influencerAttribution.aggregate({
          where: {
            influencerId: inf.id,
            organizationId: inf.organizationId,
            createdAt: { gte: twoMonthsAgoStart, lt: prevMonthStart },
          },
          _sum: { attributedValue: true, commissionAmount: true },
        });
        const prevSales = Number(prevAgg._sum.attributedValue || 0);
        const prevCommission = Number(prevAgg._sum.commissionAmount || 0);

        // Best day
        const bestDay = await prisma.$queryRaw<Array<{ date: string; sales: number }>>(Prisma.sql`
          SELECT DATE("createdAt") as date, COALESCE(SUM("attributedValue"), 0)::float as sales
          FROM "influencer_attributions"
          WHERE "influencerId" = ${inf.id}
            AND "organizationId" = ${inf.organizationId}
            AND "createdAt" >= ${prevMonthStart}
            AND "createdAt" < ${prevMonthEnd}
          GROUP BY DATE("createdAt")
          ORDER BY sales DESC
          LIMIT 1
        `);

        // Determine active tier
        let tierLabel: string | null = null;
        const commissionPercent = Number(inf.commissionPercent);
        if (inf.commissionTiers.length > 0) {
          for (const t of inf.commissionTiers) {
            const min = Number(t.minRevenue);
            const max = t.maxRevenue ? Number(t.maxRevenue) : Infinity;
            if (totalSales >= min && totalSales < max) {
              tierLabel = t.label;
            }
          }
        }

        const appUrl = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";
        const dashboardLink = `${appUrl}/i/${inf.organization.slug}/${inf.code}`;

        const { subject, html } = monthlyCommissionSummaryEmail({
          influencerName: inf.publicName || inf.name,
          orgName: inf.organization.name,
          month: monthFormatted,
          totalSales,
          totalCommission,
          totalConversions,
          commissionPercent,
          tierLabel,
          dashboardLink,
          topDay: bestDay[0] ? {
            date: new Date(bestDay[0].date).toLocaleDateString("es-AR", { day: "numeric", month: "short" }),
            sales: bestDay[0].sales,
          } : null,
          comparison: prevSales > 0 ? {
            salesChange: ((totalSales - prevSales) / prevSales) * 100,
            commissionChange: prevCommission > 0 ? ((totalCommission - prevCommission) / prevCommission) * 100 : 0,
          } : null,
        });

        await sendEmail({ to: inf.email, subject, html });
        sent++;

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`[Influencer Summary] Error for ${inf.name}:`, err);
        errors++;
      }
    }

    console.log(`[Influencer Summary] Sent: ${sent}, Errors: ${errors}, Total: ${influencers.length}`);

    return NextResponse.json({
      ok: true,
      month: monthFormatted,
      sent,
      errors,
      total: influencers.length,
    });
  } catch (error: any) {
    console.error("[Influencer Summary Cron]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
