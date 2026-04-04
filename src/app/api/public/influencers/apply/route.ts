// ══════════════════════════════════════════════════════════════
// Public Influencer Application API (NO AUTH)
// ══════════════════════════════════════════════════════════════
// POST — Receives influencer applications from the public form
// URL: /api/public/influencers/apply
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/send";
import { applicationConfirmationEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

// Rate limiter: 1 application per minute per IP
const rateLimitMap = new Map<string, number>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const last = rateLimitMap.get(ip);
  if (last && now - last < 60000) return true;
  rateLimitMap.set(ip, now);
  if (rateLimitMap.size > 500) {
    const cutoff = now - 120000;
    for (const [key, time] of rateLimitMap) {
      if (time < cutoff) rateLimitMap.delete(key);
    }
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Demasiados intentos. Esperá un minuto." }, { status: 429 });
    }

    const body = await req.json();
    const { slug, name, email, instagram, tiktok, youtube, followers, message } = body;

    // Validation
    if (!slug || !name || !email) {
      return NextResponse.json({ error: "Nombre, email y organizacion son requeridos" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email invalido" }, { status: 400 });
    }

    // Find organization
    const org = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Organizacion no encontrada" }, { status: 404 });
    }

    // Check for duplicate application (same email + org, still pending)
    const existing = await prisma.influencerApplication.findFirst({
      where: {
        organizationId: org.id,
        email: email.toLowerCase().trim(),
        status: "PENDING",
      },
    });
    if (existing) {
      return NextResponse.json({ error: "Ya tenés una aplicación pendiente" }, { status: 409 });
    }

    // Create application
    const application = await prisma.influencerApplication.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        instagram: instagram?.trim() || null,
        tiktok: tiktok?.trim() || null,
        youtube: youtube?.trim() || null,
        followers: followers || null,
        message: message?.trim() || null,
        organizationId: org.id,
      },
    });

    // Send confirmation email (async, don't block response)
    const { subject, html } = applicationConfirmationEmail(name.trim(), org.name);
    sendEmail({ to: email.toLowerCase().trim(), subject, html }).catch((err) =>
      console.error("[Apply] Email error:", err)
    );

    return NextResponse.json({ ok: true, id: application.id });
  } catch (error: any) {
    console.error("[Public Apply API]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
