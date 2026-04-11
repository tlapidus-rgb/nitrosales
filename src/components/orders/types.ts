// ══════════════════════════════════════════════════════════════
// Orders — shared types
// Reflejan el shape que devuelve /api/metrics/orders v4 (Tanda 2)
// Solo los namespaces nuevos de Session 16. Campos legacy del
// endpoint siguen siendo tipados ad-hoc en el page.tsx.
// ══════════════════════════════════════════════════════════════

// ── Tanda 6 (Session 16): scope por plataforma ──
// Algunas tarjetas solo se pueden calcular con datos de VTEX porque ML no
// expone los campos equivalentes (logística real, cupones, device, CP, etc.).
// La UI usa este scope para mostrar un banner explicativo o un empty state.
export type PlatformScope = "CROSS" | "VTEX_ONLY" | "VTEX_PARTIAL";

export interface SourceCounts {
  vtex: number;
  meli: number;
  total: number;
  // Tanda 8 — desglose por fuente para SourceSplitBar y cascada ML
  vtexRevenue?: number;
  meliRevenue?: number;
  vtexMarketplaceFee?: number;
  meliMarketplaceFee?: number;
  vtexShipping?: number;
  meliShipping?: number;
}

// ── Profitability (D1 + D2 + Tanda 7 honesty fix) ──
// Tanda 7.3: marginAbs/marginPct ahora se calculan SOLO sobre grossWithCost.
// Tanda 7.6: realNetRevenue = netRevenue \u2212 totalMarketplaceFee (plata real que entra).
export interface ProfitabilityData {
  grossRevenue: number;             // SUM(oi.totalPrice) total del per\u00edodo
  grossWithCost?: number;           // SUM(oi.totalPrice) de items CON costPrice
  grossWithoutCost?: number;        // SUM(oi.totalPrice) de items SIN costPrice
  netRevenue: number;               // (orders.totalValue) / 1.21
  realNetRevenue?: number;          // netRevenue \u2212 comisiones ML (plata real)
  totalMarketplaceFee?: number;     // SUM(orders.marketplaceFee)
  feeCoveragePct?: number;          // % de pedidos ML con fee cargado
  ordersWithFee?: number;
  totalCogs: number;
  marginAbs: number;                // grossWithCost \u2212 totalCogs
  marginPct: number;                // honesto: sobre grossWithCost
  ordersWithCost: number;
  ordersTotal: number;
  coveragePct: number;
  coveragePctByRevenue?: number;
}

// ── Logistics (D5) ──
export interface LogisticsBucket {
  bucket: string;
  orders: number;
  revenue: number;
  shippingCharged: number;
  shippingReal: number;
  shippingGap: number;
}
export interface LogisticsData {
  platformScope?: PlatformScope;
  byDeliveryType: LogisticsBucket[];
  byCarrier: LogisticsBucket[];
  shippingGapTotal: number;
}

// ── Segmentation (D6 + D7) ──
export interface SegmentationBucket {
  bucket: string;
  orders: number;
  revenue: number;
}
export interface SegmentationData {
  platformScope?: PlatformScope;
  byDevice: SegmentationBucket[];
  byChannel: SegmentationBucket[];
  byTrafficSource: SegmentationBucket[];
}

// ── Coupons (D8) ──
export interface CouponItem {
  code: string;
  orders: number;
  revenue: number;
  discountTotal: number;
}
export interface CouponsData {
  platformScope?: PlatformScope;
  topCoupons: CouponItem[];
  totalCouponRevenue: number;
  totalCouponDiscount: number;
}

// ── Fulfillment / DSO (D9) ──
export interface FulfillmentData {
  dsoAvgDays: number;
  dsoMedianDays: number;
  ordersFinalized: number;
}

// ── Cohorts (D10) ──
export interface CohortStats {
  customers: number;
  orders: number;
  revenue: number;
}
export interface CohortsData {
  platformScope?: PlatformScope;
  new: CohortStats;
  returning: CohortStats;
  vip: CohortStats;
  anonymous: CohortStats;             // total (legacy)
  anonymousMeli?: CohortStats;        // Tanda 7.7 \u2014 esperado (privacidad ML)
  anonymousVtex?: CohortStats;        // Tanda 7.7 \u2014 bug si > 0
  vipCriteria: {
    minOrders: number;
    minSpentArs: number;
    description: string;
  };
  mlPrivacyNote?: string;
}

// ── Geography (D12) ──
export interface GeoBucket {
  value: string;
  orders: number;
  revenue: number;
}
export interface GeographyData {
  platformScope?: PlatformScope;
  topProvinces: GeoBucket[];
  topPostalCodes: GeoBucket[];
}

// ── Anomalies (D11) ──
export type AnomalyFlag =
  | "negative_margin"
  | "high_discount"
  | "stale_price"
  | "high_ticket"
  | "high_qty"
  | "shipping_gap";

export interface OrderLevelAnomaly {
  orderId: string;
  externalId: string;
  totalValue: number;
  itemCount: number;
  orderDate: string;
  flags: AnomalyFlag[];
}

export interface PeriodLevelAnomaly {
  cancelLast24h: number;
  cancelDailyBaseline: number;
  cancelSpikeRatio: number;
  cancelSpikeActive: boolean;
  velocityLastHour: number;
  velocityHourlyBaseline: number;
  velocityRatio: number;
  velocityAnomalyActive: boolean;
  duplicateSuspectsCount: number;
  viralSkus: Array<{ name: string; count: number }>;
}

export interface AnomaliesData {
  orderLevel: OrderLevelAnomaly[];
  periodLevel: PeriodLevelAnomaly;
  counts: Record<string, number>;
  thresholds: Record<string, number>;
}

// ── MELI Catalog (Tanda 9) ──
export interface MeliCatalogItem {
  type: string;     // "Catálogo" | "Fuera de catálogo"
  orders: number;
  revenue: number;
  units: number;
}

// ── Union envelope — pieces of the v4 response we consume in Tanda 3 ──
export interface OrdersV4Namespaces {
  profitability?: ProfitabilityData;
  logistics?: LogisticsData;
  segmentation?: SegmentationData;
  coupons?: CouponsData;
  fulfillment?: FulfillmentData;
  cohorts?: CohortsData;
  geography?: GeographyData;
  anomalies?: AnomaliesData;
  sourceCounts?: SourceCounts;
  meliCatalog?: MeliCatalogItem[];
}
