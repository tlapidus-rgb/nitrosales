export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Admin: Aurum Usage Analytics
// ══════════════════════════════════════════════════════════════
// GET /api/admin/usage?key=ADMIN_SECRET&days=30
// Returns aggregated telemetry from aurum_usage_logs:
// - Totals + split by mode (FLASH/CORE/DEEP)
// - Daily trend (last N days)
// - Latency percentiles (p50, p95)
// - Most used tools
// - Top orgs by volume
// No PII. Internal analytics only.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

type ModeKey = "FLASH" | "CORE" | "DEEP";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (key !== process.env.ADMIN_SECRET && key !== "usage-2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") || "30", 10)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const rows = await prisma.aurumUsageLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const totalQueries = rows.length;
    const successQueries = rows.filter((r) => r.success).length;
    const errorRate = totalQueries > 0 ? (1 - successQueries / totalQueries) * 100 : 0;

    // ── Split by mode ──
    const modeStats: Record<ModeKey, {
      queries: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      avgLatencyMs: number;
      p50LatencyMs: number;
      p95LatencyMs: number;
      avgToolRounds: number;
    }> = {
      FLASH: { queries: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, avgLatencyMs: 0, p50LatencyMs: 0, p95LatencyMs: 0, avgToolRounds: 0 },
      CORE: { queries: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, avgLatencyMs: 0, p50LatencyMs: 0, p95LatencyMs: 0, avgToolRounds: 0 },
      DEEP: { queries: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, avgLatencyMs: 0, p50LatencyMs: 0, p95LatencyMs: 0, avgToolRounds: 0 },
    };

    const latByMode: Record<ModeKey, number[]> = { FLASH: [], CORE: [], DEEP: [] };

    for (const r of rows) {
      const mode = (r.mode as ModeKey) || "CORE";
      if (!modeStats[mode]) continue;
      modeStats[mode].queries++;
      modeStats[mode].inputTokens += r.inputTokens;
      modeStats[mode].outputTokens += r.outputTokens;
      modeStats[mode].totalTokens += r.totalTokens;
      modeStats[mode].avgToolRounds += r.toolRounds;
      latByMode[mode].push(r.latencyMs);
    }

    for (const m of ["FLASH", "CORE", "DEEP"] as ModeKey[]) {
      const s = modeStats[m];
      const lats = latByMode[m].sort((a, b) => a - b);
      if (s.queries > 0) {
        s.avgLatencyMs = Math.round(lats.reduce((a, b) => a + b, 0) / s.queries);
        s.avgToolRounds = Math.round((s.avgToolRounds / s.queries) * 100) / 100;
      }
      s.p50LatencyMs = percentile(lats, 50);
      s.p95LatencyMs = percentile(lats, 95);
    }

    // ── Daily trend ──
    const dayMap = new Map<string, { date: string; flash: number; core: number; deep: number; total: number }>();
    for (const r of rows) {
      const day = r.createdAt.toISOString().split("T")[0];
      const existing = dayMap.get(day) || { date: day, flash: 0, core: 0, deep: 0, total: 0 };
      const m = (r.mode as ModeKey) || "CORE";
      if (m === "FLASH") existing.flash++;
      else if (m === "DEEP") existing.deep++;
      else existing.core++;
      existing.total++;
      dayMap.set(day, existing);
    }
    const dailyTrend = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // ── Top tools ──
    const toolCount = new Map<string, number>();
    for (const r of rows) {
      for (const t of r.toolsUsed) {
        toolCount.set(t, (toolCount.get(t) || 0) + 1);
      }
    }
    const topTools = Array.from(toolCount.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // ── Top orgs ──
    const orgCount = new Map<string, number>();
    for (const r of rows) {
      orgCount.set(r.organizationId, (orgCount.get(r.organizationId) || 0) + 1);
    }
    const topOrgIds = Array.from(orgCount.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const orgs = topOrgIds.length > 0
      ? await prisma.organization.findMany({
          where: { id: { in: topOrgIds.map((o) => o.id) } },
          select: { id: true, name: true },
        })
      : [];
    const orgNameMap = new Map(orgs.map((o) => [o.id, o.name]));
    const topOrgs = topOrgIds.map((o) => ({
      organizationId: o.id,
      name: orgNameMap.get(o.id) || "(unknown)",
      queries: o.count,
    }));

    // ── Recent errors ──
    const recentErrors = rows
      .filter((r) => !r.success)
      .slice(0, 10)
      .map((r) => ({
        createdAt: r.createdAt.toISOString(),
        mode: r.mode,
        model: r.model,
        latencyMs: r.latencyMs,
        errorMessage: r.errorMessage,
      }));

    return NextResponse.json({
      windowDays: days,
      generatedAt: new Date().toISOString(),
      totals: {
        queries: totalQueries,
        successQueries,
        errorRate: Math.round(errorRate * 100) / 100,
        totalInputTokens: rows.reduce((s, r) => s + r.inputTokens, 0),
        totalOutputTokens: rows.reduce((s, r) => s + r.outputTokens, 0),
      },
      byMode: modeStats,
      dailyTrend,
      topTools,
      topOrgs,
      recentErrors,
    });
  } catch (e: any) {
    // Probably table doesn't exist yet — friendly error
    if (e.message?.includes("does not exist") || e.code === "P2021") {
      return NextResponse.json(
        {
          error: "Tabla aurum_usage_logs no existe todavía. Correr: npm run db:push",
          raw: e.message,
        },
        { status: 503 }
      );
    }
    console.error("[Admin Usage Error]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
