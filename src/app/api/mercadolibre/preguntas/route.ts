// ══════════════════════════════════════════════════════════════
// ML Preguntas API — Reads from OUR DB only (never touches ML)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const connection = await prisma.connection.findFirst({
      where: { platform: "MERCADOLIBRE" as any, organizationId: orgId },
    });
    if (!connection) {
      return NextResponse.json({ error: "No ML connection for this org" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = 50;

    // KPIs
    const [totalCount, unansweredCount, answeredCount] = await Promise.all([
      prisma.mlQuestion.count({ where: { organizationId: orgId } }),
      prisma.mlQuestion.count({ where: { organizationId: orgId, status: "UNANSWERED" } }),
      prisma.mlQuestion.count({ where: { organizationId: orgId, status: "ANSWERED" } }),
    ]);

    // Average response time for answered questions
    const answeredQuestions = await prisma.mlQuestion.findMany({
      where: {
        organizationId: orgId,
        status: "ANSWERED",
        answerDate: { not: null },
      },
      select: { dateCreated: true, answerDate: true },
      orderBy: { dateCreated: "desc" },
    });

    let avgResponseMinutes = 0;
    if (answeredQuestions.length > 0) {
      const totalMinutes = answeredQuestions.reduce((sum, q) => {
        if (q.answerDate) {
          const diff = new Date(q.answerDate).getTime() - new Date(q.dateCreated).getTime();
          return sum + diff / (1000 * 60);
        }
        return sum;
      }, 0);
      avgResponseMinutes = totalMinutes / answeredQuestions.length;
    }

    // Questions by item (top items with most questions)
    const questionsByItem = await prisma.mlQuestion.groupBy({
      by: ["mlItemId"],
      where: { organizationId: orgId },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });

    // Get item titles for top items
    const topItemIds = questionsByItem.map((q) => q.mlItemId);
    const itemTitles = await prisma.mlListing.findMany({
      where: { organizationId: orgId, mlItemId: { in: topItemIds } },
      select: { mlItemId: true, title: true, thumbnailUrl: true },
    });
    const titleMap = new Map(itemTitles.map((i) => [i.mlItemId, { title: i.title, thumbnail: i.thumbnailUrl }]));

    // Build where clause for paginated list
    const where: any = { organizationId: orgId };
    if (status !== "all") where.status = status;
    if (search) {
      where.OR = [
        { text: { contains: search, mode: "insensitive" } },
        { mlItemId: { contains: search, mode: "insensitive" } },
        { answerText: { contains: search, mode: "insensitive" } },
      ];
    }

    const filteredCount = await prisma.mlQuestion.count({ where });
    const questions = await prisma.mlQuestion.findMany({
      where,
      orderBy: { dateCreated: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // Enrich questions with item info
    const questionItemIds = [...new Set(questions.map((q) => q.mlItemId))];
    const questionItems = await prisma.mlListing.findMany({
      where: { organizationId: orgId, mlItemId: { in: questionItemIds } },
      select: { mlItemId: true, title: true, thumbnailUrl: true, permalink: true },
    });
    const qItemMap = new Map(questionItems.map((i) => [i.mlItemId, i]));

    return NextResponse.json({
      kpis: {
        total: totalCount,
        unanswered: unansweredCount,
        answered: answeredCount,
        responseRate: totalCount > 0 ? ((answeredCount / totalCount) * 100).toFixed(1) : "0",
        avgResponseMinutes: Math.round(avgResponseMinutes),
        avgResponseHours: (avgResponseMinutes / 60).toFixed(1),
      },
      questionsByItem: questionsByItem.map((q) => ({
        mlItemId: q.mlItemId,
        count: q._count.id,
        title: titleMap.get(q.mlItemId)?.title || q.mlItemId,
        thumbnail: titleMap.get(q.mlItemId)?.thumbnail || null,
      })),
      questions: questions.map((q) => {
        const item = qItemMap.get(q.mlItemId);
        return {
          id: q.id,
          mlQuestionId: q.mlQuestionId,
          text: q.text,
          status: q.status,
          dateCreated: q.dateCreated,
          answerText: q.answerText,
          answerDate: q.answerDate,
          mlItemId: q.mlItemId,
          itemTitle: item?.title || q.mlItemId,
          itemThumbnail: item?.thumbnailUrl || null,
          itemPermalink: item?.permalink || null,
          fromBuyerId: q.fromBuyerId ? String(q.fromBuyerId) : null,
        };
      }),
      pagination: {
        page,
        pageSize,
        totalCount: filteredCount,
        totalPages: Math.ceil(filteredCount / pageSize),
      },
    });
  } catch (err: any) {
    console.error("[ML Preguntas API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
