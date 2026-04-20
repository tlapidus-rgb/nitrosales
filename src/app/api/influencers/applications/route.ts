export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Influencer Applications API (AUTHENTICATED)
// ══════════════════════════════════════════════════════════════
// GET  — List applications for the organization
// PUT  — Approve or reject an application
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";
import { sendEmail } from "@/lib/email/send";
import { welcomeInfluencerEmail } from "@/lib/email/templates";
import { createHash, randomBytes } from "crypto";
import { getStoreUrl } from "@/lib/org-store-url";

function generatePassword(): string {
  // 6 char alphanumeric, easy to type
  return randomBytes(4).toString("base64url").substring(0, 6).toLowerCase();
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    if (!org) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const status = url.searchParams.get("status"); // PENDING, APPROVED, REJECTED

    const applications = await prisma.influencerApplication.findMany({
      where: {
        organizationId: org.id,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    const appUrl = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";
    const applyUrl = `${appUrl}/i/${org.slug}/apply`;

    return NextResponse.json({ applications, applyUrl });
  } catch (error: any) {
    console.error("[Applications API] GET error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    if (!org) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { id, action, notes, commissionPercent } = body;

    if (!id || !action || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "id and action (approve/reject) required" }, { status: 400 });
    }

    const application = await prisma.influencerApplication.findFirst({
      where: { id, organizationId: org.id },
    });
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    if (action === "reject") {
      await prisma.influencerApplication.update({
        where: { id },
        data: { status: "REJECTED", reviewedAt: new Date(), notes: notes || null },
      });
      return NextResponse.json({ ok: true, status: "REJECTED" });
    }

    // ── APPROVE: Create influencer + send welcome email ──
    const commission = commissionPercent || 10; // Default 10%
    // Generate code from name (lowercase, no spaces, first word + random)
    const nameSlug = application.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .substring(0, 10);
    const code = `${nameSlug}${Math.floor(Math.random() * 900) + 100}`;

    // Check code uniqueness
    const existingCode = await prisma.influencer.findUnique({
      where: { organizationId_code: { organizationId: org.id, code } },
    });
    const finalCode = existingCode ? `${code}${Math.floor(Math.random() * 90) + 10}` : code;

    // Generate dashboard password
    const plainPassword = generatePassword();
    const hashedPassword = hashPassword(plainPassword);

    // Create influencer
    const influencer = await prisma.influencer.create({
      data: {
        name: application.name,
        email: application.email,
        code: finalCode,
        commissionPercent: commission,
        status: "ACTIVE",
        isPublicDashboardEnabled: true,
        dashboardPassword: hashedPassword,
        organizationId: org.id,
      },
    });

    // Update application status
    await prisma.influencerApplication.update({
      where: { id },
      data: { status: "APPROVED", reviewedAt: new Date(), notes: notes || null },
    });

    // Build tracking link and dashboard link (multi-tenant storeUrl)
    const storeUrl = await getStoreUrl(org.id);
    const appUrl = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";
    const trackingLink = storeUrl ? `${storeUrl.replace(/\/$/, "")}/?utm_source=inf_${finalCode}&utm_medium=influencer` : `${appUrl}/?utm_source=inf_${finalCode}&utm_medium=influencer`;
    const dashboardLink = `${appUrl}/i/${org.slug}/${finalCode}`;

    // Send welcome email (async)
    if (application.email) {
      const { subject, html } = welcomeInfluencerEmail(
        application.name,
        org.name,
        trackingLink,
        dashboardLink,
        commission,
        [], // No coupons yet
        plainPassword
      );
      sendEmail({ to: application.email, subject, html }).catch((err) =>
        console.error("[Applications] Welcome email error:", err)
      );
    }

    return NextResponse.json({
      ok: true,
      status: "APPROVED",
      influencer: {
        id: influencer.id,
        code: finalCode,
        name: influencer.name,
      },
    });
  } catch (error: any) {
    console.error("[Applications API] PUT error:", error?.message, error?.stack);
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}
