// Video source resolver — devuelve la URL de video reproducible para un AdCreative.
//
// Por que existe:
//   - Meta solo guarda el thumbnail en mediaUrls[]. Para reproducir el video
//     hay que ir a Graph API y pedir el "source" usando el video_id.
//   - Si Graph no devuelve source (permisos / video privado), devolvemos
//     permalink_url como fallback (link a Facebook/Instagram).
//
// Respuesta:
//   {
//     source: "meta" | "youtube" | "unknown",
//     videoUrl: string | null,        // source reproducible
//     posterUrl: string | null,       // thumbnail de alta resolucion
//     videoId: string | null,
//     permalinkUrl: string | null,    // fallback: link a Facebook
//     embeddable: boolean,
//     error: string | null,           // diagnostico humano
//     debug?: object                  // detalle para inspeccion en network tab
//   }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

interface RouteContext {
  params: Promise<{ creativeId: string }>;
}

interface MetaResolveResult {
  videoUrl: string | null;
  posterUrl: string | null;
  videoId: string | null;
  permalinkUrl: string | null;
  error: string | null;
  debug: any;
}

async function resolveMetaVideo(externalAdId: string): Promise<MetaResolveResult> {
  const token = process.env.META_ADS_ACCESS_TOKEN || "";
  const debug: any = { externalAdId, steps: [] };

  if (!token) {
    return { videoUrl: null, posterUrl: null, videoId: null, permalinkUrl: null, error: "Falta META_ADS_ACCESS_TOKEN", debug };
  }

  // ── Step 1: ad → adcreatives → video_id + image_url + thumbnail_url
  let videoId: string | null = null;
  let posterUrl: string | null = null;
  try {
    const adUrl = `https://graph.facebook.com/v19.0/${externalAdId}?fields=adcreatives{id,video_id,image_url,thumbnail_url,object_story_spec},creative{id,video_id,image_url,thumbnail_url,object_story_spec}&access_token=${token}`;
    const adRes = await fetch(adUrl, { cache: "no-store" });
    const ad = await adRes.json();
    debug.steps.push({ step: "ad_fetch", status: adRes.status, hasError: !!ad.error, err: ad.error?.message });

    if (ad.error) {
      return { videoUrl: null, posterUrl: null, videoId: null, permalinkUrl: null, error: `Graph API: ${ad.error.message}`, debug };
    }

    // Buscar creative tanto en `adcreatives.data[0]` como en `creative` (depende del tipo de ad)
    const creative = ad?.adcreatives?.data?.[0] || ad?.creative || null;
    debug.steps.push({ step: "creative_extract", found: !!creative, hasVideoId: !!creative?.video_id });

    if (creative) {
      videoId = creative.video_id || creative?.object_story_spec?.video_data?.video_id || null;
      posterUrl = creative.image_url || creative.thumbnail_url || null;
    }
  } catch (e: any) {
    debug.steps.push({ step: "ad_fetch", error: e?.message });
    return { videoUrl: null, posterUrl: null, videoId: null, permalinkUrl: null, error: `Error consultando ad: ${e?.message}`, debug };
  }

  if (!videoId) {
    return { videoUrl: null, posterUrl, videoId: null, permalinkUrl: null, error: "El creativo no tiene video_id asociado", debug };
  }

  // ── Step 2: video → source + picture (HD) + permalink_url
  try {
    const vidUrl = `https://graph.facebook.com/v19.0/${videoId}?fields=source,picture,permalink_url,format&access_token=${token}`;
    const vidRes = await fetch(vidUrl, { cache: "no-store" });
    const vid = await vidRes.json();
    debug.steps.push({ step: "video_fetch", status: vidRes.status, hasSource: !!vid.source, hasError: !!vid.error, err: vid.error?.message });

    if (vid.error) {
      // Permission error tipico: codigo 200 / mensaje sobre Page Public Content Access o ads_management
      return {
        videoUrl: null,
        posterUrl: vid.picture || posterUrl,
        videoId,
        permalinkUrl: vid.permalink_url || null,
        error: `Graph API video: ${vid.error.message}`,
        debug,
      };
    }

    // El campo `format` puede tener variantes con URLs de mayor resolucion
    let bestSource: string | null = vid.source || null;
    if (Array.isArray(vid.format) && vid.format.length > 0) {
      // format: [{ embed_html, filter, width, height, picture }]
      // No siempre incluye source, pero los hay con varios bitrates en `source` raiz
    }

    const permalinkUrl: string | null = vid.permalink_url
      ? (vid.permalink_url.startsWith("http") ? vid.permalink_url : `https://www.facebook.com${vid.permalink_url}`)
      : null;

    return {
      videoUrl: bestSource,
      posterUrl: vid.picture || posterUrl,
      videoId,
      permalinkUrl,
      error: bestSource ? null : "Meta no devolvio source reproducible (permisos del token)",
      debug,
    };
  } catch (e: any) {
    debug.steps.push({ step: "video_fetch", error: e?.message });
    return { videoUrl: null, posterUrl, videoId, permalinkUrl: null, error: `Error consultando video: ${e?.message}`, debug };
  }
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { creativeId } = await ctx.params;

  if (!creativeId) {
    return NextResponse.json({ error: "Missing creativeId" }, { status: 400 });
  }

  const creative = await prisma.adCreative.findUnique({
    where: { id: creativeId },
    select: { id: true, externalId: true, platform: true, type: true, mediaUrls: true },
  });

  if (!creative) {
    return NextResponse.json({ error: "Creative not found" }, { status: 404 });
  }

  // META: pedir source on-demand
  if (creative.platform === "META") {
    const result = await resolveMetaVideo(creative.externalId);
    return NextResponse.json({
      source: "meta",
      videoUrl: result.videoUrl,
      posterUrl: result.posterUrl || creative.mediaUrls?.[0] || null,
      videoId: result.videoId,
      permalinkUrl: result.permalinkUrl,
      embeddable: !!result.videoUrl,
      error: result.error,
      debug: result.debug,
    });
  }

  // GOOGLE: por ahora no resolvemos video source (YouTube ads son raros)
  if (creative.platform === "GOOGLE") {
    const url = creative.mediaUrls?.[0] || null;
    const isYouTube = !!(url?.includes("youtube.com") || url?.includes("youtu.be"));
    return NextResponse.json({
      source: isYouTube ? "youtube" : "unknown",
      videoUrl: url,
      posterUrl: url,
      videoId: null,
      permalinkUrl: null,
      embeddable: !!url,
      error: null,
    });
  }

  return NextResponse.json({
    source: "unknown",
    videoUrl: null,
    posterUrl: creative.mediaUrls?.[0] || null,
    videoId: null,
    permalinkUrl: null,
    embeddable: false,
    error: "Plataforma no soportada",
  });
}
