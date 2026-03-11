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
