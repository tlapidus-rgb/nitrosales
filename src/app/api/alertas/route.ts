import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * Alertas API
 *
 * GET: Fetch insights/alerts for the org
 *   ?unread=true  — only unread
 *   ?priority=HIGH — filter by priority
 *   ?limit=20     — pagination
 *   ?offset=0
 *
 * PATCH: Mark insight as read/dismissed
 *   body: { id, isRead?, isDismissed? }
 */
export async function GET(req: NextRequest) {
  try {
    const ORG_ID = await getOrganizationId();
    const { searchParams } = req.nextUrl;

    const unreadOnly = searchParams.get("unread") === "true";
    const priorityFilter = searchParams.get("priority");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: any = {
      organizationId: ORG_ID,
      isDismissed: false,
    };
    if (unreadOnly) where.isRead = false;
    if (priorityFilter) where.priority = priorityFilter;

    const [insights, total, unreadCount] = await Promise.all([
      prisma.insight.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.insight.count({ where }),
      prisma.insight.count({
        where: { organizationId: ORG_ID, isRead: false, isDismissed: false },
      }),
    ]);

    return NextResponse.json({
      insights,
      total,
      unreadCount,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("[alertas] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ORG_ID = await getOrganizationId();
    const body = await req.json();
    const { id, isRead, isDismissed } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Verify ownership
    const insight = await prisma.insight.findFirst({
      where: { id, organizationId: ORG_ID },
    });
    if (!insight) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: any = {};
    if (typeof isRead === "boolean") data.isRead = isRead;
    if (typeof isDismissed === "boolean") data.isDismissed = isDismissed;

    const updated = await prisma.insight.update({
      where: { id },
      data,
    });

    return NextResponse.json({ ok: true, insight: updated });
  } catch (error: any) {
    console.error("[alertas] PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
