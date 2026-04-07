// ══════════════════════════════════════════════════════════════
// Meta Ad Library Connector
// ══════════════════════════════════════════════════════════════
// Consulta la Meta Ad Library API para obtener anuncios activos
// de competidores. Requiere un access token con permiso ads_read.
// ══════════════════════════════════════════════════════════════

const META_API_VERSION = "v19.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export interface MetaAdLibraryAd {
  id: string;
  ad_creation_time: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_titles?: string[];
  ad_snapshot_url?: string;
  bylines?: string;
  currency?: string;
  impressions?: { lower_bound: string; upper_bound: string };
  spend?: { lower_bound: string; upper_bound: string };
  page_id?: string;
  page_name?: string;
  publisher_platforms?: string[];
  languages?: string[];
}

export interface ParsedCompetitorAd {
  adId: string;
  platform: "meta";
  adBody: string | null;
  adTitle: string | null;
  adImageUrl: string | null;
  adSnapshotUrl: string | null;
  adUrl: string | null;
  startDate: Date | null;
  endDate: Date | null;
  isActive: boolean;
  adType: string;
  impressionsRange: string | null;
  rawData: any;
}

/**
 * Fetch active ads for a Facebook Page from the Meta Ad Library API.
 * Supports search by Page ID or by search term (competitor name).
 * @param accessToken Meta access token with ads_read permission
 * @param options search_page_ids OR search_terms, country, limit, activeOnly
 */
export async function fetchMetaAdLibrary(
  accessToken: string,
  options: {
    pageId?: string;
    searchTerms?: string;
    country?: string;
    limit?: number;
    activeOnly?: boolean;
  }
): Promise<ParsedCompetitorAd[]> {
  const country = options?.country || "AR";
  const limit = options?.limit || 100;
  const activeOnly = options?.activeOnly ?? true;

  const fields = [
    "id",
    "ad_creation_time",
    "ad_delivery_start_time",
    "ad_delivery_stop_time",
    "ad_creative_bodies",
    "ad_creative_link_captions",
    "ad_creative_link_descriptions",
    "ad_creative_link_titles",
    "ad_snapshot_url",
    "bylines",
    "impressions",
    "spend",
    "page_id",
    "page_name",
    "publisher_platforms",
    "languages",
  ].join(",");

  const params = new URLSearchParams({
    ad_reached_countries: `["${country}"]`,
    ad_active_status: activeOnly ? "ACTIVE" : "ALL",
    fields,
    limit: String(limit),
    access_token: accessToken,
  });

  // Use page ID if available (most precise), otherwise search by name
  if (options.pageId) {
    params.set("search_page_ids", options.pageId);
  } else if (options.searchTerms) {
    params.set("search_terms", options.searchTerms);
  } else {
    return []; // Nothing to search
  }

  const url = `${META_BASE_URL}/ads_archive?${params}`;

  const allAds: MetaAdLibraryAd[] = [];
  let nextUrl: string | null = url;
  let pages = 0;
  const maxPages = 5; // Safety limit

  while (nextUrl && pages < maxPages) {
    const res: Response = await fetch(nextUrl);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(
        `Meta Ad Library API error: ${error?.error?.message || res.statusText} (${res.status})`
      );
    }

    const data: any = await res.json();
    if (data.data && Array.isArray(data.data)) {
      allAds.push(...data.data);
    }

    // Pagination
    nextUrl = data.paging?.next || null;
    pages++;

    // If we already have enough ads, stop
    if (allAds.length >= limit) break;
  }

  // Parse into our format
  return allAds.slice(0, limit).map((ad) => parseMetaAd(ad));
}

function parseMetaAd(ad: MetaAdLibraryAd): ParsedCompetitorAd {
  const body = ad.ad_creative_bodies?.[0] || null;
  const title = ad.ad_creative_link_titles?.[0] || null;
  const snapshotUrl = ad.ad_snapshot_url || null;

  // Determine ad type based on available data
  let adType = "image";
  if (ad.ad_creative_bodies && ad.ad_creative_bodies.length > 1) {
    adType = "carousel";
  }

  // Parse dates
  const startDate = ad.ad_delivery_start_time
    ? new Date(ad.ad_delivery_start_time)
    : ad.ad_creation_time
      ? new Date(ad.ad_creation_time)
      : null;
  const endDate = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time) : null;

  // Impressions range
  const impressionsRange = ad.impressions
    ? `${ad.impressions.lower_bound}-${ad.impressions.upper_bound}`
    : null;

  return {
    adId: ad.id,
    platform: "meta",
    adBody: body,
    adTitle: title,
    adImageUrl: null, // Meta Ad Library doesn't give direct image URLs in API, use snapshot
    adSnapshotUrl: snapshotUrl,
    adUrl: null, // Link destination not available in Ad Library API directly
    startDate,
    endDate,
    isActive: !endDate || endDate > new Date(),
    adType,
    impressionsRange,
    rawData: ad,
  };
}

/**
 * Generate a direct link to the Meta Ad Library page for a given page ID.
 */
export function getMetaAdLibraryUrl(pageId: string, country: string = "AR"): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&view_all_page_id=${pageId}&sort_data[direction]=desc&sort_data[mode]=relevancy_monthly_grouped`;
}

/**
 * Generate a direct link to Google Ads Transparency Center for a domain.
 */
export function getGoogleAdsTransparencyUrl(domain: string, country: string = "AR"): string {
  // Clean domain
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return `https://adstransparency.google.com/advertiser/${country}?domain=${cleanDomain}`;
}
