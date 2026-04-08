// ══════════════════════════════════════════════════════════════
// Orders — shared types
// Reflejan el shape que devuelve /api/metrics/orders v4 (Tanda 2)
// Solo los namespaces nuevos de Session 16. Campos legacy del
// endpoint siguen siendo tipados ad-hoc en el page.tsx.
// ══════════════════════════════════════════════════════════════

// ── Profitability (D1 + D2) ──
export interface ProfitabilityData {
  grossRevenue: number;
  netRevenue: number;
  totalCogs: number;
  marginAbs: number;
  marginPct: number;
  ordersWithCost: number;
  ordersTotal: number;
  coveragePct: number;
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
  new: CohortStats;
  returning: CohortStats;
  vip: CohortStats;
  anonymous: CohortStats;
  vipCriteria: {
    minOrders: number;
    minSpentArs: number;
    description: string;
  };
}

// ── Geography (D12) ──
export interface GeoBucket {
  value: string;
  orders: number;
  revenue: number;
}
export interface GeographyData {
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
}
