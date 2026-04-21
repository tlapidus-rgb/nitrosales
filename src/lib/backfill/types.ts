// ══════════════════════════════════════════════════════════════
// BackfillJob types
// ══════════════════════════════════════════════════════════════

export type BackfillStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type BackfillPlatform = "VTEX" | "MERCADOLIBRE" | "META_ADS" | "GOOGLE_ADS";

export interface BackfillJob {
  id: string;
  organizationId: string;
  platform: BackfillPlatform;
  status: BackfillStatus;
  monthsRequested: number;
  fromDate: Date;
  toDate: Date;
  cursor: any;
  processedCount: number;
  totalEstimate: number | null;
  progressPct: number;
  lastError: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  lastChunkAt: Date | null;
  onboardingRequestId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Resultado de procesar un chunk (200 items típicamente)
export interface ChunkResult {
  itemsProcessed: number;
  newCursor: any;
  isComplete: boolean;
  totalEstimate?: number; // opcional, puede refinarse
  error?: string;
}
