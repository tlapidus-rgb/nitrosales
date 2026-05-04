// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET/POST /api/admin/reextract-touchpoint-campaigns?orgId=X&dryRun=1&key=Y
// ══════════════════════════════════════════════════════════════
// Recorre pa.touchpoints viejos sin campaign y re-extrae parseando el
// campo `page` (URL guardada). Aplica la misma logica de fallback del
// fix nuevo: si no hay utm_campaign en la URL, busca gad_campaignid,
// msclkid, ttclid, li_fat_id como fallback y guarda como "Campaña #ID".
//
// Idempotente: si el touchpoint YA tiene campaign, no toca.
// dryRun=1 → cuenta cuantos cambiarian sin tocar nada.
// orgId opcional → si no viene, aplica a TODAS las orgs.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min en Vercel Pro

const KEY = "nitrosales-secret-key-2024-production";

type CampaignMap = Map<string, string>;

function resolveWithMap(id: string, platform: 'GOOGLE' | 'META' | null, map: CampaignMap): string {
  if (platform) {
    const named = map.get(`${platform}:${id}`);
    if (named) return named;
  }
  const named = map.get(id);
  if (named) return named;
  return `Campaña #${id}`;
}

function extractCampaignFromUrl(pageUrl: string | undefined, campaignMap: CampaignMap): string | undefined {
  if (!pageUrl) return undefined;
  try {
    const url = new URL(pageUrl);
    const params = url.searchParams;
    const utm = params.get("utm_campaign");
    if (utm && utm.trim()) return utm.trim();
    const gad = params.get("gad_campaignid");
    if (gad && gad.trim()) return resolveWithMap(gad.trim(), 'GOOGLE', campaignMap);
    const msclkid = params.get("msclkid");
    if (msclkid && msclkid.trim()) return `Campaña #${msclkid.trim().slice(0, 12)}`;
    const ttclid = params.get("ttclid");
    if (ttclid && ttclid.trim()) return `Campaña #${ttclid.trim().slice(0, 12)}`;
    const lifat = params.get("li_fat_id");
    if (lifat && lifat.trim()) return `Campaña #${lifat.trim().slice(0, 12)}`;
    return undefined;
  } catch {
    return undefined;
  }
}

// Si una campaign existente tiene formato "Campaña #ID" y el ID matchea ad_campaigns,
// devolvemos el nombre real. Sino devolvemos undefined (no cambiar).
function upgradeCampaignName(currentCampaign: string | undefined, campaignMap: CampaignMap): string | undefined {
  if (!currentCampaign || !currentCampaign.startsWith("Campaña #")) return undefined;
  const id = currentCampaign.replace("Campaña #", "").trim();
  const namedGoogle = campaignMap.get(`GOOGLE:${id}`);
  if (namedGoogle) return namedGoogle;
  const namedMeta = campaignMap.get(`META:${id}`);
  if (namedMeta) return namedMeta;
  const namedAny = campaignMap.get(id);
  if (namedAny) return namedAny;
  return undefined;
}

async function processOrg(orgId: string, dryRun: boolean) {
  // Pre-cargar ad_campaigns para resolver gad_campaignid → name
  const adCampaigns = await prisma.adCampaign.findMany({
    where: { organizationId: orgId },
    select: { externalId: true, name: true, platform: true },
  });
  const campaignMap: CampaignMap = new Map();
  for (const c of adCampaigns) {
    campaignMap.set(`${c.platform}:${c.externalId}`, c.name);
    if (!campaignMap.has(c.externalId)) campaignMap.set(c.externalId, c.name);
  }

  const attributions = await prisma.pixelAttribution.findMany({
    where: { organizationId: orgId },
    select: { id: true, touchpoints: true },
  });

  let totalAttributions = attributions.length;
  let totalTouchpoints = 0;
  let touchpointsBefore = 0;
  let touchpointsRecovered = 0;
  let touchpointsUpgradedFromIdToName = 0;
  let attributionsUpdated = 0;
  const samples: Array<{ before: any; after: any; pageSnippet: string }> = [];

  for (const attr of attributions) {
    const tps = Array.isArray(attr.touchpoints) ? (attr.touchpoints as any[]) : [];
    if (tps.length === 0) continue;

    let modified = false;
    const newTps = tps.map((tp) => {
      totalTouchpoints += 1;
      // Path 1: ya tiene campaign en formato "Campaña #ID" → upgrade a nombre real si hay match
      if (tp.campaign && String(tp.campaign).startsWith("Campaña #")) {
        const upgraded = upgradeCampaignName(tp.campaign, campaignMap);
        if (upgraded) {
          touchpointsUpgradedFromIdToName += 1;
          if (samples.length < 8) {
            samples.push({
              before: { source: tp.source, medium: tp.medium, campaign: tp.campaign },
              after: { source: tp.source, medium: tp.medium, campaign: upgraded },
              pageSnippet: (tp.page || "").slice(0, 100),
            });
          }
          modified = true;
          return { ...tp, campaign: upgraded };
        }
        return tp;
      }
      // Path 2: tiene campaign con valor real (no "Campaña #..."), no tocar
      if (tp.campaign && String(tp.campaign).trim().length > 0) return tp;
      // Path 3: sin campaign → re-extraer del page URL
      touchpointsBefore += 1;
      const recovered = extractCampaignFromUrl(tp.page, campaignMap);
      if (recovered) {
        touchpointsRecovered += 1;
        if (samples.length < 8) {
          samples.push({
            before: { source: tp.source, medium: tp.medium, campaign: null },
            after: { source: tp.source, medium: tp.medium, campaign: recovered },
            pageSnippet: (tp.page || "").slice(0, 100),
          });
        }
        modified = true;
        return { ...tp, campaign: recovered };
      }
      return tp;
    });

    if (modified && !dryRun) {
      await prisma.pixelAttribution.update({
        where: { id: attr.id },
        data: { touchpoints: newTps as any },
      });
      attributionsUpdated += 1;
    } else if (modified && dryRun) {
      attributionsUpdated += 1;
    }
  }

  return {
    orgId,
    adCampaignsLoaded: adCampaigns.length,
    totalAttributions,
    totalTouchpoints,
    touchpointsWithoutCampaignBefore: touchpointsBefore,
    touchpointsRecovered,
    touchpointsUpgradedFromIdToName,
    pctRecovered: touchpointsBefore > 0 ? Math.round((touchpointsRecovered / touchpointsBefore) * 100) : 0,
    attributionsUpdated,
    samples,
  };
}

async function handle(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    const dryRun = url.searchParams.get("dryRun") === "1";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (orgId) {
      const result = await processOrg(orgId, dryRun);
      return NextResponse.json({ ok: true, dryRun, ...result });
    }

    // Sin orgId: procesa TODAS las orgs
    const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
    const results = [];
    for (const o of orgs) {
      const r = await processOrg(o.id, dryRun);
      results.push({ orgName: o.name, ...r });
    }
    return NextResponse.json({
      ok: true,
      dryRun,
      orgsProcessed: orgs.length,
      totalRecovered: results.reduce((s, r) => s + r.touchpointsRecovered, 0),
      totalUpgradedFromIdToName: results.reduce((s, r) => s + (r.touchpointsUpgradedFromIdToName || 0), 0),
      totalAttributionsUpdated: results.reduce((s, r) => s + r.attributionsUpdated, 0),
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
