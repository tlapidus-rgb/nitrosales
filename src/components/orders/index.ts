// ══════════════════════════════════════════════════════════════
// Orders — barrel de componentes (Tanda 3)
// ══════════════════════════════════════════════════════════════
// Todos los componentes nuevos de la refactorización de Orders
// (Session 16). Importados en Tanda 4+ desde page.tsx.
// ══════════════════════════════════════════════════════════════

export { default as OrdersHero } from "./OrdersHero";
export { default as OrdersMasterDetail } from "./OrdersMasterDetail";
export { default as AtencionHoyBlock } from "./AtencionHoyBlock";
export { default as ProfitabilityCard } from "./ProfitabilityCard";
export { default as CohortsCard } from "./CohortsCard";
export { default as LogisticsCard } from "./LogisticsCard";
export { default as SegmentationCard } from "./SegmentationCard";
export { default as CouponsCard } from "./CouponsCard";
export { default as GeographyCard } from "./GeographyCard";
export { default as PlatformScopeBanner } from "./PlatformScopeBanner";
export { default as SourceTabs } from "./SourceTabs";
export { default as SourceSplitBar } from "./SourceSplitBar";
export { default as MercadoLibreCascadeCard } from "./MercadoLibreCascadeCard";
export {
  default as OrderFlagBadge,
  OrderFlagBadgeGroup,
} from "./OrderFlagBadge";

export type {
  ProfitabilityData,
  LogisticsBucket,
  LogisticsData,
  SegmentationBucket,
  SegmentationData,
  CouponItem,
  CouponsData,
  FulfillmentData,
  CohortStats,
  CohortsData,
  GeoBucket,
  GeographyData,
  AnomalyFlag,
  OrderLevelAnomaly,
  PeriodLevelAnomaly,
  AnomaliesData,
  OrdersV4Namespaces,
  PlatformScope,
  SourceCounts,
} from "./types";
