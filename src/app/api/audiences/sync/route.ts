// ══════════════════════════════════════════════════════════════
// API: /api/audiences/sync
// ══════════════════════════════════════════════════════════════
// POST — Ejecutar sync de una audiencia a Meta/Google
// Recibe: { audienceId: string }

import { NextRequest, NextResponse } from "next/server";
import { getOrganizationId } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { getMatchingCustomers } from "@/lib/audiences/segment-engine";
import { syncToMeta } from "@/lib/audiences/send-meta";
import { syncToGoogle } from "@/lib/audiences/send-google";
import type { SegmentCriteria, SyncResult } from "@/lib/audiences/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60; // Vercel Pro: hasta 60s para syncs grandes

export async function POST(request: NextRequest) {
  const ORG_ID = await getOrganizationId();
  const body = await request.json();
  const { audienceId } = body;

  if (!audienceId) {
    return NextResponse.json({ error: "audienceId is required" }, { status: 400 });
  }

  // Fetch audience
  const audience = await prisma.audience.findFirst({
    where: { id: audienceId, organizationId: ORG_ID },
  });

  if (!audience) {
    return NextResponse.json({ error: "Audience not found" }, { status: 404 });
  }

  // Mark as syncing
  await prisma.audience.update({
    where: { id: audienceId },
    data: { status: "SYNCING" },
  });

  const criteria = (audience.segmentCriteria || {}) as SegmentCriteria;
  const results: SyncResult[] = [];

  try {
    // Get matching customers
    const customers = await getMatchingCustomers(ORG_ID, criteria);

    // Update customer count
    await prisma.audience.update({
      where: { id: audienceId },
      data: { customerCount: customers.length },
    });

    // ─── Sync to Meta ───
    if (audience.platform === "META" || audience.platform === "BOTH") {
      const metaResult = await syncToMeta(
        ORG_ID,
        audienceId,
        audience.metaAudienceId,
        audience.name,
        customers
      );
      results.push(metaResult);

      // Log the sync
      await prisma.audienceSyncLog.create({
        data: {
          audienceId,
          action: "FULL_SYNC",
          platform: "META",
          status: metaResult.success ? "SUCCESS" : metaResult.skipped ? "PARTIAL" : "ERROR",
          customersTotal: customers.length,
          customersSent: metaResult.customersSent,
          matchRate: metaResult.matchRate || null,
          errorMessage: metaResult.reason || null,
          durationMs: metaResult.durationMs,
          metadata: {
            batchCount: metaResult.batchCount,
            externalId: metaResult.externalAudienceId,
            errors: metaResult.errors,
          } as any,
        },
      });
    }

    // ─── Sync to Google ───
    if (audience.platform === "GOOGLE" || audience.platform === "BOTH") {
      const googleResult = await syncToGoogle(
        ORG_ID,
        audienceId,
        audience.googleListId,
        audience.name,
        customers
      );
      results.push(googleResult);

      // Log the sync
      await prisma.audienceSyncLog.create({
        data: {
          audienceId,
          action: "FULL_SYNC",
          platform: "GOOGLE",
          status: googleResult.success ? "SUCCESS" : googleResult.skipped ? "PARTIAL" : "ERROR",
          customersTotal: customers.length,
          customersSent: googleResult.customersSent,
          matchRate: googleResult.matchRate || null,
          errorMessage: googleResult.reason || null,
          durationMs: googleResult.durationMs,
          metadata: {
            externalId: googleResult.externalAudienceId,
            errors: googleResult.errors,
          } as any,
        },
      });
    }

    // ─── Update audience status ───
    const allSuccess = results.every((r) => r.success || r.skipped);
    const anySuccess = results.some((r) => r.success);
    const totalSent = results.reduce((sum, r) => sum + r.customersSent, 0);
    const errors = results.filter((r) => !r.success && !r.skipped).map((r) => r.reason).filter(Boolean);

    await prisma.audience.update({
      where: { id: audienceId },
      data: {
        status: allSuccess ? "ACTIVE" : anySuccess ? "ACTIVE" : "ERROR",
        lastSyncAt: new Date(),
        lastSyncedCount: totalSent,
        lastSyncError: errors.length > 0 ? errors.join("; ") : null,
        // Calculate next sync
        nextSyncAt: audience.autoSync ? calculateNextSync(audience.syncFrequency) : null,
        // Update match rates from results
        ...(results.find((r) => r.platform === "META")?.matchRate !== undefined && {
          metaMatchRate: results.find((r) => r.platform === "META")!.matchRate,
        }),
        ...(results.find((r) => r.platform === "GOOGLE")?.matchRate !== undefined && {
          googleMatchRate: results.find((r) => r.platform === "GOOGLE")!.matchRate,
        }),
      },
    });

    return NextResponse.json({
      success: anySuccess,
      results: results.map((r) => ({
        platform: r.platform,
        success: r.success,
        skipped: r.skipped,
        reason: r.reason,
        customersSent: r.customersSent,
        durationMs: r.durationMs,
      })),
      totalCustomers: customers.length,
      totalSent,
    });
  } catch (err: any) {
    // Revert status on unexpected error
    await prisma.audience.update({
      where: { id: audienceId },
      data: {
        status: "ERROR",
        lastSyncError: `Unexpected: ${err.message}`,
      },
    });

    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// ─── Calculate next sync time ───

function calculateNextSync(frequency: string): Date {
  const now = new Date();
  switch (frequency) {
    case "HOURLY":
      return new Date(now.getTime() + 60 * 60 * 1000);
    case "DAILY":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "WEEKLY":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}
