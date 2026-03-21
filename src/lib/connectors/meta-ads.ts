// ══════════════════════════════════════════════
// Conector de Meta Ads (Facebook/Instagram Ads)
// ══════════════════════════════════════════════
// Usa la Marketing API de Meta para traer datos
// de campañas, gastos, ROAS y métricas de anuncios.

interface MetaAdsCredentials {
  accessToken: string;
  adAccountId: string;  // formato: act_123456789
}

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
}

interface MetaAd {
  id: string;
  name: string;
  status: string;
  creative?: {
    id: string;
    title?: string;
    body?: string;
    image_url?: string;
    thumbnail_url?: string;
    video_id?: string;
    call_to_action_type?: string;
    object_story_spec?: {
      video_data?: { video_id: string; image_url?: string };
      link_data?: { image_hash?: string; link?: string; message?: string; name?: string; description?: string; picture?: string; child_attachments?: any[] };
    };
  };
  adcreatives?: { data: Array<{
    id: string;
    name?: string;
    title?: string;
    body?: string;
    image_url?: string;
    thumbnail_url?: string;
    video_id?: string;
    call_to_action_type?: string;
    object_type?: string;
  }> };
}

interface MetaAdInsight {
  ad_id: string;
  ad_name: string;
  date_start: string;
  date_stop: string;
  impressions: string;
  clicks: string;
  spend: string;
  reach?: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

interface MetaInsight {
  campaign_id: string;
  campaign_name: string;
  date_start: string;
  date_stop: string;
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  frequency: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

const META_API_VERSION = "v19.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export class MetaAdsConnector {
  private accessToken: string;
  private adAccountId: string;

  constructor(credentials: MetaAdsCredentials) {
    this.accessToken = credentials.accessToken;
    this.adAccountId = credentials.adAccountId;
  }

