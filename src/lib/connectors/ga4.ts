// ══════════════════════════════════════════════
// Conector de Google Analytics 4
// ══════════════════════════════════════════════
// Usa la Google Analytics Data API para traer
// métricas web, embudos y fuentes de tráfico.

import { BetaAnalyticsDataClient } from "@google-analytics/data";

interface GA4Credentials {
  propertyId: string;
  serviceAccountKey: string; // JSON string de la Service Account
}

export class GA4Connector {
  private client: BetaAnalyticsDataClient;
  private propertyId: string;

  constructor(credentials: GA4Credentials) {
    const keyData = JSON.parse(credentials.serviceAccountKey);
    this.client = new BetaAnalyticsDataClient({
      credentials: {
        client_email: keyData.client_email,
        private_key: keyData.private_key,
      },
    });
    this.propertyId = credentials.propertyId;
  }

  // ── Métricas web generales por día ──
  async fetchDailyMetrics(params: {
    startDate: string;  // "2024-01-01"
    endDate: string;    // "2024-01-31"
  }) {
    const [response] = await this.client.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
      dimensions: [
        { name: "date" },
        { name: "sessionSource" },
        { name: "sessionMedium" },
        { name: "deviceCategory" },
      ],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "newUsers" },
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
      ],
    });

    return this.parseReportRows(response);
  }

  // ── Embudo de conversión (ecommerce) ──
  async fetchFunnelData(params: {
    startDate: string;
    endDate: string;
  }) {
    const [response] = await this.client.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "totalUsers" },          // Visitantes
        { name: "itemsViewed" },          // Vieron producto
        { name: "addToCarts" },           // Agregaron al carrito
        { name: "checkouts" },            // Iniciaron checkout
        { name: "ecommercePurchases" },   // Compraron
      ],
    });

    return this.parseReportRows(response);
  }

  // ── Páginas más visitadas ──
  async fetchTopPages(params: {
    startDate: string;
    endDate: string;
    limit?: number;
  }) {
    const [response] = await this.client.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
      dimensions: [{ name: "pagePath" }],
      metrics: [
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
        { name: "conversions" },
      ],
      limit: params.limit || 20,
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    });

    return this.parseReportRows(response);
  }

  // ── Búsquedas internas del sitio ──
  async fetchInternalSearches(params: {
    startDate: string;
    endDate: string;
  }) {
    const [response] = await this.client.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
      dimensions: [{ name: "searchTerm" }],
      metrics: [{ name: "eventCount" }],
      limit: 50,
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    });

    return this.parseReportRows(response);
  }

  // ── Test de conexión ──
  async testConnection(): Promise<boolean> {
    try {
      await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
        metrics: [{ name: "sessions" }],
        limit: 1,
      });
      return true;
    } catch {
      return false;
    }
  }

  // ── Utilidad: parsear las filas del reporte ──
  private parseReportRows(response: any) {
    if (!response?.rows) return [];

    const dimensionHeaders = response.dimensionHeaders?.map((h: any) => h.name) || [];
    const metricHeaders = response.metricHeaders?.map((h: any) => h.name) || [];

    return response.rows.map((row: any) => {
      const result: Record<string, any> = {};
      row.dimensionValues?.forEach((val: any, i: number) => {
        result[dimensionHeaders[i]] = val.value;
      });
      row.metricValues?.forEach((val: any, i: number) => {
        result[metricHeaders[i]] = parseFloat(val.value) || 0;
      });
      return result;
    });
  }
}
