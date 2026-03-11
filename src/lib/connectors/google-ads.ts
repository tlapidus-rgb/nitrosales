// ══════════════════════════════════════════════
// Conector de Google Ads
// ══════════════════════════════════════════════
// Usa la Google Ads API para traer datos de campañas,
// keywords, Quality Score, Search Terms y Shopping.

interface GoogleAdsCredentials {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  customerId: string;      // sin guiones: "1234567890"
  refreshToken: string;
}

const GOOGLE_ADS_API_VERSION = "v16";

export class GoogleAdsConnector {
  private credentials: GoogleAdsCredentials;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(credentials: GoogleAdsCredentials) {
    this.credentials = {
      ...credentials,
      customerId: credentials.customerId.replace(/-/g, ""),
    };
  }

  // ── Obtener/refrescar access token ──
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        refresh_token: this.credentials.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error(`Google OAuth error: ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken!;
  }

  // ── Ejecutar query GAQL (Google Ads Query Language) ──
  private async query(gaql: string): Promise<any[]> {
    const token = await this.getAccessToken();
    const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${this.credentials.customerId}/googleAds:searchStream`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "developer-token": this.credentials.developerToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: gaql }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google Ads API error: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    // searchStream devuelve un array de batches
    const results: any[] = [];
    for (const batch of data) {
      if (batch.results) {
        results.push(...batch.results);
      }
    }
    return results;
  }

  // ── Campañas ──
  async fetchCampaigns() {
    const gaql = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.name
    `;
    return this.query(gaql);
  }

  // ── Métricas diarias por campaña ──
  async fetchCampaignMetrics(params: {
    startDate: string;  // "2024-01-01"
    endDate: string;
  }) {
    const gaql = `
      SELECT
        campaign.id,
        campaign.name,
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.search_impression_share
      FROM campaign
      WHERE segments.date BETWEEN '${params.startDate}' AND '${params.endDate}'
        AND campaign.status != 'REMOVED'
    `;
    return this.query(gaql);
  }

  // ── Keywords con Quality Score ──
  async fetchKeywordPerformance(params: {
    startDate: string;
    endDate: string;
  }) {
    const gaql = `
      SELECT
        ad_group_criterion.keyword.text,
        ad_group_criterion.quality_info.quality_score,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM keyword_view
      WHERE segments.date BETWEEN '${params.startDate}' AND '${params.endDate}'
        AND ad_group_criterion.status != 'REMOVED'
      ORDER BY metrics.impressions DESC
      LIMIT 100
    `;
    return this.query(gaql);
  }

  // ── Search Terms (qué busca la gente exactamente) ──
  async fetchSearchTerms(params: {
    startDate: string;
    endDate: string;
    limit?: number;
  }) {
    const gaql = `
      SELECT
        search_term_view.search_term,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM search_term_view
      WHERE segments.date BETWEEN '${params.startDate}' AND '${params.endDate}'
      ORDER BY metrics.impressions DESC
      LIMIT ${params.limit || 50}
    `;
    return this.query(gaql);
  }

  // ── Shopping Performance (por producto) ──
  async fetchShoppingPerformance(params: {
    startDate: string;
    endDate: string;
  }) {
    const gaql = `
      SELECT
        segments.product_title,
        segments.product_item_id,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM shopping_performance_view
      WHERE segments.date BETWEEN '${params.startDate}' AND '${params.endDate}'
      ORDER BY metrics.conversions_value DESC
      LIMIT 50
    `;
    return this.query(gaql);
  }

  // ── Helper: convertir cost_micros a valor real ──
  static microsToCurrency(micros: number | string): number {
    return (typeof micros === "string" ? parseInt(micros) : micros) / 1_000_000;
  }

  // ── Test de conexión ──
  async testConnection(): Promise<boolean> {
    try {
      const gaql = `SELECT customer.id FROM customer LIMIT 1`;
      await this.query(gaql);
      return true;
    } catch {
      return false;
    }
  }
}
