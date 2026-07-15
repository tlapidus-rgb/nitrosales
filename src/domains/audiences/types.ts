// ══════════════════════════════════════════════════════════════
// AUDIENCE SYNC — Types & Interfaces
// ══════════════════════════════════════════════════════════════
// Basado en: Meta Custom Audiences API v21.0 + Google Ads Customer Match API
// Referencia: Triple Whale, Klaviyo, Hightouch, Segment patterns

export type AudiencePlatform = "META" | "GOOGLE" | "BOTH";
export type AudienceStatus = "DRAFT" | "ACTIVE" | "SYNCING" | "PAUSED" | "ERROR";
export type SegmentType = "RFM" | "LTV" | "CUSTOM" | "ALL_CUSTOMERS";
export type SyncFrequency = "HOURLY" | "DAILY" | "WEEKLY" | "MANUAL";
export type SyncAction = "FULL_SYNC" | "INCREMENTAL" | "REMOVE";
export type SyncStatus = "SUCCESS" | "PARTIAL" | "ERROR";

// ─── Segment Criteria ───
// Flexible JSON stored in Audience.segmentCriteria
export interface SegmentCriteria {
  // RFM-based
  rfmSegments?: string[];        // ["Champions", "Leales", "Potenciales", ...]
  // LTV-based
  ltvBuckets?: string[];         // ["high_value", "medium_value", "low_value"]
  minLtv365d?: number;           // Mínimo LTV predicho a 365 días
  maxLtv365d?: number;
  // Order-based
  minOrders?: number;
  maxOrders?: number;
  minSpent?: number;             // Mínimo totalSpent (ARS)
  maxSpent?: number;
  // Recency
  recencyDaysMax?: number;       // Última compra hace máximo X días
  recencyDaysMin?: number;       // Última compra hace mínimo X días
  // Geographic
  cities?: string[];
  states?: string[];
  countries?: string[];
  // Time-based
  firstOrderAfter?: string;      // ISO date
  firstOrderBefore?: string;
  lastOrderAfter?: string;
  lastOrderBefore?: string;
  // Exclusions
  excludeSegments?: string[];    // Excluir estos RFM segments
}

// ─── Meta Custom Audiences API ───
// Ref: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences

export interface MetaUserData {
  EMAIL?: string;     // SHA256 lowercase
  PHONE?: string;     // SHA256 E.164 format
  FN?: string;        // SHA256 lowercase first name
  LN?: string;        // SHA256 lowercase last name
  CT?: string;        // SHA256 lowercase city
  ST?: string;        // SHA256 lowercase state
  ZIP?: string;       // SHA256
  COUNTRY?: string;   // SHA256 lowercase 2-letter code
  EXTERN_ID?: string; // Plain text external ID (no hash)
}

export interface MetaAudiencePayload {
  schema: string[];              // ["EMAIL", "PHONE", "FN", "LN", "COUNTRY"]
  data: string[][];              // [["hash1","hash2",...], ...]
  session_id?: string;           // Random 64-bit int as string
  batch_seq?: number;            // 1-indexed
  last_batch_flag?: boolean;
  estimated_num_total?: number;
}

// ─── Google Customer Match API ───
// Ref: https://developers.google.com/google-ads/api/docs/remarketing/audience-segments/customer-match

export interface GoogleUserIdentifier {
  hashedEmail?: string;          // SHA256 normalized email
  hashedPhoneNumber?: string;    // SHA256 E.164 phone
  addressInfo?: {
    hashedFirstName?: string;    // SHA256
    hashedLastName?: string;     // SHA256
    countryCode?: string;        // ISO 3166-1 alpha-2 (plain)
    postalCode?: string;         // Plain text
  };
}

export interface GoogleOfflineUserDataJob {
  type: "CUSTOMER_MATCH_USER_LIST";
  customerMatchUserListMetadata: {
    userList: string;            // "customers/{customerId}/userLists/{listId}"
    consent: {
      adUserData: "GRANTED" | "DENIED" | "UNSPECIFIED";
      adPersonalization: "GRANTED" | "DENIED" | "UNSPECIFIED";
    };
  };
}

// ─── Sync Results ───

export interface SyncResult {
  success: boolean;
  skipped: boolean;
  reason?: string;
  platform: "META" | "GOOGLE";
  customersSent: number;
  matchRate?: number;
  externalAudienceId?: string;
  durationMs: number;
  batchCount?: number;
  errors?: string[];
}

export interface AudiencePreview {
  totalCustomers: number;
  withEmail: number;
  withPhone: number;
  withName: number;
  withCity: number;
  estimatedMetaMatch: number;    // Estimated based on data completeness
  estimatedGoogleMatch: number;
  segmentBreakdown: Record<string, number>;
  topCities: Array<{ city: string; count: number }>;
  avgOrderValue: number;
  avgLifetimeOrders: number;
}

// ─── Customer for Sync ───

export interface SyncableCustomer {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: Date | null;
  rfmSegment?: string;
  ltvBucket?: string;
  predictedLtv365d?: number;
}
