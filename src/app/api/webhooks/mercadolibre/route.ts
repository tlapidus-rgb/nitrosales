// ══════════════════════════════════════════════════════════════
// MercadoLibre Webhook — Real-time notifications receiver
// ══════════════════════════════════════════════════════════════
// ML sends POST requests when events happen on seller account:
//   - orders_v2: new sale, status change
//   - items: listing changed (price, stock, status)
//   - questions: new question or answer
//   - payments: payment status changed
//   - shipments: shipment status changed
//
// CRITICAL: Must respond 200 within 500ms or ML deactivates us.
// We acknowledge immediately, then process async via queue.
//
// SAFETY: All operations READ from ML API, WRITE to our own DB.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db/client";
import { processMLNotification } from "@/lib/connectors/ml-notification-processor";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Ensure enough time for ML API fetch + DB writes

// ML Notification IPs (for future IP filtering)
// 54.88.218.97, 18.215.140.160, 18.213.114.129, 18.206.34.84

interface MLNotification {
  _id: string;
  resource: string;    // e.g. "/orders/1234567890" or "/items/MLA123456"
  user_id: number;
  topic: string;       // orders_v2, items, questions, payments, shipments
  application_id: number;
  attempts: number;
  sent: string;
  received: string;
}

export async function POST(req: NextRequest) {
  // ── Step 1: Respond 200 IMMEDIATELY (ML requires <500ms) ──
  // We parse the body and kick off async processing
  let notification: MLNotification;

  try {
    notification = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Validate basic structure
  if (!notification.topic || !notification.resource) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Log for debugging (remove in production later)
  console.log(`[ML Webhook] topic=${notification.topic} resource=${notification.resource} attempts=${notification.attempts}`);

  // ── Step 2: Queue async processing via waitUntil ──
  // waitUntil keeps the Vercel function alive AFTER responding 200
  // so processMLNotification completes reliably (including item creation)
  waitUntil(
    processMLNotification(notification).catch((err) => {
      console.error(`[ML Webhook] Error processing ${notification.topic}:`, err.message);
    })
  );

  // ── Step 3: Return 200 immediately ──
  return NextResponse.json({ ok: true });
}

// Also handle GET for ML webhook verification (some setups send GET to verify URL)
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: "active",
    topics: ["orders_v2", "items", "questions", "payments", "shipments"],
    app: "NitroSales",
  });
}
