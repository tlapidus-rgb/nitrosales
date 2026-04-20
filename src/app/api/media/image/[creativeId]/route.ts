// Image preview resolver — devuelve URL fresca de imagen para AdCreative.
//
// Por que existe:
//   - Las URLs de imagen de Meta (scontent.xx.fbcdn.net) son firmadas y
//     caducan a las pocas horas. Las que guardamos en mediaUrls al sync
//     se rompen rapido. Hay que pedir una URL fresca on-demand.
//   - Tambien detecta Catalogo Dinamico (DPA / Advantage+ Catalog) que no
//     tiene imagen unica: Meta arma el creativo en runtime por producto.
//
// Respuesta:
//   {
//     source: "meta" | "unknown",
//     imageUrl: string | null,        // URL fresca de la imagen (firmada)
//     isDynamic: boolean,             // true si es Catalogo Dinamico (DPA)
//     permalinkUrl: string | null,    // link a Facebook / Ads Manager preview
//     error: string | null,
//     debug?: object
//   }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

interface RouteContext {
  params: Promise<{ creativeId: string }>;
}

interface MetaImageResult {
  imageUrl: string | null;
  isDynamic: boolean;
  permalinkUrl: string | null;
  error: string | null;
  debug: any;
}

async function resolveMetaImage(externalAdId: string, adsToken: string): Promise<MetaImageResult> {
  const debug: any = { externalAdId, steps: [] };

  if (!adsToken) {
    return { imageUrl: null, isDynamic: false, permalinkUrl: null, error: "Org sin Meta Ads conectado", debug };
  }

  try {
    // Pedimos todos los campos relevantes de la creative.
    // - image_url / thumbnail_url: imagen estatica
    // - product_set_id: si esta presente -> es DPA / Advantage+ Catalog
    // - template_url / asset_feed_spec: indica creativo dinamico tambien
    // - object_story_spec.link_data.image_hash: imagen dentro de un page post
    const fields = [
      "preview_shareable_link",
      "adcreatives{id,image_url,thumbnail_url,product_set_id,template_url,asset_feed_spec,effective_object_story_id,object_story_spec}",
      "creative{id,image_url,thumbnail_url,product_set_id,template_url,asset_feed_spec,effective_object_story_id,object_story_spec}",
    ].join(",");
    const adUrl = `https://graph.facebook.com/v19.0/${externalAdId}?fields=${fields}&access_token=${adsToken}`;
    const adRes = await fetch(adUrl, { cache: "no-store" });
    const ad = await adRes.json();
    debug.steps.push({ step: "ad_fetch", status: adRes.status, hasError: !!ad.error, err: ad.error?.message });

    if (ad.error) {
      return { imageUrl: null, isDynamic: false, permalinkUrl: null, error: `Graph API: ${ad.error.message}`, debug };
    }

    const creative = ad?.adcreatives?.data?.[0] || ad?.creative || null;
    debug.steps.push({ step: "creative_extract", found: !!creative });

    // Detectar Catalogo Dinamico: cualquiera de estas señales
    const isDynamic =
      !!creative?.product_set_id ||
      !!creative?.template_url ||
      !!creative?.asset_feed_spec;
    debug.steps.push({ step: "dynamic_check", isDynamic, hasProductSet: !!creative?.product_set_id, hasTemplate: !!creative?.template_url, hasAssetFeed: !!creative?.asset_feed_spec });

    // Permalink fallback (mismo patron que video resolver)
    let permalinkFallback: string | null = null;
    if (ad.preview_shareable_link) {
      permalinkFallback = ad.preview_shareable_link;
    } else {
      const storyId = creative?.effective_object_story_id || null;
      if (storyId && typeof storyId === "string" && storyId.includes("_")) {
        const [pageId, postId] = storyId.split("_");
        permalinkFallback = `https://www.facebook.com/${pageId}/posts/${postId}`;
      }
    }

    // Si es dinamico, no hay imagen fija: devolvemos isDynamic + permalink
    if (isDynamic) {
      return {
        imageUrl: null,
        isDynamic: true,
        permalinkUrl: permalinkFallback,
        error: null,
        debug,
      };
    }

    // Imagen estatica: priorizar image_url > thumbnail_url > link_data.picture
    const imageUrl: string | null =
      creative?.image_url ||
      creative?.thumbnail_url ||
      creative?.object_story_spec?.link_data?.picture ||
      creative?.object_story_spec?.photo_data?.url ||
      null;

    debug.steps.push({ step: "image_pick", got: !!imageUrl });

    if (!imageUrl) {
      return {
        imageUrl: null,
        isDynamic: false,
        permalinkUrl: permalinkFallback,
        error: "Meta no devolvio URL de imagen para este creativo",
        debug,
      };
    }

    return {
      imageUrl,
      isDynamic: false,
      permalinkUrl: permalinkFallback,
      error: null,
      debug,
    };
  } catch (e: any) {
    debug.steps.push({ step: "ad_fetch", error: e?.message });
    return { imageUrl: null, isDynamic: false, permalinkUrl: null, error: `Error consultando ad: ${e?.message}`, debug };
  }
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { creativeId } = await ctx.params;

  if (!creativeId) {
    return NextResponse.json({ error: "Missing creativeId" }, { status: 400 });
  }

  const creative = await prisma.adCreative.findUnique({
    where: { id: creativeId },
    select: { id: true, externalId: true, platform: true, type: true, mediaUrls: true, organizationId: true },
  });

  if (!creative) {
    return NextResponse.json({ error: "Creative not found" }, { status: 404 });
  }

  if (creative.platform === "META") {
    // Multi-tenant: resolver Meta Ads access token desde Connection de la org del creative
    const metaConn = await prisma.connection.findFirst({
      where: { organizationId: creative.organizationId, platform: "META_ADS" as any, status: "ACTIVE" as any },
      select: { credentials: true },
    });
    const metaCreds = (metaConn?.credentials as any) || {};
    const adsToken = metaCreds.accessToken || metaCreds.access_token || "";

    const result = await resolveMetaImage(creative.externalId, adsToken);
    return NextResponse.json({
      source: "meta",
      imageUrl: result.imageUrl || creative.mediaUrls?.[0] || null,
      isDynamic: result.isDynamic,
      permalinkUrl: result.permalinkUrl,
      error: result.error,
      debug: result.debug,
    });
  }

  // GOOGLE / OTROS: solo devolver lo que ya tenemos en mediaUrls
  return NextResponse.json({
    source: creative.platform.toLowerCase(),
    imageUrl: creative.mediaUrls?.[0] || null,
    isDynamic: false,
    permalinkUrl: null,
    error: null,
  });
}
