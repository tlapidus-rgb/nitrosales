// Video source resolver — devuelve la URL de video reproducible para un AdCreative.
//
// Por que existe:
//   - Meta solo guarda el thumbnail (image_url/thumbnail_url) en mediaUrls[].
//     Para reproducir el video tenemos que pedirle a Graph API el "source"
//     usando el video_id. Esto se hace on-demand cuando el usuario abre el
//     creativo en el modal.
//   - Para Google, los videos de YouTube son embebibles via youtube-nocookie
//     o via su URL de googlevideo.com — esto es mas raro, por ahora solo Meta.
//
// Respuesta: { videoUrl, posterUrl, embeddable, source: "meta"|"youtube"|"unknown" }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

interface RouteContext {
  params: Promise<{ creativeId: string }>;
}

async function resolveMetaVideo(externalAdId: string): Promise<{ videoUrl: string | null; posterUrl: string | null; videoId: string | null }> {
  const token = process.env.META_ADS_ACCESS_TOKEN || "";
  if (!token) return { videoUrl: null, posterUrl: null, videoId: null };

  // 1) Pedir el ad → adcreatives → video_id
  try {
    const adRes = await fetch(
      `https://graph.facebook.com/v19.0/${externalAdId}?fields=adcreatives{id,video_id,image_url,thumbnail_url,object_story_spec}&access_token=${token}`,
      { cache: "no-store" }
    );
    const ad = await adRes.json();
    if (ad.error) return { videoUrl: null, posterUrl: null, videoId: null };

    const creative = ad?.adcreatives?.data?.[0];
    let videoId: string | null = creative?.video_id || null;
    if (!videoId && creative?.object_story_spec?.video_data?.video_id) {
      videoId = creative.object_story_spec.video_data.video_id;
    }
    const posterUrl: string | null = creative?.image_url || creative?.thumbnail_url || null;

    if (!videoId) return { videoUrl: null, posterUrl, videoId: null };

    // 2) Pedir el video source
    const vidRes = await fetch(
      `https://graph.facebook.com/v19.0/${videoId}?fields=source,picture,permalink_url&access_token=${token}`,
      { cache: "no-store" }
    );
    const vid = await vidRes.json();
    if (vid.error) return { videoUrl: null, posterUrl, videoId };

    return {
      videoUrl: vid.source || null,
      posterUrl: vid.picture || posterUrl,
      videoId,
    };
  } catch (e) {
    console.error("resolveMetaVideo error", e);
    return { videoUrl: null, posterUrl: null, videoId: null };
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
    const { videoUrl, posterUrl, videoId } = await resolveMetaVideo(creative.externalId);
    return NextResponse.json({
      source: "meta",
      videoUrl,
      posterUrl: posterUrl || creative.mediaUrls?.[0] || null,
      videoId,
      embeddable: !!videoUrl,
    });
  }

  // GOOGLE: por ahora no resolvemos video source (YouTube ads son raros)
  // Devolvemos lo que tenemos en mediaUrls
  if (creative.platform === "GOOGLE") {
    const url = creative.mediaUrls?.[0] || null;
    const isYouTube = url?.includes("youtube.com") || url?.includes("youtu.be");
    return NextResponse.json({
      source: isYouTube ? "youtube" : "unknown",
      videoUrl: url,
      posterUrl: url,
      videoId: null,
      embeddable: !!url,
    });
  }

  return NextResponse.json({
    source: "unknown",
    videoUrl: null,
    posterUrl: creative.mediaUrls?.[0] || null,
    videoId: null,
    embeddable: false,
  });
}
