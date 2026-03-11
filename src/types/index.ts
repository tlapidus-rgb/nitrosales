// ══════════════════════════════════════════════
// Tipos de datos principales de NitroSales
// ══════════════════════════════════════════════

import { UserRole, Plan, Platform, AdPlatform, InsightType, InsightPriority } from "@prisma/client";

// ─ Sesión de usuario extendida ─
export interface NitroSession {
  user: {
    id: string;
    email: string;
    name: string | null;
    organizationId: string;
    organizationName: string;
    role: UserRole;
  };
}

// ─ KPIs del Dashboard ─
export interface SalesKPIs {
  totalRevenue: number;
  revenueChange: number;           // % cambio vs período anterior
  totalOrders: number;
  ordersChange: number;
  averageOrderValue: number;
  aovChange: number;
  topProducts: ProductPerformance[];
  revenueByChannel: ChannelRevenue[];
  revenueByDayHour: HeatmapData[];
}

export interface MarketingKPIs {
  globalROAS: number;
  roasChange: number;
  metaROAS: number;
  googleROAS: number;
  globalCPA: number;
  cpaChange: number;
  totalAdSpend: number;
  totalAdRevenue: number;
  metaSpend: number;
  googleSpend: number;
  campaignRanking: CampaignPerformance[];
  ctrByPlatform: { meta: number; google: number };
  spendVsBudget: { spent: number; budget: number };
}

export interface FunnelKPIs {
  visitors: number;
  productViews: number;
  addToCarts: number;
  checkoutStarts: number;
  purchases: number;
  conversionRate: number;
  cartAbandonmentRate: number;
  bounceRate: number;
  dropoffs: FunnelDropoff[];
}

export interface CustomerKPIs {
  newCustomers: number;
  returningCustomers: number;
  newVsReturningRatio: number;
  avgPurchaseFrequency: number;
  ltv: number;
  topCities: GeoData[];
  deviceSplit: { mobile: number; desktop: number; tablet: number };
  cohortRetention: CohortData[];
}

export interface WebKPIs {
  totalSessions: number;
  totalUsers: number;
  avgSessionDuration: number;
  bounceRate: number;
  topSources: TrafficSource[];
  topPages: PagePerformance[];
  siteSpeed: number;
  internalSearchTerms: SearchTerm[];
}

// ─ Sub-tipos ─
export interface ProductPerformance {
  id: string;
  name: string;
  revenue: number;
  units: number;
  imageUrl?: string;
}

export interface ChannelRevenue {
  channel: string;
  revenue: number;
  orders: number;
  percentage: number;
}

export interface HeatmapData {
  day: number;       // 0=Lunes, 6=Domingo
  hour: number;      // 0-23
  value: number;
}

export interface CampaignPerformance {
  id: string;
  name: string;
  platform: AdPlatform;
  roas: number;
  spend: number;
  revenue: number;
  cpa: number;
  status: string;
}

export interface FunnelDropoff {
  from: string;
  to: string;
  dropoffRate: number;
}

export interface GeoData {
  location: string;
  customers: number;
  revenue: number;
}

export interface CohortData {
  cohort: string;       // "2024-01"
  month0: number;       // % que volvió
  month1: number;
  month2: number;
  month3: number;
}

export interface TrafficSource {
  source: string;
  medium: string;
  sessions: number;
  conversions: number;
  revenue: number;
}

export interface PagePerformance {
  path: string;
  pageViews: number;
  avgTimeOnPage: number;
  bounceRate: number;
  conversionRate: number;
}

export interface SearchTerm {
  term: string;
  count: number;
}

// ─ Bot / Insights ─
export interface InsightData {
  id: string;
  type: InsightType;
  priority: InsightPriority;
  title: string;
  description: string;
  action: string;
  metric?: string;
  metricValue?: number;
  metricDelta?: number;
  isRead: boolean;
  createdAt: Date;
}

export interface BotChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: Date;
}

// ─ Configuración de conexiones ─
export interface ConnectionConfig {
  platform: Platform;
  displayName: string;
  description: string;
  requiredFields: ConnectionField[];
  icon: string;
}

export interface ConnectionField {
  key: string;
  label: string;
  type: "text" | "password" | "textarea" | "file";
  placeholder: string;
  helpText?: string;
}
