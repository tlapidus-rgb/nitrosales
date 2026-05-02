export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Settings: Attribution API
// ══════════════════════════════════════════════════════════════
// GET  /api/settings/attribution → Nitro weights + attribution windows
// PUT  /api/settings/attribution → save Nitro weights and/or attribution windows
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

const DEFAULT_WEIGHTS = { first: 30, last: 40, middle: 30 };
const DEFAULT_WINDOW = 30;
const DEFAULT_MODEL = "NITRO";
const VALID_GLOBAL_WINDOWS = [7, 14, 30, 60];
const VALID_MODELS = ["LAST_CLICK", "FIRST_CLICK", "LINEAR", "NITRO"];
const MIN_CHANNEL_WINDOW = 1;
const MAX_CHANNEL_WINDOW = 90;
const VALID_CHANNELS = [
  "meta", "google", "instagram", "tiktok", "direct",
  "email", "whatsapp", "referral", "facebook", "youtube",
  "linkedin", "twitter", "bing", "organic",
];

export async function GET() {
  try {
    const orgId = await getOrganizationId();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const settings = (org?.settings as Record<string, any>) || {};
    const weights = settings.nitroWeights || DEFAULT_WEIGHTS;
    const attributionWindowDays = VALID_GLOBAL_WINDOWS.includes(settings.attributionWindowDays)
      ? settings.attributionWindowDays
      : DEFAULT_WINDOW;
    const channelWindows = settings.channelWindows || {};
    const attributionModel = VALID_MODELS.includes(settings.attributionModel)
      ? settings.attributionModel
      : DEFAULT_MODEL;

    return NextResponse.json({ weights, attributionWindowDays, channelWindows, attributionModel });
  } catch (error) {
    console.error("[Settings:Attribution] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch attribution settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const body = await request.json();

    // Read current settings
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const currentSettings = (org?.settings as Record<string, any>) || {};
    const newSettings = { ...currentSettings };

    // ── Handle Nitro Weights (optional) ──
    if (body.first !== undefined || body.last !== undefined || body.middle !== undefined) {
      const { first, last, middle } = body;
      if (
        typeof first !== "number" ||
        typeof last !== "number" ||
        typeof middle !== "number"
      ) {
        return NextResponse.json(
          { error: "first, last, middle must be numbers" },
          { status: 400 }
        );
      }
      if (first < 0 || last < 0 || middle < 0 || first > 100 || last > 100 || middle > 100) {
        return NextResponse.json(
          { error: "Weights must be between 0 and 100" },
          { status: 400 }
        );
      }
      const sum = first + last + middle;
      if (sum !== 100) {
        return NextResponse.json(
          { error: `Weights must sum to 100 (got ${sum})` },
          { status: 400 }
        );
      }
      newSettings.nitroWeights = { first, last, middle };
    }

    // ── Handle Attribution Window (optional) ──
    if (body.attributionWindowDays !== undefined) {
      const w = body.attributionWindowDays;
      if (typeof w !== "number" || !VALID_GLOBAL_WINDOWS.includes(w)) {
        return NextResponse.json(
          { error: `attributionWindowDays must be one of: ${VALID_GLOBAL_WINDOWS.join(", ")}` },
          { status: 400 }
        );
      }
      newSettings.attributionWindowDays = w;
    }

    // ── Handle Attribution Model (optional) ──
    if (body.attributionModel !== undefined) {
      const m = body.attributionModel;
      if (typeof m !== "string" || !VALID_MODELS.includes(m)) {
        return NextResponse.json(
          { error: `attributionModel must be one of: ${VALID_MODELS.join(", ")}` },
          { status: 400 }
        );
      }
      newSettings.attributionModel = m;
    }

    // ── Handle Channel Windows (optional) ──
    if (body.channelWindows !== undefined) {
      const cw = body.channelWindows;
      if (typeof cw !== "object" || cw === null || Array.isArray(cw)) {
        return NextResponse.json(
          { error: "channelWindows must be an object" },
          { status: 400 }
        );
      }
      // Validate each channel override
      const cleanWindows: Record<string, number> = {};
      for (const [channel, days] of Object.entries(cw)) {
        if (!VALID_CHANNELS.includes(channel)) {
          return NextResponse.json(
            { error: `Invalid channel: ${channel}. Valid: ${VALID_CHANNELS.join(", ")}` },
            { status: 400 }
          );
        }
        if (days === null) {
          // null means "remove override, use global" — skip it
          continue;
        }
        if (typeof days !== "number" || days < MIN_CHANNEL_WINDOW || days > MAX_CHANNEL_WINDOW || !Number.isInteger(days)) {
          return NextResponse.json(
            { error: `Channel window for ${channel} must be an integer between ${MIN_CHANNEL_WINDOW} and ${MAX_CHANNEL_WINDOW}` },
            { status: 400 }
          );
        }
        cleanWindows[channel] = days;
      }
      newSettings.channelWindows = cleanWindows;
    }

    await prisma.organization.update({
      where: { id: orgId },
      data: { settings: newSettings },
    });

    return NextResponse.json({
      ok: true,
      weights: newSettings.nitroWeights || DEFAULT_WEIGHTS,
      attributionWindowDays: newSettings.attributionWindowDays || DEFAULT_WINDOW,
      channelWindows: newSettings.channelWindows || {},
      attributionModel: newSettings.attributionModel || DEFAULT_MODEL,
    });
  } catch (error) {
    console.error("[Settings:Attribution] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to save attribution settings" },
      { status: 500 }
    );
  }
}