  // ── Campañas ──
  async fetchCampaigns(): Promise<MetaCampaign[]> {
    const url = `${META_BASE_URL}/${this.adAccountId}/campaigns?fields=id,name,status,objective&access_token=${this.accessToken}&limit=100`;
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Meta API error: ${error.error?.message || response.statusText}`);
    }
    const data = await response.json();
    return data.data || [];
  }

  // ── Métricas diarias por campaña ──
  async fetchCampaignInsights(params: {
    startDate: string;  // "2024-01-01"
    endDate: string;
  }): Promise<MetaInsight[]> {
    const allInsights: MetaInsight[] = [];
    const campaigns = await this.fetchCampaigns();

    for (const campaign of campaigns) {
      try {
        const url = `${META_BASE_URL}/${campaign.id}/insights?` +
          `fields=campaign_id,campaign_name,impressions,clicks,spend,reach,frequency,actions,action_values` +
          `&time_range={"since":"${params.startDate}","until":"${params.endDate}"}` +
          `&time_increment=1` +
          `&access_token=${this.accessToken}`;

        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          allInsights.push(...(data.data || []));
        }
      } catch (e) {
        console.error(`Error fetching insights for campaign ${campaign.id}:`, e);
      }
    }

    return allInsights;
  }

  // ── Métricas totales de la cuenta ──
  async fetchAccountInsights(params: {
    startDate: string;
    endDate: string;
  }) {
    const url = `${META_BASE_URL}/${this.adAccountId}/insights?` +
      `fields=impressions,clicks,spend,reach,frequency,actions,action_values,cpc,cpm,ctr` +
      `&time_range={"since":"${params.startDate}","until":"${params.endDate}"}` +
      `&access_token=${this.accessToken}`;

    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Meta API error: ${error.error?.message}`);
    }
    const data = await response.json();
    return data.data?.[0] || null;
  }

  // ── Helpers para extraer conversiones de las "actions" de Meta ──
  static extractConversions(insight: MetaInsight): number {
    if (!insight.actions) return 0;
    const purchaseAction = insight.actions.find(
      (a) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase"
    );
    return purchaseAction ? parseInt(purchaseAction.value) : 0;
  }

  static extractConversionValue(insight: MetaInsight): number {
    if (!insight.action_values) return 0;
    const purchaseValue = insight.action_values.find(
      (a) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase"
    );
    return purchaseValue ? parseFloat(purchaseValue.value) : 0;
  }

  // ── Anuncios individuales de una campana ──
  async fetchAds(campaignId: string): Promise<MetaAd[]> {
    const url = `${META_BASE_URL}/${campaignId}/ads?` +
      `fields=id,name,status,adcreatives{id,name,title,body,image_url,thumbnail_url,video_id,call_to_action_type,object_type}` +
      `&access_token=${this.accessToken}&limit=100`;
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = await response.json();
      return data.data || [];
    } catch (e) {
      console.error(`Error fetching ads for campaign ${campaignId}:`, e);
      return [];
    }
  }

  // ── Todos los anuncios de la cuenta ──
  async fetchAllAds(): Promise<MetaAd[]> {
    const url = `${META_BASE_URL}/${this.adAccountId}/ads?` +
      `fields=id,name,status,campaign_id,adset_id,adcreatives{id,name,title,body,image_url,thumbnail_url,video_id,call_to_action_type,object_type}` +
      `&access_token=${this.accessToken}&limit=200`;
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = await response.json();
      return data.data || [];
    } catch (e) {
      console.error(`Error fetching all ads:`, e);
      return [];
    }
  }

  // ── Metricas diarias por anuncio ──
  async fetchAdInsights(params: {
    startDate: string;
    endDate: string;
  }): Promise<MetaAdInsight[]> {
    const allInsights: MetaAdInsight[] = [];
    const url = `${META_BASE_URL}/${this.adAccountId}/insights?` +
      `fields=ad_id,ad_name,impressions,clicks,spend,reach,frequency,actions,action_values` +
      `&time_range={"since":"${params.startDate}","until":"${params.endDate}"}` +
      `&time_increment=1` +
      `&level=ad` +
      `&limit=500` +
      `&access_token=${this.accessToken}`;

    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        allInsights.push(...(data.data || []));
        // Handle pagination
        let nextUrl = data.paging?.next;
        while (nextUrl) {
          const nextRes = await fetch(nextUrl);
          if (!nextRes.ok) break;
          const nextData = await nextRes.json();
          allInsights.push(...(nextData.data || []));
          nextUrl = nextData.paging?.next;
        }
      }
    } catch (e) {
      console.error(`Error fetching ad insights:`, e);
    }
    return allInsights;
  }

  // ── Helpers para detectar tipo de creativo ──
  static detectAdType(ad: MetaAd): string {
    const creative = ad.adcreatives?.data?.[0];
    if (!creative) return "UNKNOWN";
    if (creative.video_id) return "VIDEO";
    if (creative.object_type === "VIDEO") return "VIDEO";
    if (creative.object_type === "SHARE" && creative.body) {
      // Check for carousel (child_attachments)
      return "IMAGE";
    }
    if (creative.image_url || creative.thumbnail_url) return "IMAGE";
    return "UNKNOWN";
  }

  static extractMediaUrls(ad: MetaAd): string[] {
    const urls: string[] = [];
    const creative = ad.adcreatives?.data?.[0];
    if (!creative) return urls;
    if (creative.image_url) urls.push(creative.image_url);
    if (creative.thumbnail_url && !urls.includes(creative.thumbnail_url)) urls.push(creative.thumbnail_url);
    return urls;
  }

  static extractAdConversions(insight: MetaAdInsight): number {
    if (!insight.actions) return 0;
    const pa = insight.actions.find(
      (a) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase"
    );
    return pa ? parseInt(pa.value) : 0;
  }

  static extractAdConversionValue(insight: MetaAdInsight): number {
    if (!insight.action_values) return 0;
    const pv = insight.action_values.find(
      (a) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase"
    );
    return pv ? parseFloat(pv.value) : 0;
  }

  // ── Test de conexión ──
  async testConnection(): Promise<boolean> {
    try {
      const url = `${META_BASE_URL}/${this.adAccountId}?fields=name&access_token=${this.accessToken}`;
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }
}
