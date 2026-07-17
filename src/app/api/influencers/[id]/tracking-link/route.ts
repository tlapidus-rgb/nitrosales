export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Influencer Tracking Link Generator
// ══════════════════════════════════════════════════════════════
// GET — Generate tracking link for an influencer
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { getStoreUrl } from "@/lib/org-store-url";
import { campaignNameToSlug } from "@/lib/aura/campaign-slug";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const url = new URL(req.url);
    const campaignId = url.searchParams.get("campaignId");
    const customUrl = url.searchParams.get("url");

    const influencer = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
    });
    if (!influencer) {
      return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
    }

    const baseUrl = customUrl || (await getStoreUrl(org.id));
    let trackingLink = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}utm_source=inf_${influencer.code}&utm_medium=influencer`;

    // Add campaign if specified
    if (campaignId) {
      const campaign = await prisma.influencerCampaign.findFirst({
        where: { id: campaignId, influencerId: params.id },
      });
      if (campaign) {
        // Slug compartido con el motor de atribución (contrato en campaign-slug.ts)
        trackingLink += `&utm_campaign=${campaignNameToSlug(campaign.name)}`;
      }
    }

    // Public dashboard link
    const publicDashboardUrl = `${process.env.NEXTAUTH_URL || "https://app.nitrosales.com"}/i/${org.slug}/${influencer.code}`;

    return NextResponse.json({
      trackingLink,
      code: influencer.code,
      publicDashboardUrl,
    });
  } catch (error: any) {
    console.error("[Tracking Link GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
