// ══════════════════════════════════════════════════════════════
// ML Cron Sync — Scheduled backup sync + missed feeds recovery
// ══════════════════════════════════════════════════════════════
// This endpoint runs periodically (via Vercel Cron or external cron)
// to catch anything the webhook might have missed.
//
// It does two things:
//   1. Checks /missed_feeds for lost notifications and processes them
//   2. Syncs reputation metrics (snapshot once per run)
//
// The webhook handles real-time updates for orders, items, questions.
// This cron is the safety net.
//
// SAFETY: READ-ONLY from ML API. Only writes to our DB.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSellerToken, fetchSellerReputation } from "@/lib/connectors/mercadolibre-seller";
import { processMLNotification } from "@/lib/connectors/ml-notification-processor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ML_API = "https://api.mercadolibre.com";
const ML_APP_ID = process.env.ML_APP_ID || "5750438437863167";

export async function GET(req: NextRequest) {
  // Optional: Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const log: string[] = [];

  try {
    const { token, mlUserId } = await getSellerToken();
    const connection = await prisma.connection.findFirst({
      where: { platform: "MERCADOLIBRE" as any },
    });
    if (!connection) {
      return NextResponse.json({ error: "No ML connection" }, { status: 404 });
    }
    const orgId = connection.organizationId;

    // ── 1. Process missed feeds ──────────────────────────────
    const missedTopics = ["orders_v2", "items", "questions"];
    let totalMissed = 0;

    for (const topic of missedTopics) {
      try {
        const res = await fetch(
          `${ML_API}/missed_feeds?app_id=${ML_APP_ID}&topic=${topic}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const missed = data.results || [];
          for (const notification of missed) {
            await processMLNotification(notification);
            totalMissed++;
          }
          if (missed.length > 0) {
            log.push(`Recovered ${missed.length} missed ${topic} notifications`);
          }
        }
      } catch (err: any) {
        log.push(`Missed feeds ${topic}: ${err.message}`);
      }
    }

    if (totalMissed === 0) {
      log.push("No missed notifications found");
    }

    // ── 2. Sync reputation snapshot ──────────────────────────
    try {
      const rep = await fetchSellerReputation(token, mlUserId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.mlSellerMetricDaily.upsert({
        where: {
          organizationId_date: { organizationId: orgId, date: today },
        },
        update: {
          reputationLevel: rep.level,
          reputationPower: rep.powerSeller,
          totalSales: rep.transactions.total,
          completedSales: rep.transactions.completed,
          cancelledSales: rep.transactions.canceled,
          claimsRate: rep.metrics.claims.rate,
          delayedHandlingRate: rep.metrics.delayed.rate,
          cancellationRate: rep.metrics.cancellations.rate,
          positiveRatings: rep.ratings.positive,
          negativeRatings: rep.ratings.negative,
          neutralRatings: rep.ratings.neutral,
        },
        create: {
          organizationId: orgId,
          date: today,
          reputationLevel: rep.level,
          reputationPower: rep.powerSeller,
          totalSales: rep.transactions.total,
          completedSales: rep.transactions.completed,
          cancelledSales: rep.transactions.canceled,
          claimsRate: rep.metrics.claims.rate,
          delayedHandlingRate: rep.metrics.delayed.rate,
          cancellationRate: rep.metrics.cancellations.rate,
          positiveRatings: rep.ratings.positive,
          negativeRatings: rep.ratings.negative,
          neutralRatings: rep.ratings.neutral,
        },
      });
      log.push(`Reputation synced: ${rep.level}`);
    } catch (err: any) {
      log.push(`Reputation error: ${err.message}`);
    }

    // ── Update connection ─────────────────────────────────────
    await prisma.connection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date() },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return NextResponse.json({ ok: true, elapsed: `${elapsed}s`, log });
  } catch (err: any) {
    console.error("[ML Cron] Fatal:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
