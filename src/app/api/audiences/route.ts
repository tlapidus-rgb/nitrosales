export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// API: /api/audiences
// ══════════════════════════════════════════════════════════════
// GET  — Listar todas las audiencias de la org
// POST — Crear nueva audiencia (o preview sin guardar)

import { NextRequest, NextResponse } from "next/server";
import { getOrganizationId } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { previewAudience } from "@/lib/audiences/segment-engine";
import type { SegmentCriteria } from "@/lib/audiences/types";

export const revalidate = 0;

// ─── GET: Listar audiencias ───

export async function GET() {
  const ORG_ID = await getOrganizationId();

  const audiences = await prisma.audience.findMany({
    where: { organizationId: ORG_ID },
    orderBy: { updatedAt: "desc" },
    include: {
      syncLogs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          action: true,
          platform: true,
          status: true,
          customersSent: true,
          matchRate: true,
          createdAt: true,
        },
      },
    },
  });

  // Summary stats
  const totalAudiences = audiences.length;
  const activeAudiences = audiences.filter((a) => a.status === "ACTIVE").length;
  const totalCustomersSynced = audiences.reduce((sum, a) => sum + a.lastSyncedCount, 0);
  const platformBreakdown = {
    meta: audiences.filter((a) => a.platform === "META" || a.platform === "BOTH").length,
    google: audiences.filter((a) => a.platform === "GOOGLE" || a.platform === "BOTH").length,
  };

  return NextResponse.json({
    audiences: audiences.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      platform: a.platform,
      status: a.status,
      segmentType: a.segmentType,
      segmentCriteria: a.segmentCriteria,
      customerCount: a.customerCount,
      lastSyncedCount: a.lastSyncedCount,
      metaAudienceId: a.metaAudienceId,
      googleListId: a.googleListId,
      metaMatchRate: a.metaMatchRate,
      googleMatchRate: a.googleMatchRate,
      autoSync: a.autoSync,
      syncFrequency: a.syncFrequency,
      lastSyncAt: a.lastSyncAt,
      lastSyncError: a.lastSyncError,
      nextSyncAt: a.nextSyncAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      lastSync: a.syncLogs[0] || null,
    })),
    summary: {
      totalAudiences,
      activeAudiences,
      totalCustomersSynced,
      platformBreakdown,
      syncEnabled: process.env.AUDIENCE_SYNC_ENABLED === "true",
    },
  });
}

// ─── POST: Crear audiencia o preview ───

export async function POST(request: NextRequest) {
  const ORG_ID = await getOrganizationId();
  const body = await request.json();

  const {
    action,       // "create" | "preview"
    name,
    description,
    platform,     // "META" | "GOOGLE" | "BOTH"
    segmentType,  // "RFM" | "LTV" | "CUSTOM" | "ALL_CUSTOMERS"
    segmentCriteria,
    autoSync,
    syncFrequency,
  } = body;

  // Validate segment criteria
  const criteria: SegmentCriteria = segmentCriteria || {};

  // ─── Preview mode: just return stats ───
  if (action === "preview") {
    const preview = await previewAudience(ORG_ID, criteria);
    return NextResponse.json({ preview });
  }

  // ─── Create mode ───
  if (!name || !platform || !segmentType) {
    return NextResponse.json(
      { error: "name, platform, and segmentType are required" },
      { status: 400 }
    );
  }

  // Validate platform
  if (!["META", "GOOGLE", "BOTH"].includes(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  // Get initial customer count
  const preview = await previewAudience(ORG_ID, criteria);

  const audience = await prisma.audience.create({
    data: {
      name,
      description: description || null,
      platform,
      status: "DRAFT",
      segmentType,
      segmentCriteria: criteria as any,
      customerCount: preview.totalCustomers,
      autoSync: autoSync || false,
      syncFrequency: syncFrequency || "DAILY",
      organizationId: ORG_ID,
    },
  });

  return NextResponse.json({
    audience: {
      id: audience.id,
      name: audience.name,
      platform: audience.platform,
      status: audience.status,
      customerCount: audience.customerCount,
    },
    preview,
  });
}

// ─── PUT: Actualizar audiencia ───

export async function PUT(request: NextRequest) {
  const ORG_ID = await getOrganizationId();
  const body = await request.json();

  const { id, name, description, platform, segmentType, segmentCriteria, autoSync, syncFrequency, status } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Verify ownership
  const existing = await prisma.audience.findFirst({
    where: { id, organizationId: ORG_ID },
  });

  if (!existing) {
    return NextResponse.json({ error: "Audience not found" }, { status: 404 });
  }

  // Build update data
  const updateData: Record<string, any> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (platform !== undefined) updateData.platform = platform;
  if (segmentType !== undefined) updateData.segmentType = segmentType;
  if (segmentCriteria !== undefined) updateData.segmentCriteria = segmentCriteria;
  if (autoSync !== undefined) updateData.autoSync = autoSync;
  if (syncFrequency !== undefined) updateData.syncFrequency = syncFrequency;
  if (status !== undefined) updateData.status = status;

  // Recalculate customer count if criteria changed
  if (segmentCriteria !== undefined) {
    const preview = await previewAudience(ORG_ID, segmentCriteria);
    updateData.customerCount = preview.totalCustomers;
  }

  const updated = await prisma.audience.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ audience: updated });
}

// ─── DELETE: Eliminar audiencia ───

export async function DELETE(request: NextRequest) {
  const ORG_ID = await getOrganizationId();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Verify ownership
  const existing = await prisma.audience.findFirst({
    where: { id, organizationId: ORG_ID },
  });

  if (!existing) {
    return NextResponse.json({ error: "Audience not found" }, { status: 404 });
  }

  // Delete audience and its logs (cascade)
  await prisma.audience.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
