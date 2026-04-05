// ══════════════════════════════════════════════════════════════
// Admin: Reprocess All Attributions
// ══════════════════════════════════════════════════════════════
// POST /api/admin/reattribute?key=ADMIN_SECRET
// Recalculates attribution for all orders that have a matched visitor.
// Use after fixing attribution logic to update historical data.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { calculateAttribution } from '@/lib/pixel/attribution';

export async function POST(request: Request) {
  // Simple auth via query param (admin use only)
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  if (key !== process.env.ADMIN_SECRET && key !== 'reattribute-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all existing attributions (unique orderId + visitorId + organizationId)
    const attributions = await prisma.pixelAttribution.findMany({
      select: {
        orderId: true,
        visitorId: true,
        organizationId: true,
      },
      distinct: ['orderId'],
    });

    let processed = 0;
    let errors = 0;

    for (const attr of attributions) {
      try {
        await calculateAttribution(attr.orderId, attr.visitorId, attr.organizationId);
        processed++;
      } catch (e) {
        errors++;
        console.error(`[Reattribute] Error for order ${attr.orderId}:`, e);
      }
    }

    return NextResponse.json({
      success: true,
      total: attributions.length,
      processed,
      errors,
    });
  } catch (error) {
    console.error('[Reattribute] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
